import { z } from 'zod';

import { TIPOS_AJUSTE_LISTA } from '@/lib/domain/opciones';

export const listaPrecioSchema = z.object({
  nombre: z.string().trim().min(1, 'Ingresá el nombre de la lista'),
  tipoAjuste: z.enum(TIPOS_AJUSTE_LISTA),
  porcentaje: z.coerce.number().min(-100, 'Mínimo -100').max(1000, 'Máximo 1000').default(0),
  esDefault: z.boolean().default(false),
});

export type ListaPrecioInput = z.infer<typeof listaPrecioSchema>;

export const listaPrecioFormDefaults: ListaPrecioInput = {
  nombre: '',
  tipoAjuste: 'MANUAL',
  porcentaje: 0,
  esDefault: false,
};
