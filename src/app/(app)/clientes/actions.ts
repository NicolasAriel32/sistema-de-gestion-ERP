'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { clienteSchema, type ClienteInput } from '@/lib/domain/clientes/schema';
import { soloDigitos } from '@/lib/domain/fiscal/cuit';
import { primerErrorZod, traducirErrorDb } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

function nuloSiVacio(valor: string): string | null {
  const v = valor.trim();
  return v.length === 0 ? null : v;
}

type ClienteInsert = Database['public']['Tables']['clientes']['Insert'];

function aRegistro(input: ClienteInput, empresaId: string): ClienteInsert {
  const usaCuit = input.tipoDoc === 'CUIT' || input.tipoDoc === 'CUIL';
  const doc = input.cuitDni.trim();
  return {
    empresa_id: empresaId,
    razon_social: input.razonSocial.trim(),
    nombre_fantasia: nuloSiVacio(input.nombreFantasia),
    tipo_doc: input.tipoDoc,
    cuit_dni: doc.length === 0 ? null : usaCuit ? soloDigitos(doc) : doc,
    condicion_iva: input.condicionIva,
    email: nuloSiVacio(input.email),
    telefono: nuloSiVacio(input.telefono),
    domicilio: nuloSiVacio(input.domicilio),
    localidad: nuloSiVacio(input.localidad),
    provincia: nuloSiVacio(input.provincia),
    lista_precio_id: input.listaPrecioId,
    limite_credito: input.limiteCredito,
    dias_credito: input.diasCredito,
    observaciones: nuloSiVacio(input.observaciones),
  };
}

export async function crearCliente(input: ClienteInput): Promise<AccionResult> {
  const parsed = clienteSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'clientes')) {
    return { error: 'Tu rol no puede crear clientes.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clientes')
    .insert(aRegistro(parsed.data, empresa.empresaId))
    .select('id')
    .single();

  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/clientes');
  return { ok: true, id: data.id };
}

export async function actualizarCliente(id: string, input: ClienteInput): Promise<AccionResult> {
  const parsed = clienteSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'clientes')) {
    return { error: 'Tu rol no puede editar clientes.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('clientes')
    .update(aRegistro(parsed.data, empresa.empresaId))
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);

  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/clientes');
  return { ok: true, id };
}

export async function cambiarEstadoCliente(id: string, activo: boolean): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'clientes')) {
    return { error: 'Tu rol no puede modificar clientes.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('clientes')
    .update({ activo })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);

  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/clientes');
  return { ok: true, id };
}
