/**
 * Motor de cálculo de comprobantes.
 *
 * Función pura: entra la lista de ítems y el modo de IVA, salen los
 * subtotales por ítem y los totales de cabecera. Sin base, sin red, sin
 * estado. Todo el dinero pasa por `decimal.js`; en este archivo no hay
 * una sola operación aritmética sobre `number`.
 *
 * REGLA DE REDONDEO (no negociable): ROUND_HALF_UP a 2 decimales, por
 * ítem, y recién después se suma. Nunca al revés. Sumar en alta precisión
 * y redondear al final produce un total que no coincide con la suma de
 * los renglones impresos, y eso es un comprobante mal emitido.
 */

import Decimal from 'decimal.js';

import type { ModoIva } from './letra';

export const ALICUOTAS_VALIDAS = [0, 10.5, 21, 27] as const;
export type AlicuotaIva = (typeof ALICUOTAS_VALIDAS)[number];

const CIEN = new Decimal(100);
const CERO = new Decimal(0);

/** Redondeo de dinero: 2 decimales, mitad hacia arriba. */
function r2(valor: Decimal): Decimal {
  return valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Cantidades: 4 decimales, mismo criterio (espejo de NUMERIC(15,4)). */
function r4(valor: Decimal): Decimal {
  return valor.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

function aDecimal(valor: number | string | Decimal, campo: string): Decimal {
  const d = valor instanceof Decimal ? valor : new Decimal(valor);
  if (!d.isFinite()) {
    throw new Error(`El campo ${campo} no es un número válido.`);
  }
  return d;
}

function normalizarAlicuota(valor: number | string): AlicuotaIva {
  const d = aDecimal(valor, 'alicuotaIva');
  const encontrada = ALICUOTAS_VALIDAS.find((a) => d.equals(a));
  if (encontrada === undefined) {
    throw new Error(
      `Alícuota de IVA inválida: ${d.toString()}. Las permitidas son 0, 10.5, 21 y 27.`,
    );
  }
  return encontrada;
}

function normalizarPorcentaje(valor: number | string | undefined, campo: string): Decimal {
  const d = aDecimal(valor ?? 0, campo);
  if (d.lessThan(0) || d.greaterThan(100)) {
    throw new Error(`El ${campo} debe estar entre 0 y 100.`);
  }
  return d;
}

export type ItemCalculoInput = {
  cantidad: number | string;
  /** Neto en letra A; precio final con IVA en B, C y comprobantes internos. */
  precioUnitario: number | string;
  descuentoPorcentaje?: number | string;
  alicuotaIva: number | string;
};

export type ItemCalculado = {
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje: number;
  /** La del producto, tal cual se guarda en el ítem. */
  alicuotaIva: AlicuotaIva;
  /** La efectivamente liquidada: 0 en letra C, donde no se discrimina IVA. */
  alicuotaAplicada: AlicuotaIva;
  subtotalNeto: number;
  subtotalIva: number;
  subtotal: number;
};

export type TotalesComprobante = {
  items: ItemCalculado[];
  netoGravado: number;
  netoNoGravado: number;
  exento: number;
  iva105: number;
  iva21: number;
  iva27: number;
  otrosImpuestos: number;
  /** El descuento general, tal como se cargó. */
  descuentoPorcentaje: number;
  /** Cuánto restó ese descuento general en pesos. Dato informativo. */
  descuentoImporte: number;
  total: number;
};

export type OpcionesCalculo = {
  modoIva: ModoIva;
  /** Descuento general sobre todo el comprobante, 0–100. */
  descuentoPorcentaje?: number | string;
};

/**
 * Calcula un renglón.
 *
 * El descuento general no se aplica sobre el total: entra como segundo
 * factor en cada renglón, antes del redondeo. Si se aplicara al final, el
 * total dejaría de ser la suma de los renglones.
 */
function calcularItem(
  item: ItemCalculoInput,
  modoIva: ModoIva,
  descuentoGlobal: Decimal,
): ItemCalculado {
  const cantidad = r4(aDecimal(item.cantidad, 'cantidad'));
  const precio = aDecimal(item.precioUnitario, 'precioUnitario');
  if (precio.lessThan(0)) {
    throw new Error('El precio unitario no puede ser negativo.');
  }

  const descuentoItem = normalizarPorcentaje(item.descuentoPorcentaje, 'descuento del ítem');
  const alicuota = normalizarAlicuota(item.alicuotaIva);

  const factor = CIEN.minus(descuentoItem)
    .dividedBy(CIEN)
    .times(CIEN.minus(descuentoGlobal).dividedBy(CIEN));

  const bruto = cantidad.times(precio).times(factor);

  let subtotalNeto: Decimal;
  let subtotalIva: Decimal;
  let subtotal: Decimal;
  let alicuotaAplicada: AlicuotaIva;

  if (modoIva === 'DISCRIMINADO') {
    // Letra A: el precio cargado es neto, el IVA se suma encima.
    alicuotaAplicada = alicuota;
    subtotalNeto = r2(bruto);
    subtotalIva = r2(subtotalNeto.times(alicuota).dividedBy(CIEN));
    subtotal = subtotalNeto.plus(subtotalIva);
  } else if (modoIva === 'INCLUIDO') {
    // Letra B: el precio cargado ya trae el IVA; el neto se saca hacia atrás.
    // El IVA se calcula por diferencia para que neto + iva == subtotal exacto.
    alicuotaAplicada = alicuota;
    subtotal = r2(bruto);
    subtotalNeto = r2(subtotal.dividedBy(CIEN.plus(alicuota).dividedBy(CIEN)));
    subtotalIva = subtotal.minus(subtotalNeto);
  } else {
    // Letra C: el emisor no liquida IVA. Para AFIP el neto es el total.
    alicuotaAplicada = 0;
    subtotal = r2(bruto);
    subtotalNeto = subtotal;
    subtotalIva = CERO;
  }

  return {
    cantidad: cantidad.toNumber(),
    precioUnitario: precio.toNumber(),
    descuentoPorcentaje: descuentoItem.toNumber(),
    alicuotaIva: alicuota,
    alicuotaAplicada,
    subtotalNeto: subtotalNeto.toNumber(),
    subtotalIva: subtotalIva.toNumber(),
    subtotal: subtotal.toNumber(),
  };
}

function sumar(valores: Decimal[]): Decimal {
  return valores.reduce((acc, v) => acc.plus(v), CERO);
}

/**
 * Calcula todos los renglones y los totales de cabecera.
 *
 * Invariante que se cumple siempre, al centavo:
 *   total = netoGravado + netoNoGravado + exento + iva105 + iva21 + iva27
 *           + otrosImpuestos
 *   total = Σ subtotal de los ítems
 *
 * Nota sobre alícuota 0%: para AFIP el 0% es una alícuota gravada (id 3),
 * no una operación exenta. Por eso su neto va a `netoGravado` con IVA
 * cero. `exento` y `netoNoGravado` quedan en 0 en el MVP: el producto no
 * modela esas condiciones todavía.
 */
export function calcularTotales(
  items: readonly ItemCalculoInput[],
  opciones: OpcionesCalculo,
): TotalesComprobante {
  const descuentoGlobal = normalizarPorcentaje(
    opciones.descuentoPorcentaje,
    'descuento general',
  );

  const calculados = items.map((item) => calcularItem(item, opciones.modoIva, descuentoGlobal));

  const ivaPorAlicuota = (alicuota: AlicuotaIva) =>
    sumar(
      calculados
        .filter((i) => i.alicuotaAplicada === alicuota)
        .map((i) => new Decimal(i.subtotalIva)),
    );

  const netoGravado = sumar(calculados.map((i) => new Decimal(i.subtotalNeto)));
  const total = sumar(calculados.map((i) => new Decimal(i.subtotal)));

  // Cuánto restó el descuento general: se recalcula el mismo comprobante
  // con descuento general en cero y se compara. Los descuentos por ítem
  // no entran acá; son parte del precio de cada renglón.
  let descuentoImporte = CERO;
  if (descuentoGlobal.greaterThan(0)) {
    const sinDescuento = items.map((item) => calcularItem(item, opciones.modoIva, CERO));
    const totalSinDescuento = sumar(sinDescuento.map((i) => new Decimal(i.subtotal)));
    descuentoImporte = totalSinDescuento.minus(total);
  }

  return {
    items: calculados,
    netoGravado: netoGravado.toNumber(),
    netoNoGravado: 0,
    exento: 0,
    iva105: ivaPorAlicuota(10.5).toNumber(),
    iva21: ivaPorAlicuota(21).toNumber(),
    iva27: ivaPorAlicuota(27).toNumber(),
    otrosImpuestos: 0,
    descuentoPorcentaje: descuentoGlobal.toNumber(),
    descuentoImporte: descuentoImporte.toNumber(),
    total: total.toNumber(),
  };
}

/**
 * Convierte un precio unitario de un modo de IVA a otro.
 *
 * Hace falta al convertir un presupuesto en factura: el presupuesto se
 * carga con el precio final que va a pagar el cliente, y una factura A lo
 * necesita neto. Sin esta conversión, convertir un presupuesto de $1.210
 * en factura A daría un total de $1.464,10.
 *
 * El resultado se redondea a 2 decimales, así que el total de la factura
 * puede diferir del presupuesto en centavos. Es esperable: un presupuesto
 * no obliga al centavo.
 */
export function reexpresarPrecio(
  precio: number | string,
  alicuotaIva: number | string,
  modoOrigen: ModoIva,
  modoDestino: ModoIva,
): number {
  const p = aDecimal(precio, 'precioUnitario');
  const alicuota = normalizarAlicuota(alicuotaIva);

  // SIN_DISCRIMINAR e INCLUIDO manejan el mismo número: el precio final.
  const esFinal = (modo: ModoIva) => modo !== 'DISCRIMINADO';

  if (esFinal(modoOrigen) === esFinal(modoDestino)) {
    return r2(p).toNumber();
  }

  const factor = CIEN.plus(alicuota).dividedBy(CIEN);

  return esFinal(modoOrigen)
    ? r2(p.dividedBy(factor)).toNumber() // final → neto
    : r2(p.times(factor)).toNumber(); // neto → final
}

/**
 * Reconstruye el total desde los componentes de cabecera. Se usa en los
 * tests y en la validación previa a la emisión: si esto no coincide con
 * `total`, hay un error de cálculo y el comprobante no sale.
 */
export function totalDesdeComponentes(t: TotalesComprobante): number {
  return sumar([
    new Decimal(t.netoGravado),
    new Decimal(t.netoNoGravado),
    new Decimal(t.exento),
    new Decimal(t.iva105),
    new Decimal(t.iva21),
    new Decimal(t.iva27),
    new Decimal(t.otrosImpuestos),
  ]).toNumber();
}

/** ¿Los totales cierran al centavo contra la suma de los renglones? */
export function totalesCoherentes(t: TotalesComprobante): boolean {
  const sumaItems = sumar(t.items.map((i) => new Decimal(i.subtotal)));
  return sumaItems.equals(t.total) && new Decimal(totalDesdeComponentes(t)).equals(t.total);
}
