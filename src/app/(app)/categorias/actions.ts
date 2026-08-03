'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { categoriaSchema, type CategoriaInput } from '@/lib/domain/categorias/schema';
import { primerErrorZod, traducirErrorDb } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';

export async function crearCategoria(input: CategoriaInput): Promise<AccionResult> {
  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'categorias')) {
    return { error: 'Tu rol no puede crear categorías.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('categorias').insert({
    empresa_id: empresa.empresaId,
    nombre: parsed.data.nombre.trim(),
    padre_id: parsed.data.padreId,
  });
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/categorias');
  return { ok: true };
}

export async function actualizarCategoria(id: string, input: CategoriaInput): Promise<AccionResult> {
  const parsed = categoriaSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  if (parsed.data.padreId === id) {
    return { error: 'Una categoría no puede ser su propia categoría padre.' };
  }

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'categorias')) {
    return { error: 'Tu rol no puede editar categorías.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('categorias')
    .update({ nombre: parsed.data.nombre.trim(), padre_id: parsed.data.padreId })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/categorias');
  return { ok: true };
}

export async function cambiarEstadoCategoria(id: string, activa: boolean): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'categorias')) {
    return { error: 'Tu rol no puede modificar categorías.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('categorias')
    .update({ activa })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/categorias');
  return { ok: true };
}
