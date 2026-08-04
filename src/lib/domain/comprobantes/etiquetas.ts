/**
 * Nombres legibles de los comprobantes. Lo que ve el usuario nunca es el
 * valor crudo del enum: `FACTURA_A` se lee "Factura A".
 */

import type {
  CondicionVenta,
  EstadoComprobante,
  TipoComprobante,
} from '@/lib/supabase/database.types';

import type { ClaseComprobante } from './letra';

export const ETIQUETA_TIPO: Record<TipoComprobante, string> = {
  PRESUPUESTO: 'Presupuesto',
  PEDIDO: 'Pedido',
  REMITO: 'Remito',
  FACTURA_A: 'Factura A',
  FACTURA_B: 'Factura B',
  FACTURA_C: 'Factura C',
  NC_A: 'Nota de crédito A',
  NC_B: 'Nota de crédito B',
  NC_C: 'Nota de crédito C',
  ND_A: 'Nota de débito A',
  ND_B: 'Nota de débito B',
  ND_C: 'Nota de débito C',
};

/** Versión corta para las tablas, donde el ancho importa. */
export const ETIQUETA_TIPO_CORTA: Record<TipoComprobante, string> = {
  PRESUPUESTO: 'Presup.',
  PEDIDO: 'Pedido',
  REMITO: 'Remito',
  FACTURA_A: 'FC A',
  FACTURA_B: 'FC B',
  FACTURA_C: 'FC C',
  NC_A: 'NC A',
  NC_B: 'NC B',
  NC_C: 'NC C',
  ND_A: 'ND A',
  ND_B: 'ND B',
  ND_C: 'ND C',
};

export const ETIQUETA_ESTADO: Record<EstadoComprobante, string> = {
  BORRADOR: 'Borrador',
  EMITIDO: 'Emitido',
  ANULADO: 'Anulado',
  PAGADO: 'Pagado',
  PARCIAL: 'Pago parcial',
};

/** Variante visual del badge de estado. */
export const VARIANTE_ESTADO: Record<
  EstadoComprobante,
  'default' | 'secondary' | 'outline' | 'destructive' | 'muted' | 'success' | 'warning'
> = {
  BORRADOR: 'muted',
  EMITIDO: 'success',
  ANULADO: 'destructive',
  PAGADO: 'secondary',
  PARCIAL: 'warning',
};

export const ETIQUETA_CONDICION_VENTA: Record<CondicionVenta, string> = {
  CONTADO: 'Contado',
  CUENTA_CORRIENTE: 'Cuenta corriente',
};

/** Qué puede emitir el usuario desde la pantalla de ventas. */
export const CLASES_EMISION = [
  { valor: 'FACTURA', etiqueta: 'Factura' },
  { valor: 'PRESUPUESTO', etiqueta: 'Presupuesto' },
  { valor: 'PEDIDO', etiqueta: 'Pedido' },
  { valor: 'REMITO', etiqueta: 'Remito' },
] as const;

export type ClaseEmision = (typeof CLASES_EMISION)[number]['valor'];

/** A qué se puede convertir cada comprobante, y en qué orden del circuito. */
export const CONVERSIONES: Record<string, { destino: ClaseComprobante | 'PEDIDO' | 'REMITO'; etiqueta: string }[]> = {
  PRESUPUESTO: [
    { destino: 'PEDIDO', etiqueta: 'Convertir en pedido' },
    { destino: 'FACTURA', etiqueta: 'Facturar' },
  ],
  PEDIDO: [
    { destino: 'REMITO', etiqueta: 'Generar remito' },
    { destino: 'FACTURA', etiqueta: 'Facturar' },
  ],
  REMITO: [{ destino: 'FACTURA', etiqueta: 'Facturar' }],
};

/** Punto de venta y número con el formato de AFIP: 00001-00000123. */
export function formatearNumeroComprobante(
  puntoVenta: number | null | undefined,
  numero: number | null | undefined,
): string {
  if (numero == null) return 'Sin número';
  const pv = String(puntoVenta ?? 0).padStart(5, '0');
  return `${pv}-${String(numero).padStart(8, '0')}`;
}
