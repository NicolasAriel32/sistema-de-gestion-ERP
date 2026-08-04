'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import {
  calcularTotalesCompra,
  modoIvaDeLetra,
  totalesCompraCoherentes,
} from '@/lib/domain/compras/calculo';
import {
  anulacionCompraSchema,
  compraSchema,
  letraDeTipoCompra,
  ordenCompraSchema,
  type AnulacionCompraInput,
  type CompraInput,
  type OrdenCompraInput,
} from '@/lib/domain/compras/schema';
import { mensajeDeErrorNegocio, primerErrorZod } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------
// Búsquedas de apoyo
// ---------------------------------------------------------------------

export type ProveedorCompra = {
  id: string;
  razonSocial: string;
  /** El CUIT de proveedor es opcional en la DB (check: cuit is null or es_cuit_valido). */
  cuit: string | null;
  condicionIva: string;
};

export async function buscarProveedores(termino: string): Promise<ProveedorCompra[]> {
  const limpio = termino.trim();
  if (limpio.length < 2) return [];

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const like = `%${limpio.replace(/[,()]/g, ' ').trim()}%`;
  const { data } = await supabase
    .from('proveedores')
    .select('id, razon_social, cuit, condicion_iva')
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true)
    .or(`razon_social.ilike.${like},cuit.ilike.${like}`)
    .order('razon_social')
    .limit(20);

  return (data ?? []).map((p) => ({
    id: p.id,
    razonSocial: p.razon_social,
    cuit: p.cuit,
    condicionIva: p.condicion_iva,
  }));
}

export type ProductoCompra = {
  id: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  alicuotaIva: number;
  precioCosto: number;
  manejaStock: boolean;
};

export async function buscarProductosCompra(termino: string): Promise<ProductoCompra[]> {
  const limpio = termino.trim();
  if (limpio.length < 2) return [];

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const like = `%${limpio.replace(/[,()]/g, ' ').trim()}%`;
  const { data } = await supabase
    .from('productos')
    .select('id, codigo, nombre, unidad_medida, alicuota_iva, precio_costo, maneja_stock')
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true)
    .or(`codigo.ilike.${like},nombre.ilike.${like},codigo_barras.ilike.${like}`)
    .order('nombre')
    .limit(20);

  return (data ?? []).map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    unidadMedida: p.unidad_medida,
    alicuotaIva: Number(p.alicuota_iva),
    precioCosto: Number(p.precio_costo),
    manejaStock: p.maneja_stock,
  }));
}

/** Renglones pendientes de una orden, para precargar la factura. */
export async function obtenerPendienteOrden(ordenCompraId: string) {
  await requireEmpresa();
  const supabase = await createClient();

  const { data } = await supabase.rpc('pendiente_orden_compra', {
    p_orden_compra_id: ordenCompraId,
  });

  return (data ?? []).map((r) => ({
    productoId: r.producto_id,
    descripcion: r.descripcion,
    pendiente: Number(r.pendiente),
    precioUnitario: Number(r.precio_unitario),
    alicuotaIva: Number(r.alicuota_iva),
  }));
}

// ---------------------------------------------------------------------
// Órdenes de compra
// ---------------------------------------------------------------------

/**
 * Los importes se calculan acá, en el servidor, y viajan resueltos. El
 * navegador propone; el servidor dispone. Un total que llega del cliente
 * sin recalcular es un total que se puede falsear desde la consola.
 */
export async function guardarOrdenCompra(
  input: OrdenCompraInput,
  ordenCompraId?: string,
): Promise<AccionResult> {
  const parsed = ordenCompraSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'ordenes_compra')) {
    return { error: 'Tu rol no puede crear órdenes de compra.' };
  }

  const d = parsed.data;

  // Una orden de compra siempre se arma con IVA discriminado: es un
  // documento interno de presupuestación, no un comprobante fiscal.
  const totales = calcularTotalesCompra(d.items, { modoIva: 'DISCRIMINADO' });
  if (!totalesCompraCoherentes(totales)) {
    return { error: 'Los importes no cierran. Revisá las cantidades y los precios.' };
  }

  const payload = {
    empresa_id: empresa.empresaId,
    proveedor_id: d.proveedorId,
    deposito_id: d.depositoId,
    fecha: d.fecha,
    fecha_entrega: d.fechaEntrega || null,
    observaciones: d.observaciones,
    neto: totales.netoGravado,
    iva: totales.iva105 + totales.iva21 + totales.iva27,
    total: totales.total,
    // `calcularTotalesCompra` devuelve un renglón calculado por cada
    // renglón de entrada, en el mismo orden, así que el índice siempre
    // existe. `totales.items[i]!` sería más corto pero el `??` deja el
    // código a salvo si esa garantía cambiara.
    items: d.items.map((item, i) => {
      const calculado = totales.items[i];
      return {
        producto_id: item.productoId,
        descripcion: item.descripcion.trim(),
        cantidad: item.cantidad,
        precio_unitario: item.precioUnitario,
        alicuota_iva: item.alicuotaIva,
        subtotal_neto: calculado?.subtotalNeto ?? 0,
        subtotal_iva: calculado?.subtotalIva ?? 0,
        subtotal: calculado?.subtotal ?? 0,
      };
    }),
  };

  const supabase = await createClient();
  const { data, error } = ordenCompraId
    ? await supabase.rpc('actualizar_orden_compra_borrador', {
        p_orden_compra_id: ordenCompraId,
        p_datos: payload,
      })
    : await supabase.rpc('crear_orden_compra_borrador', { p_datos: payload });

  if (error) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/compras/ordenes');
  return { ok: true, id: data ?? ordenCompraId };
}

