/**
 * Kardex: historial de movimientos con saldo corrido.
 *
 * La base ya devuelve el saldo corrido calculado con una window function
 * (`kardex_producto`). Este módulo existe por dos razones:
 *
 *   1. Recalcular el saldo del lado del cliente para poder VERIFICARLO
 *      contra el que vino de Postgres. Si los dos no coinciden, algo se
 *      rompió y hay que enterarse, no mostrarlo igual.
 *   2. Ser función pura y testeable: el criterio de aceptación de la fase
 *      dice que el saldo calculado desde los movimientos tiene que
 *      coincidir siempre con el kardex, y eso se demuestra con un test,
 *      no con una afirmación.
 *
 * Las cantidades usan `decimal.js` igual que el dinero. Un stock de
 * 0.1 + 0.2 kilos en punto flotante da 0.30000000000000004, y eso
 * termina siendo un kardex que no cierra.
 */

import Decimal from 'decimal.js';

import type { TipoMovimientoStock } from './schema';

const CERO = new Decimal(0);

/** Cantidades: 4 decimales, espejo de NUMERIC(15,4). */
function r4(valor: Decimal): Decimal {
  return valor.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export type MovimientoKardex = {
  movimientoId: string;
  fecha: string;
  tipo: TipoMovimientoStock;
  depositoId: string;
  depositoNombre: string;
  /** Positivo entrada, negativo salida. */
  cantidad: number;
  costoUnitario: number;
  comprobanteId: string | null;
  comprobante: string | null;
  motivo: string | null;
};

export type RenglonKardex = MovimientoKardex & {
  entrada: number;
  salida: number;
  /** Saldo acumulado hasta este renglón inclusive. */
  saldo: number;
};

/**
 * Arma el kardex a partir de los movimientos crudos, en el orden en que
 * vienen. El orden importa: es el que define el saldo corrido, y tiene
 * que ser el mismo que usa la base (fecha, creado_en, id).
 *
 * `saldoInicial` permite paginar sin perder el arrastre: se le pasa el
 * saldo previo a la ventana visible.
 */
export function calcularKardex(
  movimientos: readonly MovimientoKardex[],
  saldoInicial: number | string = 0,
): RenglonKardex[] {
  let saldo = new Decimal(saldoInicial);

  return movimientos.map((m) => {
    const cantidad = r4(new Decimal(m.cantidad));
    saldo = r4(saldo.plus(cantidad));

    return {
      ...m,
      entrada: cantidad.greaterThan(0) ? cantidad.toNumber() : 0,
      salida: cantidad.lessThan(0) ? cantidad.negated().toNumber() : 0,
      saldo: saldo.toNumber(),
    };
  });
}

/** Saldo final: la suma de todas las cantidades. Nada más que eso. */
export function saldoDesdeMovimientos(
  movimientos: readonly { cantidad: number | string }[],
): number {
  return r4(
    movimientos.reduce((acc, m) => acc.plus(new Decimal(m.cantidad)), CERO),
  ).toNumber();
}

/**
 * Verificación del invariante de la fase: el saldo del último renglón del
 * kardex tiene que ser exactamente la suma de los movimientos.
 *
 * Si esto devolviera `false` en producción, el problema no es de
 * presentación: significa que el orden del kardex y el de la suma no
 * coinciden, o que alguien tocó `stock_movimientos` por fuera de las
 * funciones. Vale la pena que rompa fuerte.
 */
export function kardexCierra(
  renglones: readonly RenglonKardex[],
  saldoInicial: number | string = 0,
): boolean {
  const ultimo = renglones.at(-1);
  const esperado = new Decimal(saldoInicial).plus(
    renglones.reduce((acc, r) => acc.plus(new Decimal(r.cantidad)), CERO),
  );

  if (ultimo === undefined) {
    return esperado.equals(new Decimal(saldoInicial));
  }

  return r4(esperado).equals(new Decimal(ultimo.saldo));
}

/**
 * Agrupa saldos por depósito. Se usa en la ficha de producto, donde
 * interesa ver en qué depósito está la mercadería y no sólo el total.
 */
export function saldosPorDeposito(
  movimientos: readonly { depositoId: string; depositoNombre: string; cantidad: number | string }[],
): { depositoId: string; depositoNombre: string; saldo: number }[] {
  const acumulado = new Map<string, { nombre: string; saldo: Decimal }>();

  for (const m of movimientos) {
    const actual = acumulado.get(m.depositoId);
    const suma = (actual?.saldo ?? CERO).plus(new Decimal(m.cantidad));
    acumulado.set(m.depositoId, { nombre: m.depositoNombre, saldo: suma });
  }

  return [...acumulado.entries()]
    .map(([depositoId, v]) => ({
      depositoId,
      depositoNombre: v.nombre,
      saldo: r4(v.saldo).toNumber(),
    }))
    .sort((a, b) => a.depositoNombre.localeCompare(b.depositoNombre, 'es'));
}

/** ¿Este producto está por debajo de su mínimo? */
export function estaBajoMinimo(
  saldo: number | string,
  stockMinimo: number | string,
): boolean {
  const min = new Decimal(stockMinimo);
  if (min.lessThanOrEqualTo(0)) return false;
  return new Decimal(saldo).lessThan(min);
}

/**
 * ¿Alcanza el stock para esta salida?
 *
 * `permiteVentaSinStock` es una decisión comercial del producto: hay
 * negocios que venden contra pedido y no quieren que el sistema los
 * frene. Espejo de la lógica de `aplicar_stock_comprobante`.
 */
export function haySaldoSuficiente(
  saldo: number | string,
  cantidadSolicitada: number | string,
  permiteVentaSinStock: boolean,
): boolean {
  if (permiteVentaSinStock) return true;
  return new Decimal(saldo).greaterThanOrEqualTo(new Decimal(cantidadSolicitada));
}
