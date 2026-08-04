'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, History, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { DataTable, type ColumnaMeta } from '@/components/tables/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatearMoneda, formatearNumero } from '@/lib/format';
import type { EstadoFiltro } from '@/lib/tables/params';

import { AjusteDialog, TransferenciaDialog } from './movimientos-dialogs';

export type FilaStock = {
  productoId: string;
  depositoId: string;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  depositoNombre: string;
  saldo: number;
  stockMinimo: number;
  precioCosto: number;
  valorizado: number;
  bajoMinimo: boolean;
  ultimoMovimiento: string | null;
};

type Deposito = { id: string; nombre: string };

const TODOS = '__todos__';

export function StockTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  depositos,
  depositoFiltro,
  soloBajoMinimo,
  cantidadAlertas,
  puedeMover,
}: {
  data: FilaStock[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  depositos: Deposito[];
  depositoFiltro: string;
  soloBajoMinimo: boolean;
  cantidadAlertas: number;
  puedeMover: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navegar = useCallback(
    (cambios: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '') params.delete(clave);
        else params.set(clave, valor);
      }
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const columns = useMemo<ColumnDef<FilaStock, unknown>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: 'Código',
        meta: { sortable: true, sortKey: 'codigo' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.codigo}</span>
        ),
      },
      {
        accessorKey: 'nombre',
        header: 'Producto',
        meta: { sortable: true, sortKey: 'nombre' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <Link
            href={`/stock/${row.original.productoId}`}
            className="font-medium hover:underline"
          >
            {row.original.nombre}
          </Link>
        ),
      },
      {
        accessorKey: 'deposito_nombre',
        header: 'Depósito',
        meta: { sortable: true, sortKey: 'deposito_nombre' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.depositoNombre}</span>
        ),
      },
      {
        accessorKey: 'saldo',
        header: 'Saldo',
        meta: { sortable: true, sortKey: 'saldo' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-2 tabular-nums">
            {row.original.bajoMinimo ? (
              <Badge variant="warning" title={`Mínimo: ${formatearNumero(row.original.stockMinimo)}`}>
                <TriangleAlert className="mr-1 size-3" />
                bajo mínimo
              </Badge>
            ) : null}
            <span className={row.original.saldo < 0 ? 'text-destructive' : undefined}>
              {formatearNumero(row.original.saldo)}
            </span>
            <span className="w-16 shrink-0 text-left text-xs text-muted-foreground">
              {row.original.unidadMedida.toLowerCase()}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'precio_costo',
        header: 'Costo',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums text-muted-foreground">
            {formatearMoneda(row.original.precioCosto)}
          </span>
        ),
      },
      {
        accessorKey: 'valorizado',
        header: 'Valorizado',
        meta: { sortable: true, sortKey: 'valorizado' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="block text-right font-medium tabular-nums">
            {formatearMoneda(row.original.valorizado)}
          </span>
        ),
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="icon" aria-label="Ver kardex">
            <Link href={`/stock/${row.original.productoId}`}>
              <History />
            </Link>
          </Button>
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
      searchPlaceholder="Buscar por código o nombre…"
      csvFilename="stock"
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={depositoFiltro || TODOS}
            onValueChange={(v) => navegar({ deposito: v === TODOS ? null : v })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Depósito" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los depósitos</SelectItem>
              {depositos.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant={soloBajoMinimo ? 'default' : 'outline'}
            onClick={() => navegar({ alerta: soloBajoMinimo ? null : '1' })}
          >
            <TriangleAlert />
            Bajo mínimo
            {cantidadAlertas > 0 ? (
              <Badge variant={soloBajoMinimo ? 'secondary' : 'warning'} className="ml-1">
                {cantidadAlertas}
              </Badge>
            ) : null}
          </Button>

          {puedeMover ? (
            <>
              <AjusteDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <SlidersHorizontal />
                    Ajustar
                  </Button>
                }
                depositos={depositos}
              />
              <TransferenciaDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <ArrowLeftRight />
                    Transferir
                  </Button>
                }
                depositos={depositos}
              />
            </>
          ) : null}
        </div>
      }
    />
  );
}
