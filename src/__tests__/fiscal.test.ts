import { describe, it, expect } from 'vitest';
import {
  redondear2,
  calcularIVA,
  calcularIRPF,
  formatEuros,
  validateNif,
  validarIVAHomogeneo,
  mensajeIvaMixto,
  calcularTotalesFactura,
} from '../utils/fiscal';

describe('redondear2', () => {
  it('redondea positivos a 2 decimales', () => {
    expect(redondear2(10.005)).toBe(10.01);
    expect(redondear2(10.004)).toBe(10);
    expect(redondear2(0.1 + 0.2)).toBe(0.3);
  });
  it('soporta cero y negativos', () => {
    expect(redondear2(0)).toBe(0);
    // -0.005 redondea a -0 (Math.round(-0.5) = 0 with -0 sign). Es ≡ 0 numéricamente.
    expect(Math.abs(redondear2(-0.005))).toBe(0);
    expect(redondear2(-1.234)).toBe(-1.23);
  });
  it('devuelve 0 ante NaN/Infinity', () => {
    expect(redondear2(NaN)).toBe(0);
    expect(redondear2(Infinity)).toBe(0);
  });
});

describe('calcularIVA / calcularIRPF', () => {
  it('aplica el porcentaje correcto y redondea a céntimos', () => {
    expect(calcularIVA(100, 21)).toBe(21);
    expect(calcularIVA(123.45, 10)).toBe(12.35);
    expect(calcularIRPF(1000, 15)).toBe(150);
    expect(calcularIRPF(1000, 7)).toBe(70);
  });
  it('soporta cero y NaN sin reventar', () => {
    expect(calcularIVA(0, 21)).toBe(0);
    expect(calcularIVA(100, 0)).toBe(0);
    expect(calcularIVA(NaN, 21)).toBe(0);
    expect(calcularIVA(100, NaN)).toBe(0);
  });
});

describe('formatEuros', () => {
  // jsdom usa Intl con CLDR limitado: el separador de miles puede no aparecer.
  // El test verifica el separador decimal coma y el símbolo €, que sí existen.
  it('formatea con locale es-ES y 2 decimales', () => {
    expect(formatEuros(1234.5)).toMatch(/1\.?234,50\s*€/);
    expect(formatEuros(0)).toMatch(/0,00\s*€/);
  });
  it('soporta negativos y NaN (devuelve 0)', () => {
    expect(formatEuros(-100)).toMatch(/-100,00\s*€/);
    expect(formatEuros(NaN)).toMatch(/0,00\s*€/);
  });
});

describe('validateNif', () => {
  it('acepta NIF válido (8 dígitos + letra)', () => {
    expect(validateNif('12345678Z')).toBe(true);
    expect(validateNif('00000000T')).toBe(true);
  });
  it('acepta NIE válido (X/Y/Z + 7 dígitos + letra)', () => {
    expect(validateNif('X1234567L')).toBe(true);
    expect(validateNif('Y1234567X')).toBe(true);
  });
  it('acepta CIF válido (letra + 7 dígitos + control)', () => {
    expect(validateNif('A12345678')).toBe(true);
    expect(validateNif('B1234567C')).toBe(true);
  });
  it('rechaza vacío, malformado y null/undefined', () => {
    expect(validateNif('')).toBe(false);
    expect(validateNif(null)).toBe(false);
    expect(validateNif(undefined)).toBe(false);
    expect(validateNif('123')).toBe(false);
    expect(validateNif('XXXXXXXXX')).toBe(false);
  });
  it('normaliza espacios/guiones/puntos', () => {
    expect(validateNif('12.345.678-Z')).toBe(true);
    expect(validateNif('  12345678Z  ')).toBe(true);
  });
});