export async function emitirOrdenCompra(ordenCompraId: string): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'ordenes_compra')) {
    return { error: 'Tu rol no puede emitir órdenes de compra.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('emitir_orden_compra', {
    p_orden_compra_id: ordenCompraId,
  });

  if (error) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/compras/ordenes');
  revalidatePath(`/compras/ordenes/${ordenCompraId}`);
  return { ok: true, id: ordenCompraId };
}

export async function anularOrdenCompra(
  ordenCompraId: string,
  motivo: string,
): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'compras')) {
    return { error: 'Tu rol no puede anular órdenes de compra.' };
  }
  if (motivo.trim().length < 3) {
    return { error: 'Explicá el motivo de la anulación.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('anular_orden_compra', {
    p_orden_compra_id: ordenCompraId,
    p_motivo: motivo.trim(),
  });

  if (error) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/compras/ordenes');
  return { ok: true, id: ordenCompraId };
}

// ---------------------------------------------------------------------
// Facturas de proveedor
// ---------------------------------------------------------------------

/**
 * Registra la factura del proveedor: ingresa la mercadería, actualiza el
 * costo y, si es a cuenta corriente, genera la deuda. Todo eso ocurre en
 * la misma transacción dentro de `registrar_compra`.
 */
export async function registrarCompra(input: CompraInput): Promise<AccionResult> {
  const parsed = compraSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'compras')) {
    return { error: 'Tu rol no puede registrar facturas de proveedor.' };
  }

  const d = parsed.data;
  const letra = letraDeTipoCompra(d.tipoComprobante);
  const modoIva = modoIvaDeLetra(letra);

  const totales = calcularTotalesCompra(d.items, {
    modoIva,
    percepciones: d.percepciones.map((p) => ({
      tipo: p.tipo,
      jurisdiccion: p.jurisdiccion,
      baseImponible: p.baseImponible,
      alicuota: p.alicuota,
      importe: p.importe,
    })),
  });

  if (!totalesCompraCoherentes(totales)) {
    return { error: 'Los importes no cierran. Revisá las cantidades, los precios y las percepciones.' };
  }

  const payload = {
    empresa_id: empresa.empresaId,
    proveedor_id: d.proveedorId,
    orden_compra_id: d.ordenCompraId,
    tipo_comprobante: d.tipoComprobante,
    letra,
    punto_venta_numero: d.puntoVentaNumero,
    numero: d.numero,
    cae_proveedor: d.caeProveedor || null,
    fecha_emision: d.fechaEmision,
    fecha_vencimiento: d.fechaVencimiento || null,
    deposito_id: d.depositoId,
    condicion_venta: d.condicionVenta,
    moneda: 'ARS',
    cotizacion: 1,
    neto_gravado: totales.netoGravado,
    neto_no_gravado: totales.netoNoGravado,
    exento: totales.exento,
    iva_105: totales.iva105,
    iva_21: totales.iva21,
    iva_27: totales.iva27,
    total_percepciones: totales.totalPercepciones,
    total: totales.total,
    observaciones: d.observaciones,
    items: d.items.map((item, i) => {
      const calculado = totales.items[i];
      return {
        producto_id: item.productoId,
        descripcion: item.descripcion.trim(),
        cantidad: item.cantidad,
        precio_unitario: item.precioUnitario,
        alicuota_iva: item.alicuotaIva,
        subtotal_neto: calculado?.subtotalNeto ?? 0,
        subtotal_iva: calculado?.subtotalIva ?? 0,
        subtotal: calculado?.subtotal ?? 0,
      };
    }),
    percepciones: totales.percepciones.map((p) => ({
      tipo: p.tipo,
      jurisdiccion: p.jurisdiccion,
      base_imponible: p.baseImponible,
      alicuota: p.alicuota,
      importe: p.importe,
    })),
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('registrar_compra', { p_datos: payload });

  if (error) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/compras');
  revalidatePath('/compras/ordenes');
  revalidatePath('/stock');
  return { ok: true, id: data ?? undefined };
}

export async function anularCompra(input: AnulacionCompraInput): Promise<AccionResult> {
  const parsed = anulacionCompraSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'compras')) {
    return { error: 'Tu rol no puede anular facturas de proveedor.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('anular_compra', {
    p_compra_id: parsed.data.compraId,
    p_motivo: parsed.data.motivo,
  });

  if (error) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/compras');
  revalidatePath(`/compras/${parsed.data.compraId}`);
  revalidatePath('/stock');
  return { ok: true, id: parsed.data.compraId };
}
