import { renderComprobantePdf, type DatosPdf } from '@/components/pdf/comprobante-pdf';
import { requireEmpresa } from '@/lib/auth/contexto';
import {
  ETIQUETA_TIPO,
  formatearNumeroComprobante,
} from '@/lib/domain/comprobantes/etiquetas';
import { createClient } from '@/lib/supabase/server';
import type {
  CondicionIva,
  CondicionVenta,
  TipoComprobante,
} from '@/lib/supabase/database.types';

/** `@react-pdf/renderer` necesita APIs de Node: no corre en el edge. */
export const runtime = 'nodejs';

type Fila = {
  id: string;
  tipo_comprobante: TipoComprobante;
  numero: number | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  condicion_venta: CondicionVenta;
  neto_gravado: number;
  neto_no_gravado: number;
  exento: number;
  iva_105: number;
  iva_21: number;
  iva_27: number;
  otros_impuestos: number;
  descuento_porcentaje: number;
  descuento_importe: number;
  total: number;
  cae: string | null;
  cae_vencimiento: string | null;
  observaciones: string | null;
  comprobante_origen_id: string | null;
  empresas: {
    razon_social: string;
    nombre_fantasia: string | null;
    cuit: string;
    condicion_iva: CondicionIva;
    domicilio: string | null;
    localidad: string | null;
    provincia: string | null;
    ingresos_brutos: string | null;
    inicio_actividades: string | null;
  } | null;
  clientes: {
    razon_social: string;
    cuit_dni: string | null;
    condicion_iva: CondicionIva;
    domicilio: string | null;
    localidad: string | null;
  } | null;
  puntos_venta: { numero: number } | null;
  comprobante_items: {
    orden: number;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    descuento_porcentaje: number;
    alicuota_iva: number;
    subtotal: number;
  }[];
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const { data } = await supabase
    .from('comprobantes')
    .select(
      `id, tipo_comprobante, numero, fecha_emision, fecha_vencimiento, condicion_venta,
       neto_gravado, neto_no_gravado, exento, iva_105, iva_21, iva_27, otros_impuestos,
       descuento_porcentaje, descuento_importe, total, cae, cae_vencimiento, observaciones,
       comprobante_origen_id,
       empresas ( razon_social, nombre_fantasia, cuit, condicion_iva, domicilio, localidad,
                  provincia, ingresos_brutos, inicio_actividades ),
       clientes ( razon_social, cuit_dni, condicion_iva, domicilio, localidad ),
       puntos_venta ( numero ),
       comprobante_items ( orden, descripcion, cantidad, precio_unitario, descuento_porcentaje,
                           alicuota_iva, subtotal )`,
    )
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId)
    .single();

  if (!data) {
    return new Response('Comprobante no encontrado', { status: 404 });
  }

  const c = data as unknown as Fila;
  if (!c.empresas || !c.clientes) {
    return new Response('Faltan datos del emisor o del receptor', { status: 409 });
  }

  // Comprobante asociado, si lo hay: en una nota de crédito es obligatorio.
  let origen: string | null = null;
  if (c.comprobante_origen_id) {
    const { data: o } = await supabase
      .from('comprobantes')
      .select('tipo_comprobante, numero, puntos_venta ( numero )')
      .eq('id', c.comprobante_origen_id)
      .single();
    if (o) {
      const oo = o as unknown as {
        tipo_comprobante: TipoComprobante;
        numero: number | null;
        puntos_venta: { numero: number } | null;
      };
      origen = `${ETIQUETA_TIPO[oo.tipo_comprobante]} ${formatearNumeroComprobante(
        oo.puntos_venta?.numero,
        oo.numero,
      )}`;
    }
  }

  const datos: DatosPdf = {
    empresa: {
      razonSocial: c.empresas.razon_social,
      nombreFantasia: c.empresas.nombre_fantasia,
      cuit: c.empresas.cuit,
      condicionIva: c.empresas.condicion_iva,
      domicilio: c.empresas.domicilio,
      localidad: c.empresas.localidad,
      provincia: c.empresas.provincia,
      ingresosBrutos: c.empresas.ingresos_brutos,
      inicioActividades: c.empresas.inicio_actividades,
    },
    comprobante: {
      tipo: c.tipo_comprobante,
      numero: c.numero,
      puntoVenta: c.puntos_venta?.numero ?? null,
      fechaEmision: c.fecha_emision,
      fechaVencimiento: c.fecha_vencimiento,
      condicionVenta: c.condicion_venta,
      netoGravado: Number(c.neto_gravado),
      netoNoGravado: Number(c.neto_no_gravado),
      exento: Number(c.exento),
      iva105: Number(c.iva_105),
      iva21: Number(c.iva_21),
      iva27: Number(c.iva_27),
      otrosImpuestos: Number(c.otros_impuestos),
      descuentoPorcentaje: Number(c.descuento_porcentaje),
      descuentoImporte: Number(c.descuento_importe),
      total: Number(c.total),
      cae: c.cae,
      caeVencimiento: c.cae_vencimiento,
      observaciones: c.observaciones,
      origen,
    },
    cliente: {
      razonSocial: c.clientes.razon_social,
      documento: c.clientes.cuit_dni,
      condicionIva: c.clientes.condicion_iva,
      domicilio: c.clientes.domicilio,
      localidad: c.clientes.localidad,
    },
    items: [...c.comprobante_items]
      .sort((a, b) => a.orden - b.orden)
      .map((it) => ({
        orden: it.orden,
        descripcion: it.descripcion,
        cantidad: Number(it.cantidad),
        precioUnitario: Number(it.precio_unitario),
        descuentoPorcentaje: Number(it.descuento_porcentaje),
        alicuotaIva: Number(it.alicuota_iva),
        subtotal: Number(it.subtotal),
      })),
  };

  const buffer = await renderComprobantePdf(datos);
  const nombre = `${ETIQUETA_TIPO[c.tipo_comprobante]} ${formatearNumeroComprobante(
    datos.comprobante.puntoVenta,
    c.numero,
  )}`.replace(/[^\w\-. ]/g, '');

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombre}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
