'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { listaPrecioSchema, type ListaPrecioInput } from '@/lib/domain/listas-precios/schema';
import { primerErrorZod, traducirErrorDb } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function limpiarDefault(
  supabase: ServerClient,
  empresaId: string,
  exceptoId?: string,
): Promise<void> {
  let query = supabase
    .from('listas_precios')
    .update({ es_default: false })
    .eq('empresa_id', empresaId)
    .eq('es_default', true);
  if (exceptoId) query = query.neq('id', exceptoId);
  await query;
}

export async function crearListaPrecio(input: ListaPrecioInput): Promise<AccionResult> {
  const parsed = listaPrecioSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'listas_precios')) {
    return { error: 'Tu rol no puede crear listas de precios.' };
  }

  const supabase = await createClient();
  const d = parsed.data;
  if (d.esDefault) await limpiarDefault(supabase, empresa.empresaId);

  const { error } = await supabase.from('listas_precios').insert({
    empresa_id: empresa.empresaId,
    nombre: d.nombre.trim(),
    tipo_ajuste: d.tipoAjuste,
    porcentaje: d.porcentaje,
    es_default: d.esDefault,
  });
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/listas-precios');
  return { ok: true };
}

export async function actualizarListaPrecio(
  id: string,
  input: ListaPrecioInput,
): Promise<AccionResult> {
  const parsed = listaPrecioSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'listas_precios')) {
    return { error: 'Tu rol no puede editar listas de precios.' };
  }

  const supabase = await createClient();
  const d = parsed.data;
  if (d.esDefault) await limpiarDefault(supabase, empresa.empresaId, id);

  const { error } = await supabase
    .from('listas_precios')
    .update({
      nombre: d.nombre.trim(),
      tipo_ajuste: d.tipoAjuste,
      porcentaje: d.porcentaje,
      es_default: d.esDefault,
    })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/listas-precios');
  return { ok: true };
}

export async function cambiarEstadoListaPrecio(id: string, activa: boolean): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'listas_precios')) {
    return { error: 'Tu rol no puede modificar listas de precios.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('listas_precios')
    .update({ activa })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/listas-precios');
  return { ok: true };
}
