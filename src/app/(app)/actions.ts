'use server';

import { revalidatePath } from 'next/cache';

import { getContexto } from '@/lib/auth/contexto';
import { setEmpresaActualId } from '@/lib/empresa/actual';
import { createClient } from '@/lib/supabase/server';

/** Cambia la empresa activa. Sólo si el usuario es miembro. */
export async function cambiarEmpresa(empresaId: string): Promise<void> {
  const contexto = await getContexto();
  if (!contexto) return;
  const esMiembro = contexto.membresias.some((m) => m.empresaId === empresaId);
  if (!esMiembro) return;

  await setEmpresaActualId(empresaId);
  revalidatePath('/', 'layout');
}

export type ResultadoBusqueda = {
  clientes: { id: string; razonSocial: string; detalle: string }[];
  productos: { id: string; codigo: string; nombre: string }[];
};

/**
 * Búsqueda global (⌘K): clientes y productos de la empresa activa.
 * RLS ya restringe a las empresas del usuario; además se filtra por la
 * empresa activa para no mezclar. Con `ilike` alcanza para el MVP.
 */
export async function buscarGlobal(termino: string): Promise<ResultadoBusqueda> {
  const t = termino.trim().replace(/[,()]/g, ' ').trim();
  if (t.length < 2) return { clientes: [], productos: [] };

  const contexto = await getContexto();
  if (!contexto?.empresa) return { clientes: [], productos: [] };
  const empresa = contexto.empresa;
  const supabase = await createClient();
  const patron = `%${t}%`;

  const [clientesRes, productosRes] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, razon_social, nombre_fantasia, cuit_dni')
      .eq('empresa_id', empresa.empresaId)
      .or(`razon_social.ilike.${patron},nombre_fantasia.ilike.${patron},cuit_dni.ilike.${patron}`)
      .order('razon_social')
      .limit(6),
    supabase
      .from('productos')
      .select('id, codigo, nombre, codigo_barras')
      .eq('empresa_id', empresa.empresaId)
      .or(`nombre.ilike.${patron},codigo.ilike.${patron},codigo_barras.ilike.${patron}`)
      .order('nombre')
      .limit(6),
  ]);

  return {
    clientes: (clientesRes.data ?? []).map((c) => ({
      id: c.id,
      razonSocial: c.razon_social,
      detalle: c.nombre_fantasia ?? c.cuit_dni ?? '',
    })),
    productos: (productosRes.data ?? []).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
    })),
  };
}
