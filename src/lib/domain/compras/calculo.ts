/**
 * Motor de cálculo de compras.
 *
 * Difiere del de ventas en dos cosas, y sólo en dos:
 *
 *   1. NO hay descuento general ni por renglón. La factura del proveedor
 *      viene con los importes ya cerrados; acá se transcribe, no se
 *      negocia. Si el proveedor hizo un descuento, ya está reflejado en
 *      el precio unitario que figura en el papel.
 *
 *   2. HAY percepciones. IVA, Ganancias e IIBB se suman al total pero no
 *      son ni neto ni IVA: son pagos a cuenta de otros impuestos. El
 *      Libro IVA Digital las exige itemizadas por tipo y jurisdicción,
 *      por eso viven en su propia tabla y no en una columna genérica de
 *      "otros impuestos".
 *
 * Mismo criterio de redondeo que ventas: ROUND_HALF_UP a 2 decimales por
 * renglón, y recién después se suma.
 */

import Decimal from 'decimal.js';

import { ALICUOTAS_VALIDAS, type AlicuotaIva } from '@/lib/domain/comprobantes/calculo';

const CIEN = new Decimal(100);
const CERO = new Decimal(0);

function r2(valor: Decimal): Decimal {
  return valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

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

/**
 * Cómo se lee el precio unitario cargado.
 *
 * En una factura A el IVA está discriminado: el precio de cada renglón es
 * neto y el IVA se suma aparte. En una B o C el IVA no se discrimina (o
 * no existe), así que el precio ya es el final y no hay crédito fiscal
 * que separar. Eso también define el costo de la mercadería: en A el
 * costo es el neto, en B y C es el total.
 */
export type ModoIvaCompra = 'DISCRIMINADO' | 'INCLUIDO';

/** Letra A y M discriminan IVA. B, C y el resto, no. */
export function modoIvaDeLetra(letra: string): ModoIvaCompra {
  return letra === 'A' || letra === 'M' ? 'DISCRIMINADO' : 'INCLUIDO';
}

export type ItemCompraInput = {
  cantidad: number | string;
  precioUnitario: number | string;
  alicuotaIva: number | string;
};

export type ItemCompraCalculado = {
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: AlicuotaIva;
  subtotalNeto: number;
  subtotalIva: number;
  subtotal: number;
  /**
   * Costo unitario de la mercadería que ingresa al stock. En A es el
   * precio neto; en B y C, el precio con IVA incluido, porque ese IVA no
   * se recupera y por lo tanto es costo.
   */
  costoUnitario: number;
};

export const TIPOS_PERCEPCION = ['IVA', 'GANANCIAS', 'IIBB', 'OTRO'] as const;
export type TipoPercepcion = (typeof TIPOS_PERCEPCION)[number];

export const ETIQUETA_PERCEPCION: Record<TipoPercepcion, string> = {
  IVA: 'Percepción IVA',
  GANANCIAS: 'Percepción Ganancias',
  IIBB: 'Percepción IIBB',
  OTRO: 'Otra percepción',
};

export type PercepcionInput = {
  tipo: TipoPercepcion;
  jurisdiccion?: string | null;
  baseImponible?: number | string;
  alicuota?: number | string;
  /** Si viene, manda sobre base × alícuota: es el número impreso en el papel. */
  importe?: number | string | null;
};

export type PercepcionCalculada = {
  tipo: TipoPercepcion;
  jurisdiccion: string | null;
  baseImponible: number;
  alicuota: number;
  importe: number;
};

export type TotalesCompra = {
  items: ItemCompraCalculado[];
  percepciones: PercepcionCalculada[];
  netoGravado: number;
  netoNoGravado: number;
  exento: number;
  iva105: number;
  iva21: number;
  iva27: number;
  totalPercepciones: number;
  /** Suma de los renglones, sin percepciones. */
  subtotal: number;
  /** Lo que efectivamente se le paga al proveedor. */
  total: number;
};

function calcularItem(item: ItemCompraInput, modo: ModoIvaCompra): ItemCompraCalculado {
  const cantidad = r4(aDecimal(item.cantidad, 'cantidad'));
  const precio = aDecimal(item.precioUnitario, 'precioUnitario');

  if (precio.lessThan(0)) {
    throw new Error('El precio unitario no puede ser negativo.');
  }
  if (cantidad.isZero()) {
    throw new Error('La cantidad del renglón no puede ser cero.');
  }

  const alicuota = normalizarAlicuota(item.alicuotaIva);
  const bruto = cantidad.times(precio);

  let subtotalNeto: Decimal;
  let subtotalIva: Decimal;
  let subtotal: Decimal;
  let costoUnitario: Decimal;

  if (modo === 'DISCRIMINADO') {
    subtotalNeto = r2(bruto);
    subtotalIva = r2(subtotalNeto.times(alicuota).dividedBy(CIEN));
    subtotal = subtotalNeto.plus(subtotalIva);
    costoUnitario = r2(precio);
  } else {
    // El IVA no se discrimina: no hay crédito fiscal, todo es costo.
    subtotal = r2(bruto);
    subtotalNeto = subtotal;
    subtotalIva = CERO;
    costoUnitario = r2(precio);
  }

  return {
    cantidad: cantidad.toNumber(),
    precioUnitario: precio.toNumber(),
    alicuotaIva: alicuota,
    subtotalNeto: subtotalNeto.toNumber(),
    subtotalIva: subtotalIva.toNumber(),
    subtotal: subtotal.toNumber(),
    costoUnitario: costoUnitario.toNumber(),
  };
}

function calcularPercepcion(p: PercepcionInput): PercepcionCalculada {
  const base = aDecimal(p.baseImponible ?? 0, 'base imponible');
  const alicuota = aDecimal(p.alicuota ?? 0, 'alícuota de percepción');

  if (base.lessThan(0)) {
    throw new Error('La base imponible de la percepción no puede ser negativa.');
  }
  if (alicuota.lessThan(0)) {
    throw new Error('La alícuota de la percepción no puede ser negativa.');
  }

  // El importe impreso manda: los organismos redondean con criterios
  // propios y discutirle al papel es perder.
  const importe =
    p.importe === null || p.importe === undefined || p.importe === ''
      ? r2(base.times(alicuota).dividedBy(CIEN))
      : r2(aDecimal(p.importe, 'importe de percepción'));

  if (importe.lessThan(0)) {
    throw new Error('El importe de la percepción no puede ser negativo.');
  }

  return {
    tipo: p.tipo,
    jurisdiccion: p.jurisdiccion?.trim() || null,
    baseImponible: base.toNumber(),
    alicuota: alicuota.toNumber(),
    importe: importe.toNumber(),
  };
}

function sumar(valores: Decimal[]): Decimal {
  return valores.reduce((acc, v) => acc.plus(v), CERO);
}

/**
 * Totales de una factura de proveedor.
 *
 * Invariantes, al centavo:
 *   subtotal = Σ subtotal de los renglones
 *   subtotal = netoGravado + iva105 + iva21 + iva27
 *   total    = subtotal + totalPercepciones
 *
 * La base verifica el primero y el tercero antes de registrar la compra
 * (`registrar_compra`). Si no cierran, la factura no entra.
 */
export function calcularTotalesCompra(
  items: readonly ItemCompraInput[],
  opciones: { modoIva: ModoIvaCompra; percepciones?: readonly PercepcionInput[] },
): TotalesCompra {
  const calculados = items.map((i) => calcularItem(i, opciones.modoIva));
  const percepciones = (opciones.percepciones ?? []).map(calcularPercepcion);

  const ivaPorAlicuota = (alicuota: AlicuotaIva) =>
    sumar(
      calculados
        .filter((i) => i.alicuotaIva === alicuota && opciones.modoIva === 'DISCRIMINADO')
        .map((i) => new Decimal(i.subtotalIva)),
    );

  const netoGravado = sumar(calculados.map((i) => new Decimal(i.subtotalNeto)));
  const subtotal = sumar(calculados.map((i) => new Decimal(i.subtotal)));
  const totalPercepciones = sumar(percepciones.map((p) => new Decimal(p.importe)));

  return {
    items: calculados,
    percepciones,
    netoGravado: netoGravado.toNumber(),
    netoNoGravado: 0,
    exento: 0,
    iva105: ivaPorAlicuota(10.5).toNumber(),
    iva21: ivaPorAlicuota(21).toNumber(),
    iva27: ivaPorAlicuota(27).toNumber(),
    totalPercepciones: totalPercepciones.toNumber(),
    subtotal: subtotal.toNumber(),
    total: subtotal.plus(totalPercepciones).toNumber(),
  };
}

/** ¿Los totales cierran contra la suma de los renglones y las percepciones? */
export function totalesCompraCoherentes(t: TotalesCompra): boolean {
  const sumaItems = sumar(t.items.map((i) => new Decimal(i.subtotal)));
  const sumaComponentes = sumar([
    new Decimal(t.netoGravado),
    new Decimal(t.netoNoGravado),
    new Decimal(t.exento),
    new Decimal(t.iva105),
    new Decimal(t.iva21),
    new Decimal(t.iva27),
  ]);

  return (
    sumaItems.equals(t.subtotal) &&
    sumaComponentes.equals(t.subtotal) &&
    sumaItems.plus(t.totalPercepciones).equals(t.total)
  );
}

/**
 * Sólo A y M dan crédito fiscal a un responsable inscripto. Espejo de la
 * columna generada `compras.da_credito_fiscal`.
 */
export function daCreditoFiscal(letra: string): boolean {
  return letra === 'A' || letra === 'M';
}
