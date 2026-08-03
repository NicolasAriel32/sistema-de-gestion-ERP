'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Plus, Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DataTable, type ColumnaMeta } from '@/components/tables/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { esError } from '@/lib/forms/resultado';
import { formatearMoneda } from '@/lib/format';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { Row } from '@/lib/supabase/database.types';

import { cambiarEstadoProducto } from './actions';
import { ProductoFormDialog } from './producto-form';

type Producto = Row<'productos'>;
type OpcionCategoria = { id: string; nombre: string };

function AccionesProducto({
  producto,
  categorias,
}: {
  producto: Producto;
  categorias: OpcionCategoria[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      const res = await cambiarEstadoProducto(producto.id, !producto.activo);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success(producto.activo ? 'Producto desactivado' : 'Producto activado');
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Acciones">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTimeout(() => setEditOpen(true), 0)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={alternar} disabled={pending}>
            <Power />
            {producto.activo ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProductoFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        producto={producto}
        categorias={categorias}
      />
    </>
  );
}

export function ProductosTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  categorias,
  puedeEscribir,
}: {
  data: Producto[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  categorias: OpcionCategoria[];
  puedeEscribir: boolean;
}) {
  const categoriaNombre = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nombre])),
    [categorias],
  );

  const columns = useMemo<ColumnDef<Producto, unknown>[]>(() => {
    const base: ColumnDef<Producto, unknown>[] = [
      {
        accessorKey: 'codigo',
        header: 'Código',
        meta: { sortable: true, sortKey: 'codigo' } satisfies ColumnaMeta,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.codigo}</span>,
      },
      {
        accessorKey: 'nombre',
        header: 'Nombre',
        meta: { sortable: true, sortKey: 'nombre' } satisfies ColumnaMeta,
        cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
      },
      {
        id: 'categoria',
        header: 'Categoría',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.categoria_id ? (categoriaNombre.get(row.original.categoria_id) ?? '—') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'alicuota_iva',
        header: 'IVA',
        cell: ({ row }) => <span className="tabular-nums">{row.original.alicuota_iva}%</span>,
      },
      {
        accessorKey: 'precio_costo',
        header: 'Costo',
        meta: { sortable: true, sortKey: 'precio_costo' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatearMoneda(row.original.precio_costo)}</span>
        ),
      },
      {
        accessorKey: 'maneja_stock',
        header: 'Stock',
        cell: ({ row }) =>
          row.original.maneja_stock ? (
            <Badge variant="muted">Controla</Badge>
          ) : (
            <Badge variant="outline">No controla</Badge>
          ),
      },
      {
        accessorKey: 'activo',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.activo ? (
            <Badge variant="success">Activo</Badge>
          ) : (
            <Badge variant="muted">Inactivo</Badge>
          ),
      },
    ];
    if (puedeEscribir) {
      base.push({
        id: 'acciones',
        header: '',
        cell: ({ row }) => <AccionesProducto producto={row.original} categorias={categorias} />,
      });
    }
    return base;
  }, [categoriaNombre, categorias, puedeEscribir]);

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
      searchPlaceholder="Buscar por código, nombre o código de barras…"
      csvFilename="productos"
      enableSelection
      toolbar={
        puedeEscribir ? (
          <ProductoFormDialog
            categorias={categorias}
            trigger={
              <Button size="sm">
                <Plus />
                Nuevo
              </Button>
            }
          />
        ) : null
      }
    />
  );
}
