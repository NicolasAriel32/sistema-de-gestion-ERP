import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { calcularKardex, kardexCierra } from '@/lib/domain/stock/kardex';
import { formatearMoneda, formatearNumero } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

import { KardexTabla } from './kardex-tabla';

export const metadata: Metadata = { title: 'Kardex' };

export default async function KardexPage({
  params,
  searchParams,
}: {
  params: Promise<{ productoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { productoId } = await params;
  const sp = await searchParams;

  const depositoFiltro = typeof sp.deposito === 'string' ? sp.deposito : '';
  const desde = typeof sp.desde === 'string' ? sp.desde : '';
  const hasta = typeof sp.hasta === 'string' ? sp.hasta : '';

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from('productos')
    .select('id, codigo, nombre, unidad_medida, stock_minimo, precio_costo, maneja_stock')
    .eq('id', productoId)
    .eq('empresa_id', empresa.empresaId)
    .maybeSingle();

  if (!producto) notFound();

  const [{ data: depositos }, { data: saldos }, { data: movimientos }] = await Promise.all([
    supabase
      .from('depositos')
      .select('id, nombre')
      .eq('empresa_id', empresa.empresaId)
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('stock_saldos')
      .select('deposito_id, deposito_nombre, saldo')
      .eq('empresa_id', empresa.empresaId)
      .eq('producto_id', productoId),
    supabase.rpc('kardex_producto', {
      p_empresa_id: empresa.empresaId,
      p_producto_id: productoId,
      p_deposito_id: depositoFiltro || null,
      p_desde: desde || null,
      p_hasta: hasta || null,
    }),
  ]);

  // El saldo corrido ya viene calculado de Postgres. Se recalcula del lado
  // del servidor para comprobar que las dos fuentes coinciden: si no lo
  // hicieran, mostrar el kardex igual sería esconder un problema real.
  const renglones = calcularKardex(
    (movimientos ?? []).map((m) => ({
      movimientoId: m.movimiento_id,
      fecha: m.fecha,
      tipo: m.tipo,
      depositoId: m.deposito_id,
      depositoNombre: m.deposito_nombre,
      cantidad: Number(m.cantidad),
      costoUnitario: Number(m.costo_unitario),
      comprobanteId: m.comprobante_id,
      comprobante: m.comprobante,
      motivo: m.motivo,
    })),
  );

  const coincideConPostgres =
    (movimientos ?? []).every(
      (m, i) => Number(m.saldo) === (renglones[i]?.saldo ?? Number.NaN),
    ) && kardexCierra(renglones);

  const saldoPorDeposito = (saldos ?? [])
    .map((s) => ({
      depositoId: s.deposito_id,
      depositoNombre: s.deposito_nombre,
      saldo: Number(s.saldo),
    }))
    .sort((a, b) => a.depositoNombre.localeCompare(b.depositoNombre, 'es'));

  const saldoTotal = saldoPorDeposito.reduce((acc, s) => acc + s.saldo, 0);
  const bajoMinimo = Number(producto.stock_minimo) > 0 && saldoTotal < Number(producto.stock_minimo);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/stock">
            <ArrowLeft />
            Volver a stock
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{producto.nombre}</h1>
            {bajoMinimo ? <Badge variant="warning">Bajo mínimo</Badge> : null}
          </div>
          <p className="font-mono text-sm text-muted-foreground">{producto.codigo}</p>
        </div>

        <dl className="flex flex-wrap items-end gap-6 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Saldo total</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatearNumero(saldoTotal)}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {producto.unidad_medida.toLowerCase()}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Mínimo</dt>
            <dd className="tabular-nums">{formatearNumero(producto.stock_minimo)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Costo</dt>
            <dd className="tabular-nums">{formatearMoneda(producto.precio_costo)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Valorizado</dt>
            <dd className="tabular-nums">
              {formatearMoneda(saldoTotal * Number(producto.precio_costo))}
            </dd>
          </div>
        </dl>
      </header>

      {saldoPorDeposito.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {saldoPorDeposito.map((s) => (
            <span
              key={s.depositoId}
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{s.depositoNombre}: </span>
              <span className="font-medium tabular-nums">{formatearNumero(s.saldo)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {!coincideConPostgres ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          El saldo corrido calculado no coincide con el que devolvió la base. No confíes en estos
          números y avisá: hay una inconsistencia en los movimientos de stock.
        </p>
      ) : null}

      <KardexTabla
        productoId={productoId}
        unidadMedida={producto.unidad_medida}
        renglones={renglones}
        depositos={depositos ?? []}
        depositoFiltro={depositoFiltro}
        desde={desde}
        hasta={hasta}
        puedeMover={puedeEscribir(empresa.rol, 'stock_movimientos')}
      />
    </div>
  );
}
