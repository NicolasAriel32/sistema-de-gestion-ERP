import { FileText, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import type { EstadoCompra } from '@/lib/supabase/database.types';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { ComprasTabla, type FilaCompra } from './compras-tabla';

export const metadata: Metadata = { title: 'Compras' };

const ORDENABLES = new Set(['fecha_emision', 'numero', 'total', 'fecha_registracion']);

const ESTADOS_COMPRA: readonly EstadoCompra[] = [
  'BORRADOR',
  'REGISTRADA',
  'PARCIAL',
  'PAGADA',
  'ANULADA',
];

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseTablaParams(sp, { defaultSort: 'fecha_emision', defaultSize: 25 });
  const sort = ORDENABLES.has(params.sort) ? params.sort : 'fecha_emision';
  const dir = ORDENABLES.has(params.sort) ? params.dir : 'desc';

  // El estado llega de la URL: se valida contra el enum antes de tocar la DB.
  const crudo = typeof sp.estadoCompra === 'string' ? sp.estadoCompra : '';
  const estadoFiltro = ESTADOS_COMPRA.find((e) => e === crudo);

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  let query = supabase
    .from('compras')
    .select(
      'id, tipo_comprobante, letra, punto_venta_numero, numero, fecha_emision, fecha_vencimiento, condicion_venta, total, estado, da_credito_fiscal, proveedor_id, proveedores(razon_social)',
      { count: 'exact' },
    )
    .eq('empresa_id', empresa.empresaId);

  if (estadoFiltro) query = query.eq('estado', estadoFiltro);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    const soloDigitos = termino.replace(/\D/g, '');
    if (soloDigitos) {
      query = query.eq('numero', Number(soloDigitos));
    }
  }

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: dir === 'asc' })
    .order('creado_en', { ascending: false })
    .range(desde, hasta);

  const filas: FilaCompra[] = (data ?? []).map((c) => {
    // PostgREST devuelve la relación como objeto o como array según cómo
    // infiera la cardinalidad. Se normaliza acá y no en cada uso.
    const proveedor = Array.isArray(c.proveedores) ? c.proveedores[0] : c.proveedores;
    return {
      id: c.id,
      tipoComprobante: c.tipo_comprobante,
      letra: c.letra,
      puntoVentaNumero: c.punto_venta_numero,
      numero: c.numero,
      fechaEmision: c.fecha_emision,
      fechaVencimiento: c.fecha_vencimiento,
      condicionVenta: c.condicion_venta,
      total: Number(c.total),
      estado: c.estado,
      daCreditoFiscal: c.da_credito_fiscal,
      proveedor: proveedor?.razon_social ?? '—',
    };
  });

  const puedeCargar = puedeEscribir(empresa.rol, 'compras');

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Facturas de proveedor</h1>
          <p className="text-sm text-muted-foreground">
            Comprobantes de compra recibidos. El número y el CAE los trae el proveedor: el sistema
            no los genera.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/compras/ordenes">
              <FileText />
              Órdenes de compra
            </Link>
          </Button>
          {puedeCargar ? (
            <Button asChild size="sm">
              <Link href="/compras/nueva">
                <Plus />
                Cargar factura
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <ComprasTabla
        data={filas}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={dir}
        q={params.q}
        estado={params.estado}
        estadoFiltro={estadoFiltro ?? ''}
      />
    </div>
  );
}
