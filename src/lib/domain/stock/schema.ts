/**
 * Validación de las operaciones de stock.
 *
 * Espejo en Zod de lo que exigen `ajustar_stock` y `transferir_stock` en
 * la base. La barrera real es Postgres; esto anticipa el error con un
 * mensaje en castellano antes de gastar el viaje.
 */

import { z } from 'zod';

/** Tipos de movimiento, tal como los define el enum `tipo_movimiento_stock`. */
export const TIPOS_MOVIMIENTO = [
  'INICIAL',
  'VENTA',
  'DEVOLUCION_CLIENTE',
  'COMPRA',
  'DEVOLUCION_PROVEEDOR',
  'AJUSTE',
  'TRANSFERENCIA_SALIDA',
  'TRANSFERENCIA_ENTRADA',
] as const;

export type TipoMovimientoStock = (typeof TIPOS_MOVIMIENTO)[number];

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimientoStock, string> = {
  INICIAL: 'Saldo inicial',
  VENTA: 'Venta',
  DEVOLUCION_CLIENTE: 'Devolución de cliente',
  COMPRA: 'Compra',
  DEVOLUCION_PROVEEDOR: 'Devolución a proveedor',
  AJUSTE: 'Ajuste manual',
  TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
  TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
};

/**
 * Ajuste manual.
 *
 * El motivo es obligatorio y no admite un texto de relleno: un ajuste sin
 * explicación deja el inventario descuadrado sin forma de reconstruir por
 * qué. La base lo exige con un CHECK; acá se exige con un mínimo de
 * caracteres para que no alcance con escribir "x".
 */
export const ajusteStockSchema = z
  .object({
    productoId: z.string().uuid('Elegí un producto'),
    depositoId: z.string().uuid('Elegí un depósito'),
    /** Signo incluido: positivo suma existencias, negativo las resta. */
    cantidad: z.coerce
      .number()
      .refine((v) => v !== 0, 'La cantidad del ajuste no puede ser cero')
      .refine((v) => Number.isFinite(v), 'Cantidad inválida'),
    motivo: z
      .string()
      .trim()
      .min(3, 'Explicá el motivo del ajuste (mínimo 3 caracteres)')
      .max(300, 'El motivo es demasiado largo'),
    costoUnitario: z.coerce
      .number()
      .min(0, 'El costo no puede ser negativo')
      .nullable()
      .default(null),
  })
  .strict();

export type AjusteStockInput = z.infer<typeof ajusteStockSchema>;

/**
 * Transferencia entre depósitos.
 *
 * La cantidad es siempre positiva: el sentido lo dan origen y destino, no
 * el signo. Permitir cantidades negativas acá sería invitar a que alguien
 * transfiera −50 y termine generando stock de la nada.
 */
export const transferenciaStockSchema = z
  .object({
    productoId: z.string().uuid('Elegí un producto'),
    origenId: z.string().uuid('Elegí el depósito de origen'),
    destinoId: z.string().uuid('Elegí el depósito de destino'),
    cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
    motivo: z.string().trim().max(300, 'El motivo es demasiado largo').default(''),
  })
  .strict()
  .refine((d) => d.origenId !== d.destinoId, {
    message: 'El depósito de origen y el de destino no pueden ser el mismo',
    path: ['destinoId'],
  });

export type TransferenciaStockInput = z.infer<typeof transferenciaStockSchema>;

export const ajusteStockDefaults: AjusteStockInput = {
  productoId: '',
  depositoId: '',
  cantidad: 0,
  motivo: '',
  costoUnitario: null,
};

export const transferenciaStockDefaults: TransferenciaStockInput = {
  productoId: '',
  origenId: '',
  destinoId: '',
  cantidad: 1,
  motivo: '',
};
