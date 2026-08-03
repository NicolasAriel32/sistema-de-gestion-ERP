import { z } from 'zod';

import { ALICUOTAS_IVA } from '@/lib/domain/opciones';

const opcional = z.string().trim().optional().default('');

export const productoSchema = z.object({
  codigo: z.string().trim().min(1, 'Ingresá el código'),
  codigoBarras: opcional,
  nombre: z.string().trim().min(1, 'Ingresá el nombre'),
  descripcion: opcional,
  categoriaId: z.string().uuid().nullable().default(null),
  unidadMedida: z.string().trim().min(1).default('UNIDAD'),
  alicuotaIva: z.coerce
    .number()
    .refine((v) => (ALICUOTAS_IVA as readonly number[]).includes(v), 'Alícuota inválida')
    .default(21),
  precioCosto: z.coerce.number().min(0, 'No puede ser negativo').default(0),
  manejaStock: z.boolean().default(true),
  stockMinimo: z.coerce.number().min(0, 'No puede ser negativo').default(0),
  permiteVentaSinStock: z.boolean().default(false),
});

export type ProductoInput = z.infer<typeof productoSchema>;

export const productoFormDefaults: ProductoInput = {
  codigo: '',
  codigoBarras: '',
  nombre: '',
  descripcion: '',
  categoriaId: null,
  unidadMedida: 'UNIDAD',
  alicuotaIva: 21,
  precioCosto: 0,
  manejaStock: true,
  stockMinimo: 0,
  permiteVentaSinStock: false,
};
