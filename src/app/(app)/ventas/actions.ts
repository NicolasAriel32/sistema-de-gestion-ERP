'use server';

import { revalidatePath } from 'next/cache';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir, puedeForzarLimiteCredito } from '@/lib/auth/permisos';
import { calcularTotales, reexpresarPrecio } from '@/lib/domain/comprobantes/calculo';
import { emitirComprobante } from '@/lib/domain/comprobantes/emision';
import {
  determinarLetra,
  modoIvaDeLetra,
  tipoComprobanteDe,
  type LetraFiscal,
  type ModoIva,
} from '@/lib/domain/comprobantes/letra';
import { comprobanteSchema, type ComprobanteInput } from '@/lib/domain/comprobantes/schema';
import { mensajeDeErrorNegocio, primerErrorZod, traducirErrorDb } from '@/lib/errors';
import type { AccionResult } from '@/lib/forms/resultado';
import { createClient } from '@/lib/supabase/server';
import type {
  CondicionIva,
  CondicionIvaEmisor,
  TipoComprobante,
} from '@/lib/supabase/database.types';

// =====================================================================
// Búsquedas para la pantalla de emisión
// =====================================================================

export type ClienteVenta = {
  id: string;
  razonSocial: string;
  documento: string;
  condicionIva: CondicionIva;
  listaPrecioId: string | null;
  limiteCredito: number;
  diasCredito: number;
};

export async function buscarClientesVenta(termino: string): Promise<ClienteVenta[]> {
  const t = termino.trim().replace(/[,()]/g, ' ').trim();
  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  let query = supabase
    .from('clientes')
    .select('id, razon_social, cuit_dni, condicion_iva, lista_precio_id, limite_credito, dias_credito')
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true);

  if (t.length >= 1) {
    const patron = `%${t}%`;
    query = query.or(
      `razon_social.ilike.${patron},nombre_fantasia.ilike.${patron},cuit_dni.ilike.${patron}`,
    );
  }

  const { data } = await query.order('razon_social').limit(20);

  return (data ?? []).map((c) => ({
    id: c.id,
    razonSocial: c.razon_social,
    documento: c.cuit_dni ?? '',
    condicionIva: c.condicion_iva,
    listaPrecioId: c.lista_precio_id,
    limiteCredito: Number(c.limite_credito),
    diasCredito: c.dias_credito,
  }));
}

export type ProductoVenta = {
  id: string;
  codigo: string;
  nombre: string;
  alicuotaIva: number;
  /** Ya expresado en el modo de IVA del comprobante que se está armando. */
  precio: number;
  manejaStock: boolean;
  permiteVentaSinStock: boolean;
  saldo: number | null;
};

/**
 * Busca productos y devuelve el precio ya adaptado a la letra del
 * comprobante: neto para una A, con IVA incluido para una B o C.
 *
 * `precios.precio_neto` es siempre neto; la conversión ocurre acá para
 * que la pantalla muestre el número que el vendedor tiene que ver.
 */
export async function buscarProductosVenta(
  termino: string,
  opciones: { listaPrecioId: string | null; depositoId: string | null; modoIva: ModoIva },
): Promise<ProductoVenta[]> {
  const t = termino.trim().replace(/[,()]/g, ' ').trim();
  if (t.length < 1) return [];

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();
  const patron = `%${t}%`;

  const { data } = await supabase
    .from('productos')
    .select(
      'id, codigo, nombre, alicuota_iva, precio_costo, maneja_stock, permite_venta_sin_stock, precios ( lista_precio_id, precio_neto )',
    )
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true)
    .or(`nombre.ilike.${patron},codigo.ilike.${patron},codigo_barras.ilike.${patron}`)
    .order('nombre')
    .limit(15);

  type Fila = {
    id: string;
    codigo: string;
    nombre: string;
    alicuota_iva: number;
    precio_costo: number;
    maneja_stock: boolean;
    permite_venta_sin_stock: boolean;
    precios: { lista_precio_id: string; precio_neto: number }[] | null;
  };

  const filas = (data ?? []) as unknown as Fila[];
  if (filas.length === 0) return [];

  // Saldos de stock en el depósito elegido, en una sola consulta.
  const saldos = new Map<string, number>();
  if (opciones.depositoId) {
    const { data: filasSaldo } = await supabase.rpc('saldos_de_productos', {
      p_empresa_id: empresa.empresaId,
      p_producto_ids: filas.map((f) => f.id),
      p_deposito_id: opciones.depositoId,
    });
    for (const s of (filasSaldo ?? []) as { producto_id: string; saldo: number }[]) {
      saldos.set(s.producto_id, Number(s.saldo));
    }
  }

  return filas.map((f) => {
    const precioLista = f.precios?.find((p) => p.lista_precio_id === opciones.listaPrecioId);
    // Sin lista asignada se cae al costo: es preferible un precio visible
    // y corregible a mano que un cero silencioso.
    const neto = precioLista ? Number(precioLista.precio_neto) : Number(f.precio_costo);

    return {
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      alicuotaIva: Number(f.alicuota_iva),
      precio: reexpresarPrecio(neto, f.alicuota_iva, 'DISCRIMINADO', opciones.modoIva),
      manejaStock: f.maneja_stock,
      permiteVentaSinStock: f.permite_venta_sin_stock,
      saldo: f.maneja_stock ? (saldos.get(f.id) ?? 0) : null,
    };
  });
}

