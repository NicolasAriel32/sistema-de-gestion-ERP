import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir, puedeForzarLimiteCredito } from '@/lib/auth/permisos';
import { reexpresarPrecio } from '@/lib/domain/comprobantes/calculo';
import { ETIQUETA_TIPO, formatearNumeroComprobante } from '@/lib/domain/comprobantes/etiquetas';
import {
  determinarLetra,
  esNoFiscal,
  letraDeTipo,
  modoIvaDeLetra,
  type ModoIva,
} from '@/lib/domain/comprobantes/letra';
import { hoyIso } from '@/lib/fechas';
import { createClient } from '@/lib/supabase/server';
import type { CondicionIva, TipoComprobante } from '@/lib/supabase/database.types';

import {
  ComprobanteEditor,
  renglonVacio,
  type BorradorInicial,
  type Catalogos,
  type Renglon,
} from './comprobante-editor';

export const metadata: Metadata = { title: 'Nuevo comprobante' };

type Clase = BorradorInicial['clase'];

const CLASES_VALIDAS: Clase[] = ['FACTURA', 'PRESUPUESTO', 'PEDIDO', 'REMITO'];

/** Cómo estaban expresados los precios del comprobante de origen. */
function modoDeComprobante(tipo: TipoComprobante): ModoIva {
  if (esNoFiscal(tipo)) return 'INCLUIDO';
  const letra = letraDeTipo(tipo);
  return modoIvaDeLetra(letra === 'X' ? 'B' : (letra as 'A' | 'B' | 'C'));
}

