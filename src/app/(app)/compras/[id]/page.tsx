import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { ETIQUETA_PERCEPCION, type TipoPercepcion } from '@/lib/domain/compras/calculo';
import {
  ETIQUETA_ESTADO_COMPRA,
  ETIQUETA_TIPO_COMPRA,
  type TipoCompra,
} from '@/lib/domain/compras/schema';
import { formatearMoneda, formatearNumero } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

import { AnularCompra } from './anular-compra';

export const metadata: Metadata = { title: 'Factura de proveedor' };

function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const { data: compra } = await supabase
    .from('compras')
    .select('*, proveedores(razon_social, cuit), depositos(nombre), ordenes_compra(id, numero)')
    .eq('id', id)
    .eq('empresa_id', empresa.empresaId)
    .maybeSingle();

  if (!compra) notFound();

  const [{ data: items }, { data: percepciones }] = await Promise.all([
    supabase.from('compra_items').select('*').eq('compra_id', id).order('orden'),
    supabase.from('compra_percepciones').select('*').eq('compra_id', id),
  ]);

  const proveedor = Array.isArray(compra.proveedores) ? compra.proveedores[0] : compra.proveedores;
  const deposito = Array.isArray(compra.depositos) ? compra.depositos[0] : compra.depositos;
  const orden = Array.isArray(compra.ordenes_compra)
    ? compra.ordenes_compra[0]
    : compra.ordenes_compra;

  const anulada = compra.estado === 'ANULADA';
  const puedeAnular = puedeEscribir(empresa.rol, 'compras') && !anulada;

  const identificacion = `${String(compra.punto_venta_numero).padStart(5, '0')}-${String(
    compra.numero,
  ).padStart(8, '0')}`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/compras">
            <ArrowLeft />
            Volver a compras
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{compra.letra}</Badge>
            <h1 className="text-xl font-semibold tracking-tight">
              {ETIQUETA_TIPO_COMPRA[compra.tipo_comprobante as TipoCompra] ??
                compra.tipo_comprobante}
            </h1>
            <span className="font-mono text-sm text-muted-foreground">{identificacion}</span>
            <Badge variant={anulada ? 'destructive' : 'success'}>
              {ETIQUETA_ESTADO_COMPRA[compra.estado] ?? compra.estado}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {proveedor?.razon_social}
            {proveedor?.cuit ? ` · CUIT ${proveedor.cuit}` : ''}
          </p>
        </div>

        {puedeAnular ? <AnularCompra compraId={compra.id} total={Number(compra.total)} /> : null}
      </header>

      <dl className="grid gap-x-8 gap-y-2 rounded-md border border-border p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Emisión</dt>
          <dd className="tabular-nums">{formatearFecha(compra.fecha_emision)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Vencimiento</dt>
          <dd className="tabular-nums">{formatearFecha(compra.fecha_vencimiento)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Registrada</dt>
          <dd className="tabular-nums">{formatearFecha(compra.fecha_registracion)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Condición</dt>
          <dd>{compra.condicion_venta === 'CUENTA_CORRIENTE' ? 'Cuenta corriente' : 'Contado'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Depósito de ingreso</dt>
          <dd>{deposito?.nombre ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Crédito fiscal</dt>
          <dd>{compra.da_credito_fiscal ? 'Sí' : 'No'}</dd>
        </div>
        {compra.cae_proveedor ? (
          <div>
            <dt className="text-xs text-muted-foreground">CAE del proveedor</dt>
            <dd className="font-mono">{compra.cae_proveedor}</dd>
          </div>
        ) : null}
        {orden ? (
          <div>
            <dt className="text-xs text-muted-foreground">Orden de compra</dt>
            <dd>
              <Link href={`/compras/ordenes`} className="underline">
                N° {orden.numero}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[110px] text-right">Cantidad</TableHead>
              <TableHead className="w-[130px] text-right">Precio</TableHead>
              <TableHead className="w-[80px] text-right">IVA</TableHead>
              <TableHead className="w-[140px] text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.descripcion}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearNumero(i.cantidad)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearMoneda(i.precio_unitario)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatearNumero(i.alicuota_iva)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearMoneda(i.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(percepciones ?? []).length > 0 ? (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Percepción</TableHead>
                <TableHead>Jurisdicción</TableHead>
                <TableHead className="w-[130px] text-right">Base</TableHead>
                <TableHead className="w-[100px] text-right">Alícuota</TableHead>
                <TableHead className="w-[140px] text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(percepciones ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {ETIQUETA_PERCEPCION[p.tipo as TipoPercepcion] ?? p.tipo}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.jurisdiccion ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearMoneda(p.base_imponible)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearNumero(p.alicuota)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearMoneda(p.importe)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <dl className="ml-auto w-full max-w-xs space-y-1.5 rounded-md border border-border p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Neto gravado</dt>
          <dd className="tabular-nums">{formatearMoneda(compra.neto_gravado)}</dd>
        </div>
        {Number(compra.iva_105) > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">IVA 10,5%</dt>
            <dd className="tabular-nums">{formatearMoneda(compra.iva_105)}</dd>
          </div>
        ) : null}
        {Number(compra.iva_21) > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">IVA 21%</dt>
            <dd className="tabular-nums">{formatearMoneda(compra.iva_21)}</dd>
          </div>
        ) : null}
        {Number(compra.iva_27) > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">IVA 27%</dt>
            <dd className="tabular-nums">{formatearMoneda(compra.iva_27)}</dd>
          </div>
        ) : null}
        {Number(compra.total_percepciones) > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Percepciones</dt>
            <dd className="tabular-nums">{formatearMoneda(compra.total_percepciones)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatearMoneda(compra.total)}</dd>
        </div>
      </dl>

      {compra.observaciones ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          {compra.observaciones}
        </p>
      ) : null}
    </div>
  );
}
