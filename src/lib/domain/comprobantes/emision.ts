import 'server-only';

import { mensajeDeErrorNegocio } from '@/lib/errors';
import { getFacturacionProvider } from '@/lib/domain/facturacion';
import { createClient } from '@/lib/supabase/server';
import type {
  CondicionIva,
  EstadoComprobante,
  LetraComprobante,
  TipoComprobante,
  TipoDocumento,
} from '@/lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

import { esFactura, esNoFiscal, esNotaCredito, esNotaDebito } from './letra';

/**
 * Orquestación de la emisión.
 *
 * El orden importa y es lo que hace que se cumplan las dos reglas del
 * proyecto a la vez:
 *
 *   1. Se calcula el número TENTATIVO leyendo el contador, sin reservarlo.
 *   2. Se le pide el CAE al proveedor para ese número.
 *   3. Recién con el CAE en la mano se llama a `confirmar_emision_comprobante`,
 *      que en una sola transacción reserva el número, escribe el CAE,
 *      descuenta stock y carga la cuenta corriente.
 *
 * Si el paso 2 falla, no se escribió nada: el comprobante queda en
 * BORRADOR, sin número, con el motivo cargado y un botón de reintento.
 *
 * Si entre el paso 2 y el 3 otra emisión se quedó con ese número, el paso
 * 3 devuelve SQLSTATE 40001 y se reintenta el ciclo completo —incluida la
 * autorización— con el número siguiente. Así la serie queda correlativa,
 * sin huecos y sin números quemados.
 */

const MAX_INTENTOS = 5;
const SQLSTATE_REINTENTAR = '40001';

export type EmisionOk = {
  ok: true;
  comprobanteId: string;
  numero: number;
  cae: string | null;
  caeVencimiento: string | null;
};

export type EmisionFallida = {
  ok: false;
  error: string;
  /** ¿Sirve volver a apretar "Emitir" sin cambiar nada? */
  reintentable: boolean;
};

export type ResultadoEmisionApp = EmisionOk | EmisionFallida;

type Cliente = {
  tipo_doc: TipoDocumento;
  cuit_dni: string | null;
  condicion_iva: CondicionIva;
};

type Origen = {
  tipo_comprobante: TipoComprobante;
  numero: number | null;
  puntos_venta: { numero: number } | null;
};

type ComprobanteCompleto = {
  id: string;
  empresa_id: string;
  tipo_comprobante: TipoComprobante;
  letra: LetraComprobante;
  estado: EstadoComprobante;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  moneda: string;
  cotizacion: number;
  neto_gravado: number;
  neto_no_gravado: number;
  exento: number;
  iva_105: number;
  iva_21: number;
  iva_27: number;
  otros_impuestos: number;
  total: number;
  punto_venta_id: string;
  comprobante_origen_id: string | null;
  empresas: { cuit: string } | null;
  clientes: Cliente | null;
  puntos_venta: { numero: number } | null;
};

const SELECT_COMPLETO = `
  id, empresa_id, tipo_comprobante, letra, estado, fecha_emision, fecha_vencimiento,
  moneda, cotizacion, neto_gravado, neto_no_gravado, exento,
  iva_105, iva_21, iva_27, otros_impuestos, total,
  punto_venta_id, comprobante_origen_id,
  empresas ( cuit ),
  clientes ( tipo_doc, cuit_dni, condicion_iva ),
  puntos_venta ( numero )
`;

function esErrorDeConcurrencia(error: { code?: string } | null): boolean {
  return error?.code === SQLSTATE_REINTENTAR;
}

/** Deja constancia del fallo sin tocar número ni estado. */
async function registrarFallo(
  supabase: SupabaseClient,
  comprobanteId: string,
  estado: string,
  observaciones: string,
): Promise<void> {
  await supabase.rpc('registrar_fallo_autorizacion', {
    p_comprobante_id: comprobanteId,
    p_estado: estado,
    p_observaciones: observaciones,
  });
}

