'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { productoSchema, type ProductoInput } from '@/lib/domain/productos/schema';
import { primerErrorZod, traducirErrorDb } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type ProductoInsert = Database['public']['Tables']['productos']['Insert'];

function nuloSiVacio(valor: string): string | null {
  const v = valor.trim();
  return v.length === 0 ? null : v;
}

function aRegistro(input: ProductoInput, empresaId: string): ProductoInsert {
  return {
    empresa_id: empresaId,
    codigo: input.codigo.trim(),
    codigo_barras: nuloSiVacio(input.codigoBarras),
    nombre: input.nombre.trim(),
    descripcion: nuloSiVacio(input.descripcion),
    categoria_id: input.categoriaId,
    unidad_medida: input.unidadMedida,
    alicuota_iva: input.alicuotaIva,
    precio_costo: input.precioCosto,
    maneja_stock: input.manejaStock,
    stock_minimo: input.stockMinimo,
    permite_venta_sin_stock: input.permiteVentaSinStock,
  };
}

export async function crearProducto(input: ProductoInput): Promise<AccionResult> {
  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'productos')) return { error: 'Tu rol no puede crear productos.' };

  const supabase = await createClient();
  const { error } = await supabase.from('productos').insert(aRegistro(parsed.data, empresa.empresaId));
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/productos');
  return { ok: true };
}

export async function actualizarProducto(id: string, input: ProductoInput): Promise<AccionResult> {
  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'productos')) return { error: 'Tu rol no puede editar productos.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('productos')
    .update(aRegistro(parsed.data, empresa.empresaId))
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/productos');
  return { ok: true };
}

export async function cambiarEstadoProducto(id: string, activo: boolean): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'productos')) return { error: 'Tu rol no puede modificar productos.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('productos')
    .update({ activo })
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId);
  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/productos');
  return { ok: true };
}
