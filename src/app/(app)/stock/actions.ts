'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import {
  ajusteStockSchema,
  transferenciaStockSchema,
  type AjusteStockInput,
  type TransferenciaStockInput,
} from '@/lib/domain/stock/schema';
import { mensajeDeErrorNegocio, primerErrorZod } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';
import type { RenglonKardexDb } from '@/lib/supabase/database.types';

/**
 * Ajuste manual de existencias.
 *
 * Va por RPC y no por `.insert()` sobre `stock_movimientos` para que la
 * validación de saldo negativo y la exigencia de motivo corran del lado
 * de la base, donde no se pueden saltear.
 */
export async function ajustarStock(input: AjusteStockInput): Promise<AccionResult> {
  const parsed = ajusteStockSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'stock_movimientos')) {
    return { error: 'Tu rol no puede ajustar stock.' };
  }

  const supabase = await createClient();
  const d = parsed.data;

  const { data, error } = await supabase.rpc('ajustar_stock', {
    p_empresa_id: empresa.empresaId,
    p_producto_id: d.productoId,
    p_deposito_id: d.depositoId,
    p_cantidad: d.cantidad,
    p_motivo: d.motivo,
    p_costo_unitario: d.costoUnitario,
  });

  if (error) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/stock');
  revalidatePath(`/stock/${d.productoId}`);
  return { ok: true, id: data ?? undefined };
}

/**
 * Transferencia entre depósitos.
 *
 * Los dos movimientos espejo los hace la función de Postgres en una sola
 * transacción. Si acá se hicieran dos llamadas separadas, un fallo entre
 * medio dejaría mercadería evaporada.
 */
export async function transferirStock(
  input: TransferenciaStockInput,
): Promise<AccionResult> {
  const parsed = transferenciaStockSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'stock_movimientos')) {
    return { error: 'Tu rol no puede transferir stock.' };
  }

  const supabase = await createClient();
  const d = parsed.data;

  const { error } = await supabase.rpc('transferir_stock', {
    p_empresa_id: empresa.empresaId,
    p_producto_id: d.productoId,
    p_origen_id: d.origenId,
    p_destino_id: d.destinoId,
    p_cantidad: d.cantidad,
    p_motivo: d.motivo || null,
  });

  if (error) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/stock');
  revalidatePath(`/stock/${d.productoId}`);
  return { ok: true };
}

export type ProductoBusqueda = {
  id: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  manejaStock: boolean;
};

/** Buscador de productos para los formularios de ajuste y transferencia. */
export async function buscarProductosStock(termino: string): Promise<ProductoBusqueda[]> {
  const limpio = termino.trim();
  if (limpio.length < 2) return [];

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const like = `%${limpio.replace(/[,()]/g, ' ').trim()}%`;
  const { data } = await supabase
    .from('productos')
    .select('id, codigo, nombre, unidad_medida, maneja_stock')
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true)
    .eq('maneja_stock', true)
    .or(`codigo.ilike.${like},nombre.ilike.${like},codigo_barras.ilike.${like}`)
    .order('nombre')
    .limit(20);

  return (data ?? []).map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    unidadMedida: p.unidad_medida,
    manejaStock: p.maneja_stock,
  }));
}

/** Kardex de un producto. El saldo corrido lo calcula Postgres. */
export async function obtenerKardex(
  productoId: string,
  opciones: { depositoId?: string | null; desde?: string | null; hasta?: string | null } = {},
): Promise<RenglonKardexDb[]> {
  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const { data } = await supabase.rpc('kardex_producto', {
    p_empresa_id: empresa.empresaId,
    p_producto_id: productoId,
    p_deposito_id: opciones.depositoId ?? null,
    p_desde: opciones.desde ?? null,
    p_hasta: opciones.hasta ?? null,
  });

  return data ?? [];
}
