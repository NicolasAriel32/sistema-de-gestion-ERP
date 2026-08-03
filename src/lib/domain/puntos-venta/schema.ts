import { z } from 'zod';

import { TIPOS_EMISION } from '@/lib/domain/opciones';

export const puntoVentaSchema = z.object({
  numero: z.coerce
    .number()
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1')
    .max(99999, 'Máximo 99999'),
  descripcion: z.string().trim().optional().default(''),
  tipoEmision: z.enum(TIPOS_EMISION),
});

export type PuntoVentaInput = z.infer<typeof puntoVentaSchema>;

export const puntoVentaFormDefaults: PuntoVentaInput = {
  numero: 1,
  descripcion: '',
  tipoEmision: 'ELECTRONICA',
};
