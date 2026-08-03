import { z } from 'zod';

import { esCuitValido } from '@/lib/domain/fiscal/cuit';

export const loginSchema = z.object({
  email: z.email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registroSchema = z.object({
  email: z.email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  razonSocial: z.string().trim().min(1, 'Ingresá la razón social de tu empresa'),
  cuit: z
    .string()
    .trim()
    .refine((v) => esCuitValido(v), 'CUIT inválido (revisá el dígito verificador)'),
  condicionIva: z.enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO']),
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const recuperarSchema = z.object({
  email: z.email('Email inválido'),
});
export type RecuperarInput = z.infer<typeof recuperarSchema>;

export const actualizarPasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmar: z.string(),
  })
  .refine((data) => data.password === data.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  });
export type ActualizarPasswordInput = z.infer<typeof actualizarPasswordSchema>;

export type ResultadoAuth = { error: string } | { ok: true };