export default async function NuevoComprobantePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'comprobantes')) notFound();

  const supabase = await createClient();

  const [{ data: emp }, { data: puntosVenta }, { data: depositos }, { data: listas }] =
    await Promise.all([
      supabase.from('empresas').select('condicion_iva').eq('id', empresa.empresaId).single(),
      supabase
        .from('puntos_venta')
        .select('id, numero, descripcion')
        .eq('empresa_id', empresa.empresaId)
        .eq('activo', true)
        .order('numero'),
      supabase
        .from('depositos')
        .select('id, nombre, es_default')
        .eq('empresa_id', empresa.empresaId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('listas_precios')
        .select('id, nombre, es_default')
        .eq('empresa_id', empresa.empresaId)
        .eq('activa', true)
        .order('nombre'),
    ]);

  if (!emp) notFound();

  const catalogos: Catalogos = {
    puntosVenta: (puntosVenta ?? []).map((p) => ({
      id: p.id,
      numero: p.numero,
      descripcion: p.descripcion,
    })),
    depositos: (depositos ?? []).map((d) => ({
      id: d.id,
      nombre: d.nombre,
      esDefault: d.es_default,
    })),
    listasPrecios: (listas ?? []).map((l) => ({
      id: l.id,
      nombre: l.nombre,
      esDefault: l.es_default,
    })),
  };

  if (catalogos.puntosVenta.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-background p-6 text-center">
        <h1 className="text-base font-semibold">Falta un punto de venta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No se puede emitir un comprobante sin punto de venta. Creá uno en Catálogos → Puntos de
          venta.
        </p>
      </div>
    );
  }

  const claseParam = primero(sp.clase).toUpperCase() as Clase;
  const claseInicial: Clase = CLASES_VALIDAS.includes(claseParam) ? claseParam : 'FACTURA';

  const depositoDefault =
    catalogos.depositos.find((d) => d.esDefault)?.id ?? catalogos.depositos[0]?.id ?? null;
  const listaDefault =
    catalogos.listasPrecios.find((l) => l.esDefault)?.id ?? catalogos.listasPrecios[0]?.id ?? null;

  let inicial: BorradorInicial = {
    id: null,
    clase: claseInicial,
    cliente: null,
    puntoVentaId: catalogos.puntosVenta[0]!.id,
    depositoId: depositoDefault,
    listaPrecioId: listaDefault,
    condicionVenta: 'CONTADO',
    fechaEmision: hoyIso(),
    fechaVencimiento: '',
    descuentoPorcentaje: '0',
    observaciones: '',
    comprobanteOrigenId: null,
    renglones: [renglonVacio()],
  };

  let origen: { id: string; descripcion: string } | null = null;

  // -------------------------------------------------------------------
  // Conversión presupuesto → pedido → factura, o edición de un borrador.
  // -------------------------------------------------------------------
  const desdeId = primero(sp.desde);
  const editarId = primero(sp.editar);
  const fuenteId = desdeId || editarId;

  if (fuenteId) {
    const { data: fuente } = await supabase
      .from('comprobantes')
      .select(
        `id, tipo_comprobante, letra, estado, numero, punto_venta_id, deposito_id, lista_precio_id,
         cliente_id, condicion_venta, fecha_emision, fecha_vencimiento, descuento_porcentaje,
         observaciones,
         puntos_venta ( numero ),
         clientes ( id, razon_social, cuit_dni, condicion_iva, lista_precio_id, limite_credito, dias_credito ),
         comprobante_items ( orden, producto_id, descripcion, cantidad, precio_unitario, descuento_porcentaje, alicuota_iva )`,
      )
      .eq('id', fuenteId)
      .eq('empresa_id', empresa.empresaId)
      .single();

    if (fuente) {
      type Fuente = {
        id: string;
        tipo_comprobante: TipoComprobante;
        estado: string;
        numero: number | null;
        punto_venta_id: string;
        deposito_id: string | null;
        lista_precio_id: string | null;
        condicion_venta: 'CONTADO' | 'CUENTA_CORRIENTE';
        fecha_emision: string;
        fecha_vencimiento: string | null;
        descuento_porcentaje: number;
        observaciones: string | null;
        puntos_venta: { numero: number } | null;
        clientes: {
          id: string;
          razon_social: string;
          cuit_dni: string | null;
          condicion_iva: CondicionIva;
          lista_precio_id: string | null;
          limite_credito: number;
          dias_credito: number;
        } | null;
        comprobante_items: {
          orden: number;
          producto_id: string | null;
          descripcion: string;
          cantidad: number;
          precio_unitario: number;
          descuento_porcentaje: number;
          alicuota_iva: number;
        }[];
      };

      const f = fuente as unknown as Fuente;
      const esEdicion = Boolean(editarId) && f.estado === 'BORRADOR';

      // Al convertir, la clase destino puede cambiar el tratamiento del
      // IVA: un presupuesto guarda precio final y una factura A lo
      // necesita neto. Sin reexpresar, el total se dispararía un 21%.
      const modoOrigen = modoDeComprobante(f.tipo_comprobante);
      const claseDestino: Clase = esEdicion
        ? esNoFiscal(f.tipo_comprobante)
          ? (f.tipo_comprobante as Clase)
          : 'FACTURA'
        : claseInicial;

      // Un comprobante interno siempre muestra el precio final; una
      // factura depende de su letra, que sale de las dos condiciones IVA.
      const modoDestino: ModoIva =
        claseDestino === 'FACTURA' && f.clientes
          ? modoIvaDeLetra(determinarLetra(emp.condicion_iva, f.clientes.condicion_iva))
          : 'INCLUIDO';

      const renglones: Renglon[] = [...f.comprobante_items]
        .sort((a, b) => a.orden - b.orden)
        .map((it) => ({
          ...renglonVacio(),
          productoId: it.producto_id,
          descripcion: it.descripcion,
          cantidad: String(Number(it.cantidad)),
          precioUnitario: String(
            reexpresarPrecio(it.precio_unitario, it.alicuota_iva, modoOrigen, modoDestino),
          ),
          descuentoPorcentaje: String(Number(it.descuento_porcentaje)),
          alicuotaIva: Number(it.alicuota_iva),
        }));

      inicial = {
        id: esEdicion ? f.id : null,
        clase: claseDestino,
        cliente: f.clientes
          ? {
              id: f.clientes.id,
              razonSocial: f.clientes.razon_social,
              documento: f.clientes.cuit_dni ?? '',
              condicionIva: f.clientes.condicion_iva,
              listaPrecioId: f.clientes.lista_precio_id,
              limiteCredito: Number(f.clientes.limite_credito),
              diasCredito: f.clientes.dias_credito,
            }
          : null,
        puntoVentaId: f.punto_venta_id,
        depositoId: f.deposito_id ?? depositoDefault,
        listaPrecioId: f.lista_precio_id ?? listaDefault,
        condicionVenta: f.condicion_venta,
        fechaEmision: esEdicion ? f.fecha_emision : hoyIso(),
        fechaVencimiento: f.fecha_vencimiento ?? '',
        descuentoPorcentaje: String(Number(f.descuento_porcentaje)),
        observaciones: f.observaciones ?? '',
        comprobanteOrigenId: esEdicion ? null : f.id,
        renglones: renglones.length > 0 ? renglones : [renglonVacio()],
      };

      if (!esEdicion) {
        origen = {
          id: f.id,
          descripcion: `${ETIQUETA_TIPO[f.tipo_comprobante]} ${formatearNumeroComprobante(
            f.puntos_venta?.numero,
            f.numero,
          )}`,
        };
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {inicial.id ? 'Editar borrador' : 'Nuevo comprobante'}
        </h1>
        <p className="text-sm text-muted-foreground">
          F2 buscar producto · F4 elegir cliente · F10 emitir · Esc cancelar
        </p>
      </header>

      <ComprobanteEditor
        catalogos={catalogos}
        condicionIvaEmisor={emp.condicion_iva}
        inicial={inicial}
        puedeForzarCredito={puedeForzarLimiteCredito(empresa.rol)}
        origen={origen}
      />
    </div>
  );
}