// =====================================================================
// Armado del comprobante
// =====================================================================

type Resuelto = {
  tipo: TipoComprobante;
  letraDb: 'A' | 'B' | 'C' | 'X';
  letraFiscal: LetraFiscal;
  modoIva: ModoIva;
};

/**
 * Deriva tipo, letra y tratamiento del IVA. La letra nunca la elige el
 * usuario: sale de la condición frente al IVA del emisor y del receptor.
 */
function resolverTipo(
  clase: ComprobanteInput['clase'],
  condicionEmisor: CondicionIvaEmisor,
  condicionReceptor: CondicionIva,
): Resuelto {
  const letraFiscal = determinarLetra(condicionEmisor, condicionReceptor);

  if (clase === 'PRESUPUESTO' || clase === 'PEDIDO' || clase === 'REMITO') {
    // Un comprobante interno no liquida impuestos, pero tiene que mostrar
    // el precio que el cliente va a pagar: se trata con IVA incluido.
    return { tipo: clase, letraDb: 'X', letraFiscal, modoIva: 'INCLUIDO' };
  }

  const tipo = tipoComprobanteDe(clase, letraFiscal);
  return { tipo, letraDb: letraFiscal, letraFiscal, modoIva: modoIvaDeLetra(letraFiscal) };
}

async function cargarContextoFiscal(clienteId: string) {
  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const [{ data: emp }, { data: cli }] = await Promise.all([
    supabase.from('empresas').select('condicion_iva').eq('id', empresa.empresaId).single(),
    supabase
      .from('clientes')
      .select('condicion_iva, dias_credito')
      .eq('id', clienteId)
      .eq('empresa_id', empresa.empresaId)
      .single(),
  ]);

  return { empresa, supabase, emisor: emp?.condicion_iva ?? null, cliente: cli ?? null };
}

/** Payload que consume `crear_comprobante_borrador`. */
function armarPayload(
  input: ComprobanteInput,
  resuelto: Resuelto,
  empresaId: string,
): Record<string, unknown> {
  const totales = calcularTotales(input.items, {
    modoIva: resuelto.modoIva,
    descuentoPorcentaje: input.descuentoPorcentaje,
  });

  return {
    empresa_id: empresaId,
    tipo_comprobante: resuelto.tipo,
    letra: resuelto.letraDb,
    punto_venta_id: input.puntoVentaId,
    cliente_id: input.clienteId,
    deposito_id: input.depositoId,
    lista_precio_id: input.listaPrecioId,
    vendedor_id: input.vendedorId,
    fecha_emision: input.fechaEmision,
    fecha_vencimiento: input.fechaVencimiento === '' ? null : input.fechaVencimiento,
    condicion_venta: input.condicionVenta,
    comprobante_origen_id: input.comprobanteOrigenId,
    observaciones: input.observaciones,
    neto_gravado: totales.netoGravado,
    neto_no_gravado: totales.netoNoGravado,
    exento: totales.exento,
    iva_105: totales.iva105,
    iva_21: totales.iva21,
    iva_27: totales.iva27,
    otros_impuestos: totales.otrosImpuestos,
    descuento_porcentaje: totales.descuentoPorcentaje,
    descuento_importe: totales.descuentoImporte,
    total: totales.total,
    items: input.items.map((item, i) => {
      const calculado = totales.items[i];
      return {
        producto_id: item.productoId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precioUnitario,
        descuento_porcentaje: item.descuentoPorcentaje,
        alicuota_iva: item.alicuotaIva,
        subtotal_neto: calculado?.subtotalNeto ?? 0,
        subtotal_iva: calculado?.subtotalIva ?? 0,
        subtotal: calculado?.subtotal ?? 0,
      };
    }),
  };
}

export type GuardadoResult = { ok: true; id: string } | { error: string };

/**
 * Crea o actualiza el borrador. Los importes se recalculan SIEMPRE en el
 * servidor con el motor de `/lib/domain`: lo que manda el navegador se
 * usa para las cantidades y los precios, nunca para los totales.
 */
