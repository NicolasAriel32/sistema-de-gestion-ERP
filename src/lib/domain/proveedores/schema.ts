import { z } from 'zod';

import { esCuitValido } from '@/lib/domain/fiscal/cuit';
import { CONDICIONES_IVA } from '@/lib/domain/opciones';

const opcional = z.string().trim().optional().default('');

export const proveedorSchema = z
  .object({
    razonSocial: z.string().trim().min(1, 'Ingresá la razón social'),
    cuit: opcional,
    condicionIva: z.enum(CONDICIONES_IVA),
    email: z.union([z.email('Email inválido'), z.literal('')]).default(''),
    telefono: opcional,
    domicilio: opcional,
    observaciones: opcional,
  })
  // Espejo del CHECK: cuit is null or es_cuit_valido(cuit).
  .refine((d) => d.cuit.trim() === '' || esCuitValido(d.cuit), {
    message: 'CUIT inválido (revisá el dígito verificador)',
    path: ['cuit'],
  });

export type ProveedorInput = z.infer<typeof proveedorSchema>;

export const proveedorFormDefaults: ProveedorInput = {
  razonSocial: '',
  cuit: '',
  condicionIva: 'RESPONSABLE_INSCRIPTO',
  email: '',
  telefono: '',
  domicilio: '',
  observaciones: '',
};
