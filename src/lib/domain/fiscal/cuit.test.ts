import { describe, expect, it } from 'vitest';

import { esCuitValido, formatearCuit, soloDigitos } from './cuit';

describe('esCuitValido', () => {
  it('acepta CUIT con dígito verificador correcto', () => {
    expect(esCuitValido('20-12345678-6')).toBe(true);
    expect(esCuitValido('27-12345678-0')).toBe(true);
    expect(esCuitValido('30-50000000-3')).toBe(true);
  });

  it('acepta con o sin separadores', () => {
    expect(esCuitValido('20123456786')).toBe(true);
    expect(esCuitValido('20.12345678.6')).toBe(true);
    expect(esCuitValido(' 20-12345678-6 ')).toBe(true);
  });

  it('cubre la corrección del dígito 10 → 9', () => {
    // suma % 11 == 1  ⇒  11 - 1 = 10  ⇒  se corrige a 9
    expect(esCuitValido('20-00000001-9')).toBe(true);
    expect(esCuitValido('20-00000001-0')).toBe(false);
  });

  it('rechaza dígito verificador incorrecto', () => {
    expect(esCuitValido('20-12345678-5')).toBe(false);
    expect(esCuitValido('27-12345678-1')).toBe(false);
  });

  it('rechaza longitudes inválidas', () => {
    expect(esCuitValido('30-5000000-3')).toBe(false); // 10 dígitos
    expect(esCuitValido('201234567890')).toBe(false); // 12 dígitos
    expect(esCuitValido('')).toBe(false);
  });

  it('rechaza no-numéricos y nulos', () => {
    expect(esCuitValido('abcdefghijk')).toBe(false);
    expect(esCuitValido(null)).toBe(false);
    expect(esCuitValido(undefined)).toBe(false);
  });
});

describe('soloDigitos', () => {
  it('extrae únicamente 0-9', () => {
    expect(soloDigitos('20-12345678-6')).toBe('20123456786');
    expect(soloDigitos('CUIT: 20 12345678 6')).toBe('20123456786');
  });
});

describe('formatearCuit', () => {
  it('formatea 11 dígitos', () => {
    expect(formatearCuit('20123456786')).toBe('20-12345678-6');
  });
  it('devuelve el valor tal cual si no son 11 dígitos', () => {
    expect(formatearCuit('123')).toBe('123');
  });
});