export async function emitirComprobante(
  comprobanteId: string,
  opciones: { forzarCredito?: boolean } = {},
): Promise<ResultadoEmisionApp> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('comprobantes')
    .select(SELECT_COMPLETO)
    .eq('id', comprobanteId)
    .single();

  if (error || !data) {
    return { ok: false, error: 'No se encontró el comprobante.', reintentable: false };
  }

  const c = data as unknown as ComprobanteCompleto;

  if (c.estado !== 'BORRADOR') {
    return {
      ok: false,
      error: `El comprobante ya fue emitido (estado ${c.estado.toLowerCase()}).`,
      reintentable: false,
    };
  }

  // ---------------------------------------------------------------
  // Comprobantes internos: no pasan por AFIP.
  // ---------------------------------------------------------------
  if (esNoFiscal(c.tipo_comprobante)) {
    const { data: res, error: errNoFiscal } = await supabase.rpc('emitir_comprobante_no_fiscal', {
      p_comprobante_id: comprobanteId,
    });

    if (errNoFiscal) {
      return { ok: false, error: mensajeDeErrorNegocio(errNoFiscal), reintentable: false };
    }

    const fila = res as unknown as { numero: number };
    return {
      ok: true,
      comprobanteId,
      numero: fila.numero,
      cae: null,
      caeVencimiento: null,
    };
  }

  // ---------------------------------------------------------------
  // Comprobantes fiscales
  // ---------------------------------------------------------------
  const provider = getFacturacionProvider();
  const tipo = c.tipo_comprobante;

  // El organismo manda sobre la numeración: se adelanta el contador local
  // si quedó atrás. Si la consulta falla, se sigue con el contador local;
  // no vale bloquear una venta porque el servicio de consulta no responde.
  try {
    const ultimoRemoto = await provider.consultarUltimoNumero(
      c.puntos_venta?.numero ?? 0,
      tipo,
    );
    if (ultimoRemoto > 0) {
      await supabase.rpc('sincronizar_contador_comprobante', {
        p_empresa_id: c.empresa_id,
        p_punto_venta_id: c.punto_venta_id,
        p_tipo: tipo,
        p_ultimo_numero: ultimoRemoto,
      });
    }
  } catch {
    // Silencio deliberado: el contador local alcanza para seguir.
  }

  // Comprobante asociado, obligatorio en notas de crédito y débito.
  let asociado: { tipoComprobante: TipoComprobante; puntoVenta: number; numero: number } | null = null;
  if ((esNotaCredito(tipo) || esNotaDebito(tipo)) && c.comprobante_origen_id) {
    const { data: origen } = await supabase
      .from('comprobantes')
      .select('tipo_comprobante, numero, puntos_venta ( numero )')
      .eq('id', c.comprobante_origen_id)
      .single();

    const o = origen as unknown as Origen | null;
    if (o?.numero != null) {
      asociado = {
        tipoComprobante: o.tipo_comprobante,
        puntoVenta: o.puntos_venta?.numero ?? 0,
        numero: o.numero,
      };
    }
  }

  let ultimoMensaje = 'No se pudo emitir el comprobante.';

  for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
    const { data: tentativo, error: errNumero } = await supabase.rpc('proximo_numero_tentativo', {
      p_empresa_id: c.empresa_id,
      p_punto_venta_id: c.punto_venta_id,
      p_tipo: c.tipo_comprobante,
    });

    if (errNumero || tentativo == null) {
      return {
        ok: false,
        error: mensajeDeErrorNegocio(errNumero),
        reintentable: true,
      };
    }

    const numero = Number(tentativo);

    const autorizacion = await provider.autorizar({
      cuitEmisor: c.empresas?.cuit ?? '',
      puntoVenta: c.puntos_venta?.numero ?? 0,
      tipoComprobante: tipo,
      letra: c.letra,
      numero,
      tipoDocReceptor: c.clientes?.tipo_doc ?? 'SIN_IDENTIFICAR',
      documentoReceptor: c.clientes?.cuit_dni ?? null,
      condicionIvaReceptor: c.clientes?.condicion_iva ?? 'CONSUMIDOR_FINAL',
      fechaEmision: c.fecha_emision,
      fechaVencimientoPago: c.fecha_vencimiento,
      moneda: c.moneda,
      cotizacion: Number(c.cotizacion),
      netoGravado: Number(c.neto_gravado),
      netoNoGravado: Number(c.neto_no_gravado),
      exento: Number(c.exento),
      iva105: Number(c.iva_105),
      iva21: Number(c.iva_21),
      iva27: Number(c.iva_27),
      otrosImpuestos: Number(c.otros_impuestos),
      total: Number(c.total),
      comprobanteAsociado: asociado,
    });

    if (!autorizacion.ok) {
      // El proveedor rechazó. No se escribió nada: el número sigue libre.
      await registrarFallo(
        supabase,
        comprobanteId,
        `RECHAZADO ${autorizacion.codigo}`,
        autorizacion.mensaje,
      );
      return {
        ok: false,
        error: autorizacion.mensaje,
        reintentable: autorizacion.reintentable,
      };
    }

    const { data: res, error: errConfirmar } = await supabase.rpc(
      'confirmar_emision_comprobante',
      {
        p_comprobante_id: comprobanteId,
        p_numero: numero,
        p_cae: autorizacion.cae,
        p_cae_vencimiento: autorizacion.caeVencimiento,
        p_afip_estado: autorizacion.estado,
        p_forzar_credito: opciones.forzarCredito ?? false,
      },
    );

    if (!errConfirmar && res) {
      const fila = res as unknown as { numero: number };
      return {
        ok: true,
        comprobanteId,
        numero: fila.numero,
        cae: autorizacion.cae,
        caeVencimiento: autorizacion.caeVencimiento,
      };
    }

    if (esErrorDeConcurrencia(errConfirmar)) {
      // Otra emisión se quedó con ese número. El CAE que acabamos de
      // pedir no sirve para el siguiente, así que se vuelve a autorizar.
      ultimoMensaje =
        'Otra emisión tomó ese número al mismo tiempo. Reintentá en unos segundos.';
      continue;
    }

    const mensaje = mensajeDeErrorNegocio(errConfirmar);
    await registrarFallo(supabase, comprobanteId, 'ERROR', mensaje);
    return { ok: false, error: mensaje, reintentable: false };
  }

  await registrarFallo(supabase, comprobanteId, 'CONCURRENCIA', ultimoMensaje);
  return { ok: false, error: ultimoMensaje, reintentable: true };
}

/** ¿El comprobante admite que se le emita una nota de crédito? */
export function admiteNotaCredito(tipo: TipoComprobante, estado: EstadoComprobante): boolean {
  return esFactura(tipo) && ['EMITIDO', 'PARCIAL', 'PAGADO'].includes(estado);
}
