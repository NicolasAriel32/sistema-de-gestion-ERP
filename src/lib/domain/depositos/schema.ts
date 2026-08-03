import { z } from 'zod';

export const depositoSchema = z.object({
  nombre: z.string().trim().min(1, 'Ingresá el nombre del depósito'),
  direccion: z.string().trim().optional().default(''),
  esDefault: z.boolean().default(false),
});

export type DepositoInput = z.infer<typeof depositoSchema>;

export const depositoFormDefaults: DepositoInput = {
  nombre: '',
  direccion: '',
  esDefault: false,
};
