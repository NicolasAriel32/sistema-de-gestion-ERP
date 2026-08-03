import { describe, expect, it } from 'vitest';

import { diasEntre, formatearFecha, hoyIso, sumarDiasIso } from './fechas';

describe('hoyIso', () => {
  it('usa el día calendario de Buenos Aires, no el de UTC', () => {
    // 2026-08-04 a las 02:00 UTC son las 23:00 del 3 de agosto en Argentina.
    const nocheEnArgentina = new Date('2026-08-04T02:00:00Z');
    expect(hoyIso(nocheEnArgentina)).toBe('2026-08-03');
  });

  it('coincide con UTC durante el día', () => {
    expect(hoyIso(new Date('2026-08-03T15:00:00Z'))).toBe('2026-08-03');
  });
});

describe('sumarDiasIso', () => {
  it('suma días dentro del mismo mes', () => {
    expect(sumarDiasIso('2026-08-03', 10)).toBe('2026-08-13');
  });

  it('cruza el fin de mes', () => {
    expect(sumarDiasIso('2026-08-25', 10)).toBe('2026-09-04');
  });

  it('cruza el fin de año', () => {
    expect(sumarDiasIso('2026-12-28', 10)).toBe('2027-01-07');
  });

  it('maneja años bisiestos', () => {
    expect(sumarDiasIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDiasIso('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('acepta días negativos', () => {
    expect(sumarDiasIso('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('formatearFecha', () => {
  it('muestra la fecha como se lee en Argentina', () => {
    expect(formatearFecha('2026-08-03')).toBe('03/08/2026');
  });

  it('tolera un timestamp completo', () => {
    expect(formatearFecha('2026-08-03T14:30:00Z')).toBe('03/08/2026');
  });

  it('devuelve un guión cuando no hay fecha', () => {
    expect(formatearFecha(null)).toBe('—');
    expect(formatearFecha('')).toBe('—');
    expect(formatearFecha('cualquier cosa')).toBe('—');
  });
});

describe('diasEntre', () => {
  it('cuenta los días de diferencia', () => {
    expect(diasEntre('2026-08-03', '2026-08-13')).toBe(10);
    expect(diasEntre('2026-08-13', '2026-08-03')).toBe(-10);
    expect(diasEntre('2026-08-03', '2026-08-03')).toBe(0);
  });

  it('no se corre con el cambio de horario', () => {
    expect(diasEntre('2026-01-01', '2026-12-31')).toBe(364);
  });
});
