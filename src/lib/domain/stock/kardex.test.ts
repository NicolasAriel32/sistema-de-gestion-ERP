import { describe, expect, it } from 'vitest';

import {
  calcularKardex,
  estaBajoMinimo,
  haySaldoSuficiente,
  kardexCierra,
  saldoDesdeMovimientos,
  saldosPorDeposito,
  type MovimientoKardex,
} from './kardex';

function mov(
  cantidad: number,
  extra: Partial<MovimientoKardex> = {},
): MovimientoKardex {
  return {
    movimientoId: extra.movimientoId ?? crypto.randomUUID(),
    fecha: extra.fecha ?? '2026-08-01T10:00:00.000Z',
    tipo: extra.tipo ?? 'AJUSTE',
    depositoId: extra.depositoId ?? 'dep-1',
    depositoNombre: extra.depositoNombre ?? 'Central',
    cantidad,
    costoUnitario: extra.costoUnitario ?? 100,
    comprobanteId: extra.comprobanteId ?? null,
    comprobante: extra.comprobante ?? null,
    motivo: extra.motivo ?? null,
  };
}

describe('calcularKardex', () => {
  it('arrastra el saldo renglón a renglón', () => {
    const renglones = calcularKardex([mov(100), mov(-30), mov(-20), mov(5)]);

    expect(renglones.map((r) => r.saldo)).toEqual([100, 70, 50, 55]);
  });

  it('separa entradas de salidas sin perder el signo del movimiento', () => {
    const renglones = calcularKardex([mov(40), mov(-15)]);
    const entrada = renglones[0]!;
    const salida = renglones[1]!;

    expect(entrada.entrada).toBe(40);
    expect(entrada.salida).toBe(0);
    expect(salida.entrada).toBe(0);
    expect(salida.salida).toBe(15);
    expect(salida.cantidad).toBe(-15);
  });

  it('parte de un saldo inicial cuando la ventana está paginada', () => {
    const renglones = calcularKardex([mov(-10), mov(-5)], 200);

    expect(renglones.map((r) => r.saldo)).toEqual([190, 185]);
  });

  it('devuelve lista vacía sin romper', () => {
    expect(calcularKardex([])).toEqual([]);
  });

  it('no arrastra error de punto flotante con cantidades fraccionarias', () => {
    // 0.1 + 0.2 en punto flotante da 0.30000000000000004.
    const renglones = calcularKardex([mov(0.1), mov(0.2)]);

    expect(renglones.at(-1)?.saldo).toBe(0.3);
  });

  it('mantiene los 4 decimales de NUMERIC(15,4)', () => {
    const renglones = calcularKardex([mov(1.2345), mov(2.5555)]);

    expect(renglones.at(-1)?.saldo).toBe(3.79);
  });
});

describe('invariante: el kardex cierra contra la suma de movimientos', () => {
  it('el último saldo es igual a la suma de las cantidades', () => {
    const movimientos = [mov(120), mov(-8), mov(-12), mov(30), mov(-45)];
    const renglones = calcularKardex(movimientos);

    expect(renglones.at(-1)?.saldo).toBe(saldoDesdeMovimientos(movimientos));
    expect(kardexCierra(renglones)).toBe(true);
  });

  it('cierra también partiendo de un saldo inicial', () => {
    const movimientos = [mov(-3.5), mov(10.25)];
    const renglones = calcularKardex(movimientos, 50);

    expect(renglones.at(-1)?.saldo).toBe(56.75);
    expect(kardexCierra(renglones, 50)).toBe(true);
  });

  it('un kardex vacío con saldo inicial cero cierra', () => {
    expect(kardexCierra([], 0)).toBe(true);
  });

  it('detecta un kardex adulterado', () => {
    const renglones = calcularKardex([mov(100), mov(-40)]);
    const adulterado = [...renglones];
    adulterado[1] = { ...renglones[1]!, saldo: 999 };

    expect(kardexCierra(adulterado)).toBe(false);
  });

  it('sobrevive a 500 movimientos alternados sin desviarse', () => {
    const movimientos = Array.from({ length: 500 }, (_, i) =>
      mov(i % 2 === 0 ? 3.33 : -1.11),
    );
    const renglones = calcularKardex(movimientos);

    expect(kardexCierra(renglones)).toBe(true);
    expect(renglones.at(-1)?.saldo).toBe(saldoDesdeMovimientos(movimientos));
  });
});

describe('saldosPorDeposito', () => {
  it('agrupa por depósito y ordena alfabéticamente', () => {
    const saldos = saldosPorDeposito([
      mov(100, { depositoId: 'd2', depositoNombre: 'Sucursal' }),
      mov(50, { depositoId: 'd1', depositoNombre: 'Central' }),
      mov(-20, { depositoId: 'd2', depositoNombre: 'Sucursal' }),
    ]);

    expect(saldos).toEqual([
      { depositoId: 'd1', depositoNombre: 'Central', saldo: 50 },
      { depositoId: 'd2', depositoNombre: 'Sucursal', saldo: 80 },
    ]);
  });

  it('una transferencia deja el total global intacto', () => {
    // Dos movimientos espejo: sale de Central, entra en Sucursal.
    const saldos = saldosPorDeposito([
      mov(100, { depositoId: 'd1', depositoNombre: 'Central' }),
      mov(-30, { depositoId: 'd1', depositoNombre: 'Central', tipo: 'TRANSFERENCIA_SALIDA' }),
      mov(30, { depositoId: 'd2', depositoNombre: 'Sucursal', tipo: 'TRANSFERENCIA_ENTRADA' }),
    ]);

    expect(saldos.reduce((acc, s) => acc + s.saldo, 0)).toBe(100);
  });
});

describe('estaBajoMinimo', () => {
  it('marca el producto cuando el saldo perfora el mínimo', () => {
    expect(estaBajoMinimo(4, 10)).toBe(true);
  });

  it('el saldo exactamente igual al mínimo no está bajo mínimo', () => {
    expect(estaBajoMinimo(10, 10)).toBe(false);
  });

  it('un mínimo en cero desactiva la alerta', () => {
    expect(estaBajoMinimo(0, 0)).toBe(false);
  });

  it('un saldo negativo siempre está bajo mínimo si hay mínimo definido', () => {
    expect(estaBajoMinimo(-5, 1)).toBe(true);
  });
});

describe('haySaldoSuficiente', () => {
  it('bloquea la salida cuando no alcanza y el producto no lo permite', () => {
    expect(haySaldoSuficiente(3, 5, false)).toBe(false);
  });

  it('permite la salida exacta', () => {
    expect(haySaldoSuficiente(5, 5, false)).toBe(true);
  });

  it('permite vender sin stock cuando el producto lo habilita', () => {
    expect(haySaldoSuficiente(0, 10, true)).toBe(true);
  });

  it('compara con precisión decimal, no con punto flotante', () => {
    // Sumar 0.1 y 0.2 en punto flotante daría 0.30000000000000004 y
    // bloquearía una salida que en realidad alcanza justo.
    const saldo = saldoDesdeMovimientos([{ cantidad: 0.1 }, { cantidad: 0.2 }]);

    expect(saldo).toBe(0.3);
    expect(haySaldoSuficiente(saldo, 0.3, false)).toBe(true);
  });

  it('acepta cantidades como string, que es como vienen de Postgres', () => {
    expect(haySaldoSuficiente('12.5000', '12.5', false)).toBe(true);
    expect(haySaldoSuficiente('12.4999', '12.5', false)).toBe(false);
  });
});
