'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { puntoVentaSchema, type PuntoVentaInput } from '@/lib/domain/puntos-venta/schema';
import { primerErrorZod, traducirErrorDb } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';

export async function crearPuntoVenta(input: PuntoVentaInput): Promise<AccionResult> {
  const parsed = puntoVentaSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'puntos_venta')) {
    return { error: 'Tu rol no puede crear puntos de venta.' };
  }

  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.from('puntos_venta').insert({
    empresa_id: empresa.empresaId,
    numero: d.numero,
    descripcion: d.descripcion.trim() || null,
    tipo_emision: d.tipoEmision,
  });
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/puntos-venta');
  return { ok: true };
}

export async function actualizarPuntoVenta(
  id: string,
  input: PuntoVentaInput,
): Promise<AccionResult> {
  const parsed = puntoVentaSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'puntos_venta')) {
    return { error: 'Tu rol no puede editar puntos de venta.' };
  }

  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase
    .from('puntos_venta')
    .update({
      numero: d.numero,
      descripcion: d.descripcion.trim() || null,
      tipo_emision: d.tipoEmision,
    })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/puntos-venta');
  return { ok: true };
}

export async function cambiarEstadoPuntoVenta(id: string, activo: boolean): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'puntos_venta')) {
    return { error: 'Tu rol no puede modificar puntos de venta.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('puntos_venta')
    .update({ activo })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/puntos-venta');
  return { ok: true };
}
