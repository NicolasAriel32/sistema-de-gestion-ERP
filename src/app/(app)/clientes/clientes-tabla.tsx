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
import { formatearCuit } from '@/lib/domain/fiscal/cuit';
import { ETIQUETA_CONDICION_IVA, ETIQUETA_TIPO_DOC } from '@/lib/domain/opciones';
import { esError } from '@/lib/forms/resultado';
import { formatearMoneda } from '@/lib/format';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { Row } from '@/lib/supabase/database.types';

import { cambiarEstadoCliente } from './actions';
import { ClienteFormDialog } from './cliente-form';

type Cliente = Row<'clientes'>;
type ListaPrecio = { id: string; nombre: string };

function AccionesCliente({
  cliente,
  listasPrecios,
}: {
  cliente: Cliente;
  listasPrecios: ListaPrecio[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function alternarEstado() {
    startTransition(async () => {
      const res = await cambiarEstadoCliente(cliente.id, !cliente.activo);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success(cliente.activo ? 'Cliente desactivado' : 'Cliente activado');
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
          <DropdownMenuItem onSelect={alternarEstado} disabled={pending}>
            <Power />
            {cliente.activo ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ClienteFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cliente={cliente}
        listasPrecios={listasPrecios}
      />
    </>
  );
}

export function ClientesTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  listasPrecios,
  puedeEscribir,
}: {
  data: Cliente[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  listasPrecios: ListaPrecio[];
  puedeEscribir: boolean;
}) {
  const listaNombre = useMemo(
    () => new Map(listasPrecios.map((l) => [l.id, l.nombre])),
    [listasPrecios],
  );

  const columns = useMemo<ColumnDef<Cliente, unknown>[]>(() => {
    const base: ColumnDef<Cliente, unknown>[] = [
      {
        accessorKey: 'razon_social',
        header: 'Razón social',
        meta: { sortable: true, sortKey: 'razon_social' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.razon_social}</span>
            {row.original.nombre_fantasia ? (
              <span className="text-xs text-muted-foreground">{row.original.nombre_fantasia}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'documento',
        header: 'Documento',
        cell: ({ row }) => {
          const c = row.original;
          const usaCuit = c.tipo_doc === 'CUIT' || c.tipo_doc === 'CUIL';
          const doc = c.cuit_dni ? (usaCuit ? formatearCuit(c.cuit_dni) : c.cuit_dni) : '—';
          return (
            <span className="text-sm">
              <span className="text-muted-foreground">{ETIQUETA_TIPO_DOC[c.tipo_doc]}</span> {doc}
            </span>
          );
        },
      },
      {
        accessorKey: 'condicion_iva',
        header: 'Cond. IVA',
        cell: ({ row }) => (
          <Badge variant="muted">{ETIQUETA_CONDICION_IVA[row.original.condicion_iva]}</Badge>
        ),
      },
      {
        id: 'lista',
        header: 'Lista',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.lista_precio_id ? (listaNombre.get(row.original.lista_precio_id) ?? '—') : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'limite_credito',
        header: 'Límite',
        meta: { sortable: true, sortKey: 'limite_credito' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatearMoneda(row.original.limite_credito)}</span>
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
        cell: ({ row }) => (
          <AccionesCliente cliente={row.original} listasPrecios={listasPrecios} />
        ),
      });
    }

    return base;
  }, [listaNombre, listasPrecios, puedeEscribir]);

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
      searchPlaceholder="Buscar por razón social, fantasía o CUIT…"
      csvFilename="clientes"
      enableSelection
      toolbar={
        puedeEscribir ? (
          <ClienteFormDialog
            listasPrecios={listasPrecios}
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
