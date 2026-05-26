-- ============================================================
-- reserve_invoice_number — atomic invoice-number reservation
-- ============================================================
-- Spanish invoices must be numbered with a strict, gap-free, per-series
-- correlative sequence. A gap or a duplicate is a tax infringement, so
-- this MUST be correct under concurrency — it cannot live in app code
-- where two parallel requests could read the same counter.
--
-- Strategy: take a row-level FOR UPDATE lock on the series row to
-- serialize concurrent callers, auto-create the series on first use, and
-- record the reservation in an audit log so that — if a later INSERT
-- fails — the gap is documented and explainable to the tax authority.
--
-- (Sanitized extract from a private production project. Table/column
-- names are the generic invoicing concepts they model.)
-- ============================================================

CREATE OR REPLACE FUNCTION reserve_invoice_number(
  p_user_id text,
  p_serie text DEFAULT 'A',
  p_fiscal_year integer DEFAULT EXTRACT(YEAR FROM now())::integer
)
RETURNS TABLE(numero_factura text, reservation_id uuid)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next integer;
  v_initial integer;
  v_serie_id uuid;
  v_reservation_id uuid;
BEGIN
  -- Exclusive lock on the series row → serializes concurrent access.
  SELECT id, current_number, initial_number
  INTO v_serie_id, v_next, v_initial
  FROM public.invoice_series
  WHERE user_id = p_user_id
    AND serie_code = p_serie
    AND fiscal_year = p_fiscal_year
  FOR UPDATE;

  -- Auto-create the series if it does not exist yet.
  IF v_serie_id IS NULL THEN
    INSERT INTO public.invoice_series (user_id, serie_code, serie_type, fiscal_year, description)
    VALUES (
      p_user_id,
      p_serie,
      CASE WHEN p_serie = 'R' THEN 'rectificativa' ELSE 'normal' END,
      p_fiscal_year,
      CASE WHEN p_serie = 'R' THEN 'Rectifying invoices' ELSE 'Series ' || p_serie END
    )
    RETURNING id, current_number, initial_number
    INTO v_serie_id, v_next, v_initial;
  END IF;

  -- Respect a manually configured initial number (migration support).
  IF v_next < v_initial THEN
    v_next := v_initial;
  END IF;

  v_next := v_next + 1;

  UPDATE public.invoice_series
  SET current_number = v_next, updated_at = now()
  WHERE id = v_serie_id;

  -- Format: SERIE-0001
  numero_factura := p_serie || '-' || LPAD(v_next::text, 4, '0');
  v_reservation_id := gen_random_uuid();

  -- Record the reservation so any later gap is documented.
  INSERT INTO public.audit_log (id, user_id, entity_type, entity_id, action, new_state)
  VALUES (
    v_reservation_id,
    p_user_id,
    'invoice_number',
    v_serie_id::text,
    'RESERVE',
    jsonb_build_object(
      'numero_factura', numero_factura,
      'serie', p_serie,
      'fiscal_year', p_fiscal_year,
      'counter_value', v_next
    )
  );

  reservation_id := v_reservation_id;
  RETURN NEXT;
END;
$$;
