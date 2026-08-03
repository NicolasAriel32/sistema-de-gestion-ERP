import { z } from 'zod';

import { esCuitValido } from '@/lib/domain/fiscal/cuit';
import { CONDICIONES_IVA, CONDICIONES_SIN_IDENTIFICACION, TIPOS_DOC } from '@/lib/domain/opciones';

const opcional = z.string().trim().optional().default('');

export const clienteSchema = z
  .object({
    razonSocial: z.string().trim().min(1, 'Ingresá la razón social'),
    nombreFantasia: opcional,
    tipoDoc: z.enum(TIPOS_DOC),
    cuitDni: opcional,
    condicionIva: z.enum(CONDICIONES_IVA),
    email: z.union([z.email('Email inválido'), z.literal('')]).default(''),
    telefono: opcional,
    domicilio: opcional,
    localidad: opcional,
    provincia: opcional,
    listaPrecioId: z.string().uuid().nullable().default(null),
    limiteCredito: z.coerce.number().min(0, 'No puede ser negativo').default(0),
    diasCredito: z.coerce.number().int('Debe ser un entero').min(0, 'No puede ser negativo').default(0),
    observaciones: opcional,
  })
  // Espejo del CHECK clientes_cuit_valido.
  .refine(
    (d) => (d.tipoDoc !== 'CUIT' && d.tipoDoc !== 'CUIL') || esCuitValido(d.cuitDni),
    { message: 'CUIT/CUIL inválido (revisá el dígito verificador)', path: ['cuitDni'] },
  )
  // Espejo del CHECK clientes_identificacion_requerida.
  .refine(
    (d) => CONDICIONES_SIN_IDENTIFICACION.includes(d.condicionIva) || d.cuitDni.trim().length > 0,
    {
      message: 'Un Resp. Inscripto, Monotributo o Exento debe tener identificación',
      path: ['cuitDni'],
    },
  );

export type ClienteInput = z.infer<typeof clienteSchema>;

export const clienteFormDefaults: ClienteInput = {
  razonSocial: '',
  nombreFantasia: '',
  tipoDoc: 'CUIT',
  cuitDni: '',
  condicionIva: 'CONSUMIDOR_FINAL',
  email: '',
  telefono: '',
  domicilio: '',
  localidad: '',
  provincia: '',
  listaPrecioId: null,
  limiteCredito: 0,
  diasCredito: 0,
  observaciones: '',
};
