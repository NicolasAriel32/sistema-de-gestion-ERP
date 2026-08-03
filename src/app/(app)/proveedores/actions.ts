'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { soloDigitos } from '@/lib/domain/fiscal/cuit';
import { proveedorSchema, type ProveedorInput } from '@/lib/domain/proveedores/schema';
import { primerErrorZod, traducirErrorDb } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type ProveedorInsert = Database['public']['Tables']['proveedores']['Insert'];

function nuloSiVacio(valor: string): string | null {
  const v = valor.trim();
  return v.length === 0 ? null : v;
}

function aRegistro(input: ProveedorInput, empresaId: string): ProveedorInsert {
  const cuit = input.cuit.trim();
  return {
    empresa_id: empresaId,
    razon_social: input.razonSocial.trim(),
    cuit: cuit.length === 0 ? null : soloDigitos(cuit),
    condicion_iva: input.condicionIva,
    email: nuloSiVacio(input.email),
    telefono: nuloSiVacio(input.telefono),
    domicilio: nuloSiVacio(input.domicilio),
    observaciones: nuloSiVacio(input.observaciones),
  };
}

export async function crearProveedor(input: ProveedorInput): Promise<AccionResult> {
  const parsed = proveedorSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'proveedores')) {
    return { error: 'Tu rol no puede crear proveedores.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('proveedores').insert(aRegistro(parsed.data, empresa.empresaId));
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/proveedores');
  return { ok: true };
}

export async function actualizarProveedor(id: string, input: ProveedorInput): Promise<AccionResult> {
  const parsed = proveedorSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'proveedores')) {
    return { error: 'Tu rol no puede editar proveedores.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('proveedores')
    .update(aRegistro(parsed.data, empresa.empresaId))
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/proveedores');
  return { ok: true };
}

export async function cambiarEstadoProveedor(id: string, activo: boolean): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'proveedores')) {
    return { error: 'Tu rol no puede modificar proveedores.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('proveedores')
    .update({ activo })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/proveedores');
  return { ok: true };
}
