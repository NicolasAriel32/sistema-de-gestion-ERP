/**
 * Validación de entrada de comprobantes con Zod.
 *
 * El mismo schema corre en el formulario (vía el resolver de
 * react-hook-form) y en la Server Action. Lo que la base acepta está
 * definido por sus CHECK constraints; esto los anticipa con un mensaje en
 * castellano antes de gastar un viaje a Postgres.
 */

import { z } from 'zod';

import { ALICUOTAS_VALIDAS } from './calculo';

const CLASES = ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'] as const;
const TIPOS_NO_FISCALES = ['PRESUPUESTO', 'PEDIDO', 'REMITO'] as const;

/** Fecha en formato ISO corto (YYYY-MM-DD), que es como viaja a Postgres. */
const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00`)), 'Fecha inválida');

export const itemComprobanteSchema = z.object({
  productoId: z.string().uuid().nullable().default(null),
  descripcion: z.string().trim().min(1, 'El renglón necesita una descripción'),
  cantidad: z.coerce
    .number()
    .refine((v) => v !== 0, 'La cantidad no puede ser cero')
    .refine((v) => v > 0, 'La cantidad debe ser positiva'),
  precioUnitario: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  descuentoPorcentaje: z.coerce
    .number()
    .min(0, 'El descuento no puede ser negativo')
    .max(100, 'El descuento no puede superar el 100%')
    .default(0),
  alicuotaIva: z.coerce
    .number()
    .refine(
      (v) => (ALICUOTAS_VALIDAS as readonly number[]).includes(v),
      'Alícuota inválida: sólo 0, 10.5, 21 o 27',
    ),
});

export type ItemComprobanteInput = z.infer<typeof itemComprobanteSchema>;

/**
 * Cabecera de un comprobante de venta.
 *
 * La letra NO se pide: se deriva de la condición frente al IVA del emisor
 * y del receptor con `determinarLetra`. Dejar que el usuario la elija es
 * la puerta de entrada a comprobantes mal emitidos.
 */
export const comprobanteSchema = z
  .object({
    clase: z.enum([...CLASES, ...TIPOS_NO_FISCALES]),
    puntoVentaId: z.string().uuid('Elegí un punto de venta'),
    clienteId: z.string().uuid('Elegí un cliente'),
    depositoId: z.string().uuid().nullable().default(null),
    listaPrecioId: z.string().uuid().nullable().default(null),
    vendedorId: z.string().uuid().nullable().default(null),
    fechaEmision: fechaIso,
    fechaVencimiento: z.union([fechaIso, z.literal('')]).default(''),
    condicionVenta: z.enum(['CONTADO', 'CUENTA_CORRIENTE']),
    descuentoPorcentaje: z.coerce
      .number()
      .min(0, 'El descuento no puede ser negativo')
      .max(100, 'El descuento no puede superar el 100%')
      .default(0),
    comprobanteOrigenId: z.string().uuid().nullable().default(null),
    observaciones: z.string().trim().default(''),
    items: z
      .array(itemComprobanteSchema)
      .min(1, 'El comprobante necesita al menos un renglón'),
  })
  // Espejo del CHECK comprobantes_nc_nd_requiere_origen.
  .refine(
    (d) =>
      (d.clase !== 'NOTA_CREDITO' && d.clase !== 'NOTA_DEBITO') ||
      d.comprobanteOrigenId !== null,
    {
      message: 'Una nota de crédito o débito debe referenciar su comprobante de origen',
      path: ['comprobanteOrigenId'],
    },
  )
  .refine(
    (d) => d.fechaVencimiento === '' || d.fechaVencimiento >= d.fechaEmision,
    {
      message: 'El vencimiento no puede ser anterior a la emisión',
      path: ['fechaVencimiento'],
    },
  )
  // Un comprobante a cuenta corriente sin vencimiento no se puede reclamar.
  .refine(
    (d) => d.condicionVenta !== 'CUENTA_CORRIENTE' || d.fechaVencimiento !== '',
    {
      message: 'Una venta a cuenta corriente necesita fecha de vencimiento',
      path: ['fechaVencimiento'],
    },
  );

export type ComprobanteInput = z.infer<typeof comprobanteSchema>;

export const itemComprobanteDefaults: ItemComprobanteInput = {
  productoId: null,
  descripcion: '',
  cantidad: 1,
  precioUnitario: 0,
  descuentoPorcentaje: 0,
  alicuotaIva: 21,
};

/** Parámetros de la acción de emisión (distinta de la de guardado). */
export const emisionSchema = z.object({
  comprobanteId: z.string().uuid(),
  /** Saltear el bloqueo por límite de crédito. Sólo lo puede pedir un ADMIN. */
  forzarCredito: z.boolean().default(false),
});

export type EmisionInput = z.infer<typeof emisionSchema>;