describe('validarIVAHomogeneo', () => {
  it('lista vacía → ok con pct null (usar defecto)', () => {
    const r = validarIVAHomogeneo([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pct).toBe(null);
  });
  it('todas sin porcentaje → ok con pct null', () => {
    const r = validarIVAHomogeneo([{ }, { porcentaje_iva: undefined }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pct).toBe(null);
  });
  it('un solo tipo → ok con ese pct', () => {
    const r = validarIVAHomogeneo([
      { porcentaje_iva: 21 },
      { porcentaje_iva: 21 },
      { porcentaje_iva: 21 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pct).toBe(21);
  });
  it('mezcla sin valor + valor único → ok (ignora los sin valor)', () => {
    const r = validarIVAHomogeneo([
      { porcentaje_iva: 10 },
      { },
      { porcentaje_iva: 10 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pct).toBe(10);
  });
  it('dos tipos distintos → fail con ambos pcts ordenados', () => {
    const r = validarIVAHomogeneo([
      { porcentaje_iva: 21 },
      { porcentaje_iva: 10 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.pcts).toEqual([10, 21]);
    }
  });
  it('tres tipos (incluyendo 0) → fail', () => {
    const r = validarIVAHomogeneo([
      { porcentaje_iva: 21 },
      { porcentaje_iva: 0 },
      { porcentaje_iva: 10 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.pcts).toEqual([0, 10, 21]);
    }
  });
  it('NaN se ignora (no cuenta como tipo)', () => {
    const r = validarIVAHomogeneo([
      { porcentaje_iva: 21 },
      { porcentaje_iva: NaN },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pct).toBe(21);
  });
});

describe('mensajeIvaMixto', () => {
  it('genera mensaje con la lista de pcts', () => {
    const msg = mensajeIvaMixto([10, 21]);
    expect(msg).toContain('10%');
    expect(msg).toContain('21%');
    expect(msg.toLowerCase()).toContain('mezclados');
  });
});

describe('calcularTotalesFactura (integración con fail-closed)', () => {
  it('factura con un solo IVA — calcula totales correctos', () => {
    const r = calcularTotalesFactura(
      [
        { precio_unitario: 100, cantidad: 1, porcentaje_iva: 21 },
        { precio_unitario: 50, cantidad: 2, porcentaje_iva: 21 },
      ],
      21,
      0,
    );
    expect(r.ivaError).toBe(null);
    expect(r.base_imponible).toBe(200);
    expect(r.cuota_iva).toBe(42);
    expect(r.cuota_irpf).toBe(0);
    expect(r.total_factura).toBe(242);
  });

  it('factura sin porcentaje_iva en líneas — usa el defecto', () => {
    const r = calcularTotalesFactura(
      [
        { precio_unitario: 100, cantidad: 1 },
        { precio_unitario: 100, cantidad: 1 },
      ],
      10,
      0,
    );
    expect(r.ivaError).toBe(null);
    expect(r.base_imponible).toBe(200);
    expect(r.cuota_iva).toBe(20);
    expect(r.total_factura).toBe(220);
  });

  it('factura con IRPF 15% — descuenta del total', () => {
    const r = calcularTotalesFactura(
      [{ precio_unitario: 1000, cantidad: 1, porcentaje_iva: 21 }],
      21,
      15,
    );
    expect(r.ivaError).toBe(null);
    expect(r.base_imponible).toBe(1000);
    expect(r.cuota_iva).toBe(210);
    expect(r.cuota_irpf).toBe(150);
    expect(r.total_factura).toBe(1060);
  });

  it('factura con IVA mixto 10+21 — fail-closed: ivaError + totales en cero', () => {
    const r = calcularTotalesFactura(
      [
        { precio_unitario: 100, cantidad: 1, porcentaje_iva: 21 },
        { precio_unitario: 100, cantidad: 1, porcentaje_iva: 10 },
      ],
      21,
      0,
    );
    expect(r.ivaError).not.toBe(null);
    expect(r.ivaError).toContain('10%');
    expect(r.ivaError).toContain('21%');
    expect(r.base_imponible).toBe(0);
    expect(r.cuota_iva).toBe(0);
    expect(r.total_factura).toBe(0);
  });

  it('ISP (0%) único — calcula sin error', () => {
    const r = calcularTotalesFactura(
      [{ precio_unitario: 500, cantidad: 1, porcentaje_iva: 0 }],
      21,
      0,
    );
    expect(r.ivaError).toBe(null);
    expect(r.cuota_iva).toBe(0);
    expect(r.total_factura).toBe(500);
  });
});