export async function guardarBorrador(
  input: ComprobanteInput,
  comprobanteId?: string,
): Promise<GuardadoResult> {
  const parsed = comprobanteSchema.safeParse(input);
  if (!parsed.success) return { error: primerErrorZod(parsed.error) };

  const { empresa, supabase, emisor, cliente } = await cargarContextoFiscal(parsed.data.clienteId);

  if (!puedeEscribir(empresa.rol, 'comprobantes')) {
    return { error: 'Tu rol no puede emitir comprobantes de venta.' };
  }
  if (!emisor || !cliente) {
    return { error: 'No se pudo resolver la condición frente al IVA del emisor o del cliente.' };
  }

  const resuelto = resolverTipo(parsed.data.clase, emisor, cliente.condicion_iva);

  let payload: Record<string, unknown>;
  try {
    payload = armarPayload(parsed.data, resuelto, empresa.empresaId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudieron calcular los importes.' };
  }

  if (comprobanteId) {
    const { error } = await supabase.rpc('actualizar_comprobante_borrador', {
      p_comprobante_id: comprobanteId,
      p_datos: payload,
    });
    if (error) return { error: mensajeDeErrorNegocio(error) };
    revalidatePath('/ventas');
    return { ok: true, id: comprobanteId };
  }

  const { data, error } = await supabase.rpc('crear_comprobante_borrador', { p_datos: payload });
  if (error || !data) return { error: mensajeDeErrorNegocio(error) };

  revalidatePath('/ventas');
  return { ok: true, id: data as unknown as string };
}

export type EmisionResult =
  | { ok: true; id: string; numero: number; cae: string | null }
  | { error: string; reintentable: boolean; id?: string };

/** Guarda el borrador y lo emite. Es lo que hace el botón "Emitir" (F10). */
export async function guardarYEmitir(
  input: ComprobanteInput,
  opciones: { comprobanteId?: string; forzarCredito?: boolean } = {},
): Promise<EmisionResult> {
  const guardado = await guardarBorrador(input, opciones.comprobanteId);
  if ('error' in guardado) return { error: guardado.error, reintentable: false };

  return emitirBorrador(guardado.id, opciones.forzarCredito ?? false);
}

/** Reintento sobre un borrador que ya existe. */
export async function emitirBorrador(
  comprobanteId: string,
  forzarCredito = false,
): Promise<EmisionResult> {
  const { empresa } = await requireEmpresa();

  if (!puedeEscribir(empresa.rol, 'comprobantes')) {
    return { error: 'Tu rol no puede emitir comprobantes.', reintentable: false };
  }
  if (forzarCredito && !puedeForzarLimiteCredito(empresa.rol)) {
    return {
      error: 'Sólo un administrador puede emitir por encima del límite de crédito.',
      reintentable: false,
    };
  }

  const res = await emitirComprobante(comprobanteId, { forzarCredito });

  revalidatePath('/ventas');
  revalidatePath(`/ventas/${comprobanteId}`);

  if (!res.ok) {
    return { error: res.error, reintentable: res.reintentable, id: comprobanteId };
  }

  return { ok: true, id: comprobanteId, numero: res.numero, cae: res.cae };
}

export async function eliminarBorrador(comprobanteId: string): Promise<AccionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'comprobantes')) {
    return { error: 'Tu rol no puede eliminar comprobantes.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('comprobantes')
    .delete()
    .eq('id', comprobanteId)
    .eq('empresa_id', empresa.empresaId)
    .eq('estado', 'BORRADOR');

  if (error) return { error: traducirErrorDb(error) };

  revalidatePath('/ventas');
  return { ok: true, id: comprobanteId };
}

// =====================================================================
// Nota de crédito de anulación
// =====================================================================

export async function anularConNotaCredito(
  comprobanteId: string,
  motivo: string,
): Promise<EmisionResult> {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'comprobantes')) {
    return { error: 'Tu rol no puede emitir notas de crédito.', reintentable: false };
  }

  const texto = motivo.trim();
  if (texto.length < 3) {
    return { error: 'Escribí el motivo de la anulación.', reintentable: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('crear_nota_credito_borrador', {
    p_comprobante_origen_id: comprobanteId,
    p_motivo: texto,
  });

  if (error || !data) {
    return { error: mensajeDeErrorNegocio(error), reintentable: false };
  }

  const notaId = data as unknown as string;
  const res = await emitirComprobante(notaId);

  revalidatePath('/ventas');
  revalidatePath(`/ventas/${comprobanteId}`);

  if (!res.ok) {
    // La NC quedó en borrador con el motivo del rechazo: se reintenta
    // desde su propia ficha, sin volver a crearla.
    return { error: res.error, reintentable: res.reintentable, id: notaId };
  }

  return { ok: true, id: notaId, numero: res.numero, cae: res.cae };
}
