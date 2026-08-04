import { ArrowLeft, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import type { EstadoOrdenCompra } from '@/lib/supabase/database.types';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { OrdenesTabla, type FilaOrden } from './ordenes-tabla';

export const metadata: Metadata = { title: 'Órdenes de compra' };

const ORDENABLES = new Set(['fecha', 'numero', 'total']);

const ESTADOS_ORDEN: readonly EstadoOrdenCompra[] = [
  'BORRADOR',
  'EMITIDA',
  'RECIBIDA_PARCIAL',
  'RECIBIDA',
  'ANULADA',
];

export default async function OrdenesCompraPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseTablaParams(sp, { defaultSort: 'fecha', defaultSize: 25 });
  const sort = ORDENABLES.has(params.sort) ? params.sort : 'fecha';
  const dir = ORDENABLES.has(params.sort) ? params.dir : 'desc';

  // El estado llega de la URL: se valida contra el enum antes de tocar la DB.
  const crudo = typeof sp.estadoOrden === 'string' ? sp.estadoOrden : '';
  const estadoFiltro = ESTADOS_ORDEN.find((e) => e === crudo);

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  let query = supabase
    .from('ordenes_compra')
    .select(
      'id, numero, fecha, fecha_entrega, estado, total, proveedor_id, proveedores(razon_social)',
      { count: 'exact' },
    )
    .eq('empresa_id', empresa.empresaId);

  if (estadoFiltro) query = query.eq('estado', estadoFiltro);

  if (params.q) {
    const soloDigitos = params.q.replace(/\D/g, '');
    if (soloDigitos) query = query.eq('numero', Number(soloDigitos));
  }

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: dir === 'asc' })
    .order('numero', { ascending: false })
    .range(desde, hasta);

  const filas: FilaOrden[] = (data ?? []).map((o) => {
    const proveedor = Array.isArray(o.proveedores) ? o.proveedores[0] : o.proveedores;
    return {
      id: o.id,
      numero: o.numero,
      fecha: o.fecha,
      fechaEntrega: o.fecha_entrega,
      estado: o.estado,
      total: Number(o.total),
      proveedor: proveedor?.razon_social ?? '—',
    };
  });

  const puedeCrear = puedeEscribir(empresa.rol, 'ordenes_compra');
  const puedeFacturar = puedeEscribir(empresa.rol, 'compras');

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/compras">
            <ArrowLeft />
            Volver a facturas
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Órdenes de compra</h1>
          <p className="text-sm text-muted-foreground">
            Documento interno: no tiene efecto fiscal, no mueve stock ni genera deuda. Se cumple
            después con una o varias facturas del proveedor.
          </p>
        </div>
        {puedeCrear ? (
          <Button asChild size="sm">
            <Link href="/compras/ordenes/nueva">
              <Plus />
              Nueva orden
            </Link>
          </Button>
        ) : null}
      </header>

      <OrdenesTabla
        data={filas}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={dir}
        q={params.q}
        estado={params.estado}
        estadoFiltro={estadoFiltro ?? ''}
        puedeCrear={puedeCrear}
        puedeFacturar={puedeFacturar}
      />
    </div>
  );
}
