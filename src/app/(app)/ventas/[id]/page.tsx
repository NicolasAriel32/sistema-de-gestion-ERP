import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir, puedeForzarLimiteCredito } from '@/lib/auth/permisos';
import {
  ETIQUETA_CONDICION_VENTA,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  VARIANTE_ESTADO,
  formatearNumeroComprobante,
} from '@/lib/domain/comprobantes/etiquetas';
import { esNoFiscal, letraDeTipo } from '@/lib/domain/comprobantes/letra';
import { formatearCuit } from '@/lib/domain/fiscal/cuit';
import { ETIQUETA_CONDICION_IVA } from '@/lib/domain/opciones';
import { formatearFecha } from '@/lib/fechas';
import { formatearMoneda, formatearNumero } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type {
  CondicionIva,
  CondicionVenta,
  EstadoComprobante,
  TipoComprobante,
} from '@/lib/supabase/database.types';

import { AccionesFicha } from './acciones-ficha';

export const metadata: Metadata = { title: 'Comprobante' };

type Item = {
  orden: number;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje: number;
  alicuota_iva: number;
  subtotal_neto: number;
  subtotal_iva: number;
  subtotal: number;
};

type Comprobante = {
  id: string;
  tipo_comprobante: TipoComprobante;
  letra: string;
  numero: number | null;
  estado: EstadoComprobante;
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
  afip_observaciones: string | null;
  comprobante_origen_id: string | null;
  observaciones: string | null;
  clientes: {
    razon_social: string;
    cuit_dni: string | null;
    condicion_iva: CondicionIva;
    domicilio: string | null;
    localidad: string | null;
  } | null;
  puntos_venta: { numero: number } | null;
  depositos: { nombre: string } | null;
  comprobante_items: Item[];
};

