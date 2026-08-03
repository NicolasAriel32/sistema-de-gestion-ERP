'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { depositoSchema, type DepositoInput } from '@/lib/domain/depositos/schema';
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
    .from('depositos')
    .update({ es_default: false })
    .eq('empresa_id', empresaId)
    .eq('es_default', true);
  if (exceptoId) query = query.neq('id', exceptoId);
  await query;
}

export async function crearDeposito(input: DepositoInput): Promise<AccionResult> {
  const parsed = depositoSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'depositos')) return { error: 'Tu rol no puede crear depósitos.' };

  const supabase = await createClient();
  const d = parsed.data;
  if (d.esDefault) await limpiarDefault(supabase, empresa.empresaId);

  const { error } = await supabase.from('depositos').insert({
    empresa_id: empresa.empresaId,
    nombre: d.nombre.trim(),
    direccion: d.direccion.trim() || null,
    es_default: d.esDefault,
  });
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/depositos');
  return { ok: true };
}

export async function actualizarDeposito(id: string, input: DepositoInput): Promise<AccionResult> {
  const parsed = depositoSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'depositos')) return { error: 'Tu rol no puede editar depósitos.' };

  const supabase = await createClient();
  const d = parsed.data;
  if (d.esDefault) await limpiarDefault(supabase, empresa.empresaId, id);

  const { error } = await supabase
    .from('depositos')
    .update({
      nombre: d.nombre.trim(),
      direccion: d.direccion.trim() || null,
      es_default: d.esDefault,
    })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/depositos');
  return { ok: true };
}

export async function cambiarEstadoDeposito(id: string, activo: boolean): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'depositos')) return { error: 'Tu rol no puede modificar depósitos.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('depositos')
    .update({ activo })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/depositos');
  return { ok: true };
}
