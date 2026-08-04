'use client';

import { type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { DataTable, type ColumnaMeta } from '@/components/tables/data-table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ETIQUETA_ESTADO_COMPRA,
  ETIQUETA_TIPO_COMPRA,
  type TipoCompra,
} from '@/lib/domain/compras/schema';
import { formatearMoneda } from '@/lib/format';
import type { EstadoFiltro } from '@/lib/tables/params';

export type FilaCompra = {
  id: string;
  tipoComprobante: string;
  letra: string;
  puntoVentaNumero: number;
  numero: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
  condicionVenta: string;
  total: number;
  estado: string;
  daCreditoFiscal: boolean;
  proveedor: string;
};

const TODOS = '__todos__';

const VARIANTE_ESTADO: Record<string, 'success' | 'muted' | 'warning' | 'destructive'> = {
  REGISTRADA: 'success',
  PAGADA: 'success',
  PARCIAL: 'warning',
  BORRADOR: 'muted',
  ANULADA: 'destructive',
};

function formatearFecha(iso: string): string {
  // La fecha ya viene como YYYY-MM-DD desde Postgres. Construir un Date
  // con ella la interpretaría en UTC y podría correrse un día.
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function comprobanteCorto(f: FilaCompra): string {
  return `${String(f.puntoVentaNumero).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`;
}

export function ComprasTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  estadoFiltro,
}: {
  data: FilaCompra[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  estadoFiltro: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navegar = useCallback(
    (clave: string, valor: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (valor === null) params.delete(clave);
      else params.set(clave, valor);
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const columns = useMemo<ColumnDef<FilaCompra, unknown>[]>(
    () => [
      {
        accessorKey: 'fecha_emision',
        header: 'Emisión',
        meta: { sortable: true, sortKey: 'fecha_emision' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {formatearFecha(row.original.fechaEmision)}
          </span>
        ),
      },
      {
        accessorKey: 'tipo_comprobante',
        header: 'Comprobante',
        cell: ({ row }) => (
          <Link href={`/compras/${row.original.id}`} className="flex items-center gap-2">
            <Badge variant="outline">{row.original.letra}</Badge>
            <span className="hover:underline">
              {ETIQUETA_TIPO_COMPRA[row.original.tipoComprobante as TipoCompra] ??
                row.original.tipoComprobante}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {comprobanteCorto(row.original)}
            </span>
          </Link>
        ),
      },
      {
        accessorKey: 'proveedor',
        header: 'Proveedor',
        cell: ({ row }) => (
          <span className="block max-w-[240px] truncate">{row.original.proveedor}</span>
        ),
      },
      {
        accessorKey: 'condicion_venta',
        header: 'Condición',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.condicionVenta === 'CUENTA_CORRIENTE' ? 'Cta. cte.' : 'Contado'}
            {row.original.fechaVencimiento
              ? ` · vence ${formatearFecha(row.original.fechaVencimiento)}`
              : ''}
          </span>
        ),
      },
      {
        accessorKey: 'da_credito_fiscal',
        header: 'Crédito fiscal',
        cell: ({ row }) =>
          row.original.daCreditoFiscal ? (
            <Badge variant="muted">Sí</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">No</span>
          ),
      },
      {
        accessorKey: 'estado',
        header: 'Estado',
        cell: ({ row }) => (
          <Badge variant={VARIANTE_ESTADO[row.original.estado] ?? 'muted'}>
            {ETIQUETA_ESTADO_COMPRA[row.original.estado] ?? row.original.estado}
          </Badge>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        meta: { sortable: true, sortKey: 'total' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span
            className={`block text-right font-medium tabular-nums ${
              row.original.estado === 'ANULADA' ? 'text-muted-foreground line-through' : ''
            }`}
          >
            {formatearMoneda(row.original.total)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      total={total}
      page={page}
      size={size}
      sort={sort}
      dir={dir}
      q={q}
      estado={estado}
      enableEstadoFiltro={false}
      searchPlaceholder="Buscar por número…"
      csvFilename="compras"
      toolbar={
        <Select
          value={estadoFiltro || TODOS}
          onValueChange={(v) => navegar('estadoCompra', v === TODOS ? null : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {Object.entries(ETIQUETA_ESTADO_COMPRA).map(([valor, etiqueta]) => (
              <SelectItem key={valor} value={valor}>
                {etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
