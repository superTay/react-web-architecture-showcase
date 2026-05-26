// ============================================================
// utils/fiscal.ts — Centralized Spanish fiscal utilities
// ============================================================
// VAT (IVA) / withholding (IRPF) math, cent-level rounding, currency
// formatting and NIF/NIE/CIF validation for the whole frontend.
// Single source of truth — replaces the duplicated formulas that used
// to live scattered across API clients, form components and hooks.
//
// Convention: 2 decimals via `Math.round(x*100)/100`.
// Mixed VAT (several rates in the same invoice) is NOT supported: the
// app refuses with a clear message via `validarIVAHomogeneo` instead of
// silently computing a wrong total (see "fail-closed" note below).
// ============================================================

/** Rounds to 2 decimals (cents). Stable for accumulated sums. */
export const redondear2 = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

/** VAT amount: base × pct / 100, rounded to cents. */
export const calcularIVA = (base: number, pct: number): number => {
  if (!Number.isFinite(base) || !Number.isFinite(pct)) return 0;
  return redondear2(base * pct / 100);
};

/** IRPF withholding: base × pct / 100, rounded to cents. */
export const calcularIRPF = (base: number, pct: number): number => {
  if (!Number.isFinite(base) || !Number.isFinite(pct)) return 0;
  return redondear2(base * pct / 100);
};

// Module-level cached formatter (Intl.NumberFormat is expensive to build).
const EUR_FORMATTER = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

/** Formats an amount in euros with es-ES locale. */
export const formatEuros = (n: number): string => {
  if (!Number.isFinite(n)) return EUR_FORMATTER.format(0);
  return EUR_FORMATTER.format(n);
};

// ------------------------------------------------------------
// NIF / NIE / CIF validation (Spain).
// ------------------------------------------------------------
// NIF (individual): 8 digits + control letter (modulo 23).
// NIE: X/Y/Z + 7 digits + control letter.
// CIF (legal entity): letter + 7 digits + control digit/letter.
// (Lax control validation: checks length and shape. Full mathematical
// check-letter verification would require lookup tables.)
const NIF_RE = /^[0-9]{8}[A-HJ-NP-TV-Z]$/i;
const NIE_RE = /^[XYZ][0-9]{7}[A-HJ-NP-TV-Z]$/i;
const CIF_RE = /^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/i;

/** True if the string looks like a valid Spanish NIF/NIE/CIF (by format). */
export const validateNif = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  const v = raw.toUpperCase().replace(/[\s\-.]/g, '');
  return NIF_RE.test(v) || NIE_RE.test(v) || CIF_RE.test(v);
};

// ------------------------------------------------------------
// Homogeneous VAT (fail-closed)
// ------------------------------------------------------------
// The system is NOT designed to mix VAT rates within a single invoice.
// If we tried, the totals computation would be silently wrong. Instead
// of implementing multi-rate support (high complexity for a minority
// case), we detect the situation and reject it with a clear message.
//
// Rules:
// - Lines without `porcentaje_iva` mean "use the default" and do NOT
//   count as a distinct rate.
// - Lines with the SAME `porcentaje_iva` → ok.
// - Lines with TWO OR MORE distinct `porcentaje_iva` → error.
// ------------------------------------------------------------

export type IvaHomogeneoResult =
  | { ok: true; pct: number | null }
  | { ok: false; reason: 'mixed'; pcts: number[] };

interface ConceptoIva {
  porcentaje_iva?: number | null;
}

export function validarIVAHomogeneo(conceptos: ConceptoIva[]): IvaHomogeneoResult {
  const pcts = Array.from(
    new Set(
      conceptos
        .map(c => c.porcentaje_iva)
        .filter((p): p is number => typeof p === 'number' && Number.isFinite(p)),
    ),
  );
  if (pcts.length === 0) return { ok: true, pct: null };
  if (pcts.length === 1) return { ok: true, pct: pcts[0] };
  return { ok: false, reason: 'mixed', pcts: pcts.sort((a, b) => a - b) };
}

/** User-friendly message for the mixed-VAT case. */
export function mensajeIvaMixto(pcts: number[]): string {
  const lista = pcts.map(p => `${p}%`).join(' y ');
  return `Esta factura tiene tipos de IVA mezclados (${lista}). El sistema no soporta facturas con varios tipos de IVA. Sepáralas en facturas distintas, una por cada tipo.`;
}

// ------------------------------------------------------------
// Invoice totals (fail-closed orchestration)
// ------------------------------------------------------------
// Pure function: given line items, a default VAT rate and an IRPF rate,
// returns base / VAT / withholding / total. If VAT is mixed it returns
// zeros + a human-readable `ivaError` so the UI can block the submit
// button instead of emitting a fiscally wrong invoice.
// ------------------------------------------------------------

export interface TotalesFactura {
  base_imponible: number;
  cuota_iva: number;
  cuota_irpf: number;
  total_factura: number;
  ivaError: string | null;
}

export function calcularTotalesFactura(
  conceptos: Array<{ precio_unitario: number; cantidad: number; porcentaje_iva?: number }>,
  porcentaje_iva_defecto = 21,
  porcentaje_irpf = 0,
): TotalesFactura {
  const validacion = validarIVAHomogeneo(conceptos);
  if (validacion.ok === false) {
    return {
      base_imponible: 0,
      cuota_iva: 0,
      cuota_irpf: 0,
      total_factura: 0,
      ivaError: mensajeIvaMixto(validacion.pcts),
    };
  }
  const pct_iva_efectivo = validacion.pct ?? porcentaje_iva_defecto;

  const base_imponible = conceptos.reduce(
    (sum, c) => sum + c.precio_unitario * c.cantidad,
    0,
  );
  const cuota_iva = calcularIVA(base_imponible, pct_iva_efectivo);
  const cuota_irpf = calcularIRPF(base_imponible, porcentaje_irpf);
  const total_factura = redondear2(base_imponible + cuota_iva - cuota_irpf);

  return {
    base_imponible: redondear2(base_imponible),
    cuota_iva,
    cuota_irpf,
    total_factura,
    ivaError: null,
  };
}
