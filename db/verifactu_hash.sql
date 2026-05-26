-- ============================================================
-- verifactu_hash — chained SHA-256 hash for invoice records
-- ============================================================
-- Spain's VeriFactu regulation (RD 1007/2023) requires each invoice
-- record to carry a SHA-256 "fingerprint" computed over a canonical,
-- pipe-delimited string that INCLUDES the previous invoice's hash. This
-- chains the records together: tampering with one invoice breaks every
-- hash downstream, making the ledger verifiably append-only.
--
-- Marked IMMUTABLE: same inputs always yield the same hash, so Postgres
-- can cache/inline it safely.
--
-- (Sanitized extract from a private production project.)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION verifactu_hash(
  p_nif_emisor text,
  p_numero_factura text,
  p_fecha_emision text,
  p_tipo_factura text,
  p_base_imponible numeric,
  p_cuota_total numeric,
  p_hash_anterior text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_input text;
BEGIN
  -- Canonical, pipe-delimited input:
  -- NIF|Number|IssueDate|Type|TaxAmount|TotalAmount|PreviousHash
  v_input := COALESCE(p_nif_emisor, '') || '|'
    || COALESCE(p_numero_factura, '') || '|'
    || COALESCE(p_fecha_emision, '') || '|'
    || COALESCE(p_tipo_factura, 'F1') || '|'
    || TRIM(TO_CHAR(COALESCE(p_cuota_total, 0), 'FM999999999999.00')) || '|'
    || TRIM(TO_CHAR(COALESCE(p_base_imponible, 0) + COALESCE(p_cuota_total, 0), 'FM999999999999.00')) || '|'
    || COALESCE(p_hash_anterior, '');

  RETURN encode(digest(v_input, 'sha256'), 'hex');
END;
$$;
