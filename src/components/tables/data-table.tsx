'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { totalPaginas, type EstadoFiltro } from '@/lib/tables/params';

/** Metadatos por columna para orden server-side. */
export type ColumnaMeta = { sortable?: boolean; sortKey?: string; exportable?: boolean };

type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  searchPlaceholder?: string;
  csvFilename?: string;
  enableSelection?: boolean;
  /**
   * El filtro activos/inactivos sólo tiene sentido en los catálogos. Un
   * comprobante no se da de baja: se anula, y eso ya es un estado propio.
   */
  enableEstadoFiltro?: boolean;
  toolbar?: ReactNode;
};

function toCsv(headers: string[], filas: (string | number)[][]): string {
  const escapar = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...filas].map((fila) => fila.map(escapar).join(',')).join('\n');
}

export function DataTable<T>({
  columns,
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  searchPlaceholder = 'Buscar…',
  csvFilename = 'export',
  enableSelection = false,
  enableEstadoFiltro = true,
  toolbar,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [busqueda, setBusqueda] = useState(q);

  useEffect(() => setBusqueda(q), [q]);

  const setParam = useCallback(
    (cambios: Record<string, string | null>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '') params.delete(clave);
        else params.set(clave, valor);
      }
      if (resetPage) params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  // Debounce de la búsqueda.
  useEffect(() => {
    if (busqueda === q) return;
    const id = setTimeout(() => setParam({ q: busqueda || null }), 300);
    return () => clearTimeout(id);
  }, [busqueda, q, setParam]);

  const columnasFinales = enableSelection
    ? ([
        {
          id: 'select',
          header: ({ table }) => (
            <Checkbox
              checked={
                table.getIsAllRowsSelected()
                  ? true
                  : table.getIsSomeRowsSelected()
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
              aria-label="Seleccionar todo"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(!!v)}
              aria-label="Seleccionar fila"
            />
          ),
          enableSorting: false,
        } as ColumnDef<T, unknown>,
        ...columns,
      ] as ColumnDef<T, unknown>[])
    : columns;

  const table = useReactTable({
    data,
    columns: columnasFinales,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: enableSelection,
  });

  const paginas = totalPaginas(total, size);

  function ordenarPor(sortKey: string) {
    if (sort === sortKey) {
      setParam({ sort: sortKey, dir: dir === 'asc' ? 'desc' : 'asc' }, false);
    } else {
      setParam({ sort: sortKey, dir: 'asc' }, false);
    }
  }

  function exportarCsv() {
    const seleccionadas = table.getSelectedRowModel().rows;
    const filasFuente = seleccionadas.length > 0 ? seleccionadas : table.getRowModel().rows;

    const cols = table
      .getVisibleLeafColumns()
      .filter((c) => c.id !== 'select' && c.id !== 'acciones');

    const headers = cols.map((c) => {
      const h = c.columnDef.header;
      return typeof h === 'string' ? h : c.id;
    });

    const filas = filasFuente.map((row) =>
      cols.map((c) => {
        const v = row.getValue(c.id);
        return v == null ? '' : (v as string | number);
      }),
    );

    const blob = new Blob([`﻿${toCsv(headers, filas)}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${csvFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const desde = total === 0 ? 0 : (page - 1) * size + 1;
  const hasta = Math.min(page * size, total);
  const seleccionadas = Object.keys(rowSelection).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-full max-w-xs"
        />
        {enableEstadoFiltro ? (
          <Select
            value={estado}
            onValueChange={(v) => setParam({ estado: v === 'todos' ? null : v })}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="inactivos">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={data.length === 0}>
            <Download className="size-4" />
            CSV{seleccionadas > 0 ? ` (${seleccionadas})` : ''}
          </Button>
          {toolbar}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ColumnaMeta | undefined;
                  const contenido = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());

                  if (meta?.sortable && meta.sortKey) {
                    const activo = sort === meta.sortKey;
                    return (
                      <TableHead key={header.id}>
                        <button
                          type="button"
                          onClick={() => ordenarPor(meta.sortKey!)}
                          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
                        >
                          {contenido}
                          {activo ? (
                            dir === 'asc' ? (
                              <ArrowUp className="size-3" />
                            ) : (
                              <ArrowDown className="size-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                    );
                  }

                  return <TableHead key={header.id}>{contenido}</TableHead>;
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnasFinales.length} className="h-24 text-center text-muted-foreground">
                  No hay resultados.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {desde}–{hasta} de {total}
          {seleccionadas > 0 ? ` · ${seleccionadas} seleccionados` : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Página {page} de {paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setParam({ page: String(page - 1) }, false)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= paginas}
            onClick={() => setParam({ page: String(page + 1) }, false)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