export default async function ComprobantePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const { data } = await supabase
    .from('comprobantes')
    .select(
      `id, tipo_comprobante, letra, numero, estado, fecha_emision, fecha_vencimiento,
       condicion_venta, neto_gravado, neto_no_gravado, exento, iva_105, iva_21, iva_27,
       otros_impuestos, descuento_porcentaje, descuento_importe, total,
       cae, cae_vencimiento, afip_observaciones, comprobante_origen_id, observaciones,
       clientes ( razon_social, cuit_dni, condicion_iva, domicilio, localidad ),
       puntos_venta ( numero ),
       depositos ( nombre ),
       comprobante_items ( orden, descripcion, cantidad, precio_unitario, descuento_porcentaje,
                           alicuota_iva, subtotal_neto, subtotal_iva, subtotal )`,
    )
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId)
    .single();

  if (!data) notFound();
  const c = data as unknown as Comprobante;

  const items = [...c.comprobante_items].sort((a, b) => a.orden - b.orden);
  const letra = letraDeTipo(c.tipo_comprobante);
  const discrimina = letra === 'A';
  const interno = esNoFiscal(c.tipo_comprobante);

  // Notas de crédito o débito que ya se le emitieron a este comprobante.
  const { data: relacionados } = await supabase
    .from('comprobantes')
    .select('id, tipo_comprobante, numero, estado, total, puntos_venta ( numero )')
    .eq('empresa_id', empresa.empresaId)
    .eq('comprobante_origen_id', id)
    .order('creado_en');

  type Relacionado = {
    id: string;
    tipo_comprobante: TipoComprobante;
    numero: number | null;
    estado: EstadoComprobante;
    total: number;
    puntos_venta: { numero: number } | null;
  };
  const hijos = (relacionados ?? []) as unknown as Relacionado[];

  let origen: { id: string; etiqueta: string } | null = null;
  if (c.comprobante_origen_id) {
    const { data: o } = await supabase
      .from('comprobantes')
      .select('id, tipo_comprobante, numero, puntos_venta ( numero )')
      .eq('id', c.comprobante_origen_id)
      .single();
    if (o) {
      const oo = o as unknown as Relacionado;
      origen = {
        id: oo.id,
        etiqueta: `${ETIQUETA_TIPO[oo.tipo_comprobante]} ${formatearNumeroComprobante(
          oo.puntos_venta?.numero,
          oo.numero,
        )}`,
      };
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {/* ---------------- Encabezado ---------------- */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {ETIQUETA_TIPO[c.tipo_comprobante]}
            </h1>
            <Badge variant={VARIANTE_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
          </div>
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatearNumeroComprobante(c.puntos_venta?.numero, c.numero)} ·{' '}
            {formatearFecha(c.fecha_emision)}
          </p>
        </div>

        <AccionesFicha
          comprobanteId={c.id}
          tipo={c.tipo_comprobante}
          estado={c.estado}
          puedeEscribir={puedeEscribir(empresa.rol, 'comprobantes')}
          puedeForzarCredito={puedeForzarLimiteCredito(empresa.rol)}
        />
      </header>

      {/* ---------------- Aviso de borrador rechazado ---------------- */}
      {c.estado === 'BORRADOR' && c.afip_observaciones ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="font-medium">No se pudo emitir.</span> {c.afip_observaciones} El
          comprobante sigue en borrador y no consumió número.
        </div>
      ) : null}

      {c.estado === 'ANULADO' ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          Este comprobante fue anulado con una nota de crédito. El original se conserva intacto: en
          contabilidad nada se borra.
        </div>
      ) : null}

      {/* ---------------- Datos ---------------- */}
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-background p-3">
          <h2 className="pb-2 text-sm font-medium">Cliente</h2>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Razón social</dt>
              <dd className="truncate text-right font-medium">{c.clientes?.razon_social ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">CUIT / Doc.</dt>
              <dd className="tabular-nums">
                {c.clientes?.cuit_dni ? formatearCuit(c.clientes.cuit_dni) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Condición IVA</dt>
              <dd>{c.clientes ? ETIQUETA_CONDICION_IVA[c.clientes.condicion_iva] : '—'}</dd>
            </div>
            {c.clientes?.domicilio ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Domicilio</dt>
                <dd className="truncate text-right">
                  {c.clientes.domicilio}
                  {c.clientes.localidad ? `, ${c.clientes.localidad}` : ''}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-background p-3">
          <h2 className="pb-2 text-sm font-medium">Comprobante</h2>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Condición de venta</dt>
              <dd>{ETIQUETA_CONDICION_VENTA[c.condicion_venta]}</dd>
            </div>
            {c.fecha_vencimiento ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Vencimiento</dt>
                <dd className="tabular-nums">{formatearFecha(c.fecha_vencimiento)}</dd>
              </div>
            ) : null}
            {c.depositos ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Depósito</dt>
                <dd>{c.depositos.nombre}</dd>
              </div>
            ) : null}
            {!interno ? (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">CAE</dt>
                  <dd className="tabular-nums">{c.cae ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Vencimiento del CAE</dt>
                  <dd className="tabular-nums">{formatearFecha(c.cae_vencimiento)}</dd>
                </div>
              </>
            ) : null}
            {origen ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Origen</dt>
                <dd>
                  <Link href={`/ventas/${origen.id}`} className="underline">
                    {origen.etiqueta}
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      {/* ---------------- Renglones ---------------- */}
      <section className="rounded-lg border border-border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Descripción</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">
                  {discrimina ? 'Precio neto' : 'Precio'}
                </th>
                <th className="px-3 py-2 text-right font-medium">Desc.</th>
                {discrimina ? <th className="px-3 py-2 text-right font-medium">IVA</th> : null}
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.orden} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-1.5">{it.descripcion}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatearNumero(it.cantidad)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatearMoneda(it.precio_unitario)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {Number(it.descuento_porcentaje) > 0
                      ? `${formatearNumero(it.descuento_porcentaje)}%`
                      : '—'}
                  </td>
                  {discrimina ? (
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatearNumero(it.alicuota_iva)}%
                    </td>
                  ) : null}
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatearMoneda(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Totales ---------------- */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {c.observaciones ? (
            <section className="rounded-lg border border-border bg-background p-3">
              <h2 className="pb-1 text-sm font-medium">Observaciones</h2>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{c.observaciones}</p>
            </section>
          ) : null}

          {hijos.length > 0 ? (
            <section className="rounded-lg border border-border bg-background p-3">
              <h2 className="pb-1 text-sm font-medium">Comprobantes relacionados</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {hijos.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <Link href={`/ventas/${h.id}`} className="truncate underline">
                      {ETIQUETA_TIPO[h.tipo_comprobante]}{' '}
                      {formatearNumeroComprobante(h.puntos_venta?.numero, h.numero)}
                    </Link>
                    <span className="shrink-0 tabular-nums">{formatearMoneda(h.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <section className="rounded-lg border border-border bg-background p-3">
          <dl className="flex flex-col gap-1 text-sm tabular-nums">
            {discrimina ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Neto gravado</dt>
                  <dd>{formatearMoneda(c.neto_gravado)}</dd>
                </div>
                {Number(c.iva_105) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">IVA 10,5%</dt>
                    <dd>{formatearMoneda(c.iva_105)}</dd>
                  </div>
                ) : null}
                {Number(c.iva_21) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">IVA 21%</dt>
                    <dd>{formatearMoneda(c.iva_21)}</dd>
                  </div>
                ) : null}
                {Number(c.iva_27) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">IVA 27%</dt>
                    <dd>{formatearMoneda(c.iva_27)}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            {Number(c.descuento_importe) > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Descuento general {formatearNumero(c.descuento_porcentaje)}%
                </dt>
                <dd>− {formatearMoneda(c.descuento_importe)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatearMoneda(c.total)}</dd>
            </div>
          </dl>

          {!discrimina && !interno ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {letra === 'C'
                ? 'El emisor es Monotributo o Exento: no discrimina IVA.'
                : 'Los precios incluyen IVA. En un comprobante B el impuesto no se imprime desglosado.'}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
