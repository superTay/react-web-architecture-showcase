import { describe, it, expect } from 'vitest';
import { normalizeIdentifier, pickClientIdentifier } from '../utils/normalization';

// ============================================================
// Critical tests for the JS/SQL mirror.
// ------------------------------------------------------------
// The SQL functions `normalize_identifier` and `pick_client_identifier`
// are the source of truth. If these JS helpers diverge, the frontend
// would detect different collisions than the DB → duplicate client
// records. These tests pin the JS-side contract.
// ============================================================

describe('normalizeIdentifier', () => {
  it('UPPER + strip espacios/guiones/puntos', () => {
    expect(normalizeIdentifier('12345678z')).toBe('12345678Z');
    expect(normalizeIdentifier(' 12.345.678-Z ')).toBe('12345678Z');
    expect(normalizeIdentifier('a-b.c d')).toBe('ABCD');
  });
  it('null/undefined/empty → null', () => {
    expect(normalizeIdentifier(null)).toBe(null);
    expect(normalizeIdentifier(undefined)).toBe(null);
    expect(normalizeIdentifier('')).toBe(null);
    expect(normalizeIdentifier('   ')).toBe(null);
    expect(normalizeIdentifier('  ...  ')).toBe(null);
  });
  it('respeta caracteres alfanuméricos no separadores', () => {
    expect(normalizeIdentifier('test123')).toBe('TEST123');
  });
});

describe('pickClientIdentifier — cascada de prioridad', () => {
  it('NIF gana sobre todo', () => {
    expect(
      pickClientIdentifier({
        nif: '12345678Z',
        email: 'foo@bar.com',
        telefono: '600600600',
        nombre: 'Pepe',
        cp: '28001',
      }),
    ).toBe('nif:12345678Z');
  });

  it('Email gana cuando no hay NIF', () => {
    expect(
      pickClientIdentifier({
        email: 'Foo@BAR.com',
        telefono: '600600600',
        nombre: 'Pepe',
      }),
    ).toBe('email:foo@bar.com');
  });

  it('Teléfono gana cuando no hay NIF ni email', () => {
    expect(
      pickClientIdentifier({
        telefono: ' 600 600 600 ',
        nombre: 'Pepe',
      }),
    ).toBe('tel:600600600');
  });

  it('Nombre+CP cuando no hay NIF/email/teléfono', () => {
    expect(
      pickClientIdentifier({
        nombre: 'Juan Pérez',
        cp: '08001',
      }),
    ).toBe('nom:JUANPÉREZ:08001');
  });

  it('Nombre solo (sin CP) → el sufijo queda vacío', () => {
    expect(
      pickClientIdentifier({ nombre: 'María Gómez' }),
    ).toBe('nom:MARÍAGÓMEZ:');
  });

  it('Sin nada útil → null', () => {
    expect(pickClientIdentifier({})).toBe(null);
    expect(pickClientIdentifier({ nif: '', email: '', telefono: '', nombre: '' })).toBe(null);
  });

  it('NIF vacío cae al siguiente', () => {
    expect(
      pickClientIdentifier({
        nif: '',
        email: 'foo@bar.com',
      }),
    ).toBe('email:foo@bar.com');
  });

  it('Email solo whitespace cae al siguiente', () => {
    expect(
      pickClientIdentifier({
        email: '   ',
        telefono: '600600600',
      }),
    ).toBe('tel:600600600');
  });
});
