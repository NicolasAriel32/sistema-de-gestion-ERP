/**
 * Letra del comprobante y modo de tratamiento del IVA.
 *
 * Funciones puras, sin acceso a base ni a red. Son el espejo en TypeScript
 * de `public.letra_de_tipo(tipo_comprobante)`; la base valida la coherencia
 * con un CHECK, esto la decide antes de llegar ahí.
 */

import type {
  CondicionIva,
  CondicionIvaEmisor,
  LetraComprobante,
  TipoComprobante,
} from '@/lib/supabase/database.types';

/** Letras que emite el MVP. M, E y X quedan fuera del alcance fiscal. */
export type LetraFiscal = 'A' | 'B' | 'C';

/** Familia de comprobante, sin la letra. */
export type ClaseComprobante = 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';

/** Comprobantes internos: no llevan letra fiscal ni pasan por AFIP. */
export type TipoNoFiscal = 'PRESUPUESTO' | 'PEDIDO' | 'REMITO';

export const TIPOS_NO_FISCALES = ['PRESUPUESTO', 'PEDIDO', 'REMITO'] as const;

/**
 * Determina la letra según la condición frente al IVA del emisor y del
 * receptor.
 *
 *   Emisor Responsable Inscripto → receptor RI                    → A
 *                                → Monotributo / CF / Exento / NA → B
 *   Emisor Monotributo           → siempre                        → C
 *   Emisor Exento                → siempre                        → C
 *
 * El caso del emisor Exento no está en el enunciado del proyecto pero sí
 * en la normativa: un sujeto exento emite comprobantes clase C. La base
 * sólo admite RI, Monotributo o Exento como emisor (CHECK en `empresas`),
 * así que estos tres casos agotan el dominio.
 */
export function determinarLetra(
  condicionEmisor: CondicionIvaEmisor,
  condicionReceptor: CondicionIva,
): LetraFiscal {
  if (condicionEmisor === 'MONOTRIBUTO' || condicionEmisor === 'EXENTO') {
    return 'C';
  }
  return condicionReceptor === 'RESPONSABLE_INSCRIPTO' ? 'A' : 'B';
}

const TIPO_POR_CLASE: Record<ClaseComprobante, Record<LetraFiscal, TipoComprobante>> = {
  FACTURA: { A: 'FACTURA_A', B: 'FACTURA_B', C: 'FACTURA_C' },
  NOTA_CREDITO: { A: 'NC_A', B: 'NC_B', C: 'NC_C' },
  NOTA_DEBITO: { A: 'ND_A', B: 'ND_B', C: 'ND_C' },
};

/** Combina familia + letra en el tipo que guarda la base. */
export function tipoComprobanteDe(
  clase: ClaseComprobante,
  letra: LetraFiscal,
): TipoComprobante {
  return TIPO_POR_CLASE[clase][letra];
}

/** Letra que le corresponde a un tipo ya armado. Espejo de `letra_de_tipo`. */
export function letraDeTipo(tipo: TipoComprobante): LetraComprobante {
  switch (tipo) {
    case 'FACTURA_A':
    case 'NC_A':
    case 'ND_A':
      return 'A';
    case 'FACTURA_B':
    case 'NC_B':
    case 'ND_B':
      return 'B';
    case 'FACTURA_C':
    case 'NC_C':
    case 'ND_C':
      return 'C';
    default:
      return 'X';
  }
}

/**
 * Código de comprobante de AFIP (tabla de tipos de comprobante del
 * WSFEv1). Va impreso en el PDF y es lo que espera `FECAESolicitar`
 * cuando se conecte el proveedor real.
 */
export const CODIGO_AFIP: Partial<Record<TipoComprobante, string>> = {
  FACTURA_A: '01',
  ND_A: '02',
  NC_A: '03',
  FACTURA_B: '06',
  ND_B: '07',
  NC_B: '08',
  FACTURA_C: '11',
  ND_C: '12',
  NC_C: '13',
};

export function esNoFiscal(tipo: TipoComprobante): tipo is TipoNoFiscal {
  return tipo === 'PRESUPUESTO' || tipo === 'PEDIDO' || tipo === 'REMITO';
}

export function esNotaCredito(tipo: TipoComprobante): boolean {
  return tipo === 'NC_A' || tipo === 'NC_B' || tipo === 'NC_C';
}

export function esNotaDebito(tipo: TipoComprobante): boolean {
  return tipo === 'ND_A' || tipo === 'ND_B' || tipo === 'ND_C';
}

export function esFactura(tipo: TipoComprobante): boolean {
  return tipo === 'FACTURA_A' || tipo === 'FACTURA_B' || tipo === 'FACTURA_C';
}

/**
 * Cómo trata el IVA cada letra:
 *
 *   DISCRIMINADO     (A) el precio cargado es NETO; el IVA se suma aparte
 *                        y se muestra desglosado en el comprobante.
 *   INCLUIDO         (B) el precio cargado es FINAL; el neto se calcula
 *                        hacia atrás. El IVA existe y se informa a AFIP,
 *                        pero no se imprime desglosado.
 *   SIN_DISCRIMINAR  (C) el emisor no liquida IVA. Para AFIP el importe
 *                        neto es igual al total y el IVA es cero.
 */
export type ModoIva = 'DISCRIMINADO' | 'INCLUIDO' | 'SIN_DISCRIMINAR';

export function modoIvaDeLetra(letra: LetraFiscal): ModoIva {
  if (letra === 'A') return 'DISCRIMINADO';
  if (letra === 'B') return 'INCLUIDO';
  return 'SIN_DISCRIMINAR';
}

/**
 * Modo de IVA de un comprobante no fiscal. Un presupuesto o un remito no
 * liquidan impuestos, pero el presupuesto tiene que mostrar el precio que
 * el cliente va a pagar: se trata como precio final.
 */
export function modoIvaDeTipo(tipo: TipoComprobante): ModoIva {
  if (esNoFiscal(tipo)) return 'INCLUIDO';
  const letra = letraDeTipo(tipo);
  return modoIvaDeLetra(letra === 'X' ? 'B' : (letra as LetraFiscal));
}
