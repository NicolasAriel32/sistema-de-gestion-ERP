/**
 * Validación de entrada del módulo de compras.
 *
 * Recordatorio de por qué esto no se parece al schema de ventas: el
 * comprobante de compra no lo emitimos nosotros. El tipo, la letra, el
 * punto de venta y el número son datos que se transcriben del papel del
 * proveedor, no valores que el sistema calcula. Por eso acá SÍ se pide la
 * letra (en ventas se deriva) y SÍ se pide el número.
 */

import { z } from 'zod';

import { ALICUOTAS_VALIDAS } from '@/lib/domain/comprobantes/calculo';
import { TIPOS_PERCEPCION } from './calculo';

const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00`)), 'Fecha inválida');

/** Tipos de comprobante que puede tener una factura de proveedor. */
export const TIPOS_COMPRA = [
  'FACTURA_A',
  'FACTURA_B',
  'FACTURA_C',
  'NC_A',
  'NC_B',
  'NC_C',
  'ND_A',
  'ND_B',
  'ND_C',
] as const;

export type TipoCompra = (typeof TIPOS_COMPRA)[number];

/** La letra sale del tipo: FACTURA_A → A. Sin ambigüedad posible. */
export function letraDeTipoCompra(tipo: TipoCompra): 'A' | 'B' | 'C' {
  const sufijo = tipo.slice(-1);
  if (sufijo === 'A' || sufijo === 'B' || sufijo === 'C') return sufijo;
  throw new Error(`Tipo de comprobante de compra inválido: ${tipo}`);
}

export const ETIQUETA_TIPO_COMPRA: Record<TipoCompra, string> = {
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

export const itemCompraSchema = z.object({
  productoId: z.string().uuid().nullable().default(null),
  descripcion: z.string().trim().min(1, 'El renglón necesita una descripción'),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  precioUnitario: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  alicuotaIva: z.coerce
    .number()
    .refine(
      (v) => (ALICUOTAS_VALIDAS as readonly number[]).includes(v),
      'Alícuota inválida: sólo 0, 10.5, 21 o 27',
    ),
});

export type ItemCompraFormInput = z.infer<typeof itemCompraSchema>;

export const percepcionSchema = z.object({
  tipo: z.enum(TIPOS_PERCEPCION),
  jurisdiccion: z.string().trim().max(60, 'Jurisdicción demasiado larga').default(''),
  baseImponible: z.coerce.number().min(0, 'La base no puede ser negativa').default(0),
  alicuota: z.coerce.number().min(0, 'La alícuota no puede ser negativa').default(0),
  importe: z.coerce.number().min(0, 'El importe no puede ser negativo'),
});

export type PercepcionFormInput = z.infer<typeof percepcionSchema>;

/**
 * Orden de compra: documento interno, sin efecto fiscal. No lleva letra
 * ni número de proveedor porque todavía no existe ningún comprobante.
 */
export const ordenCompraSchema = z
  .object({
    proveedorId: z.string().uuid('Elegí un proveedor'),
    depositoId: z.string().uuid().nullable().default(null),
    fecha: fechaIso,
    fechaEntrega: z.union([fechaIso, z.literal('')]).default(''),
    observaciones: z.string().trim().max(500).default(''),
    items: z.array(itemCompraSchema).min(1, 'La orden necesita al menos un renglón'),
  })
  .refine((d) => d.fechaEntrega === '' || d.fechaEntrega >= d.fecha, {
    message: 'La fecha de entrega no puede ser anterior a la de la orden',
    path: ['fechaEntrega'],
  });

export type OrdenCompraInput = z.infer<typeof ordenCompraSchema>;

/**
 * Factura de proveedor.
 *
 * El punto de venta y el número son los que vienen impresos. El punto de
 * venta va hasta 99999 y el número hasta 8 dígitos, que es el formato
 * estándar de ARCA.
 */
export const compraSchema = z
  .object({
    proveedorId: z.string().uuid('Elegí un proveedor'),
    ordenCompraId: z.string().uuid().nullable().default(null),
    tipoComprobante: z.enum(TIPOS_COMPRA),
    puntoVentaNumero: z.coerce
      .number()
      .int('El punto de venta debe ser un número entero')
      .min(0, 'Punto de venta inválido')
      .max(99999, 'El punto de venta no puede superar 99999'),
    numero: z.coerce
      .number()
      .int('El número debe ser entero')
      .positive('El número del comprobante debe ser mayor a cero'),
    caeProveedor: z
      .union([z.string().trim().regex(/^\d{14}$/, 'El CAE tiene 14 dígitos'), z.literal('')])
      .default(''),
    fechaEmision: fechaIso,
    fechaVencimiento: z.union([fechaIso, z.literal('')]).default(''),
    depositoId: z.string().uuid().nullable().default(null),
    condicionVenta: z.enum(['CONTADO', 'CUENTA_CORRIENTE']),
    observaciones: z.string().trim().max(500).default(''),
    items: z.array(itemCompraSchema).min(1, 'La factura necesita al menos un renglón'),
    percepciones: z.array(percepcionSchema).default([]),
  })
  .refine((d) => d.fechaVencimiento === '' || d.fechaVencimiento >= d.fechaEmision, {
    message: 'El vencimiento no puede ser anterior a la emisión',
    path: ['fechaVencimiento'],
  })
  // Sin vencimiento no hay forma de calcular la antigüedad de la deuda.
  .refine((d) => d.condicionVenta !== 'CUENTA_CORRIENTE' || d.fechaVencimiento !== '', {
    message: 'Una compra a cuenta corriente necesita fecha de vencimiento',
    path: ['fechaVencimiento'],
  })
  // Si algún renglón mueve mercadería, hace falta saber a qué depósito entra.
  .refine((d) => d.depositoId !== null || d.items.every((i) => i.productoId === null), {
    message: 'Elegí el depósito donde ingresa la mercadería',
    path: ['depositoId'],
  });

export type CompraInput = z.infer<typeof compraSchema>;

export const anulacionCompraSchema = z.object({
  compraId: z.string().uuid(),
  motivo: z
    .string()
    .trim()
    .min(3, 'Explicá el motivo de la anulación')
    .max(300, 'El motivo es demasiado largo'),
});

export type AnulacionCompraInput = z.infer<typeof anulacionCompraSchema>;

export const itemCompraDefaults: ItemCompraFormInput = {
  productoId: null,
  descripcion: '',
  cantidad: 1,
  precioUnitario: 0,
  alicuotaIva: 21,
};

export const percepcionDefaults: PercepcionFormInput = {
  tipo: 'IIBB',
  jurisdiccion: '',
  baseImponible: 0,
  alicuota: 0,
  importe: 0,
};

export const ETIQUETA_ESTADO_ORDEN: Record<string, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  RECIBIDA_PARCIAL: 'Recibida parcial',
  RECIBIDA: 'Recibida',
  ANULADA: 'Anulada',
};

export const ETIQUETA_ESTADO_COMPRA: Record<string, string> = {
  BORRADOR: 'Borrador',
  REGISTRADA: 'Registrada',
  PARCIAL: 'Pago parcial',
  PAGADA: 'Pagada',
  ANULADA: 'Anulada',
};
