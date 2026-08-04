'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Ban, FileInput, MoreHorizontal, Send } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DataTable, type ColumnaMeta } from '@/components/tables/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ETIQUETA_ESTADO_ORDEN } from '@/lib/domain/compras/schema';
import { formatearMoneda } from '@/lib/format';
import { esError } from '@/lib/forms/resultado';
import type { EstadoFiltro } from '@/lib/tables/params';

import { anularOrdenCompra, emitirOrdenCompra } from '../actions';

export type FilaOrden = {
  id: string;
  numero: number;
  fecha: string;
  fechaEntrega: string | null;
  estado: string;
  total: number;
  proveedor: string;
};

const TODOS = '__todos__';

type VarianteBadge = 'default' | 'secondary' | 'muted' | 'success' | 'warning' | 'destructive';

const VARIANTE_ESTADO: Record<string, VarianteBadge> = {
  BORRADOR: 'muted',
  EMITIDA: 'secondary',
  RECIBIDA_PARCIAL: 'warning',
  RECIBIDA: 'success',
  ANULADA: 'destructive',
};

function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function AccionesOrden({
  orden,
  puedeCrear,
  puedeFacturar,
}: {
  orden: FilaOrden;
  puedeCrear: boolean;
  puedeFacturar: boolean;
}) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const puedeEmitir = puedeCrear && orden.estado === 'BORRADOR';
  const puedeRecibir =
    puedeFacturar && (orden.estado === 'EMITIDA' || orden.estado === 'RECIBIDA_PARCIAL');
  const puedeAnular =
    puedeFacturar && (orden.estado === 'BORRADOR' || orden.estado === 'EMITIDA');

  function emitir() {
    startTransition(async () => {
      const res = await emitirOrdenCompra(orden.id);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success('Orden de compra emitida');
      router.refresh();
    });
  }

  function anular() {
    setError(null);
    startTransition(async () => {
      const res = await anularOrdenCompra(orden.id, motivo);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success('Orden de compra anulada');
      setAnulando(false);
      router.refresh();
    });
  }

  if (!puedeEmitir && !puedeRecibir && !puedeAnular) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Acciones">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {puedeEmitir ? (
            <DropdownMenuItem onSelect={emitir} disabled={pending}>
              <Send />
              Emitir
            </DropdownMenuItem>
          ) : null}
          {puedeRecibir ? (
            <DropdownMenuItem asChild>
              <Link href={`/compras/nueva?orden=${orden.id}`}>
                <FileInput />
                Cargar factura
              </Link>
            </DropdownMenuItem>
          ) : null}
          {puedeAnular ? (
            <DropdownMenuItem
              onSelect={() => setTimeout(() => setAnulando(true), 0)}
              disabled={pending}
            >
              <Ban />
              Anular
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={anulando}
        onOpenChange={(v) => {
          setAnulando(v);
          if (v) {
            setMotivo('');
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular la orden N° {orden.numero}</DialogTitle>
            <DialogDescription>
              La orden queda anulada con el motivo registrado. Si ya tiene mercadería recibida, hay
              que anular primero las facturas de compra asociadas.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`motivo-${orden.id}`}>Motivo</Label>
            <Textarea
              id={`motivo-${orden.id}`}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="El proveedor no tiene stock, se cambió de proveedor…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAnulando(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || motivo.trim().length < 3}
              onClick={anular}
            >
              {pending ? 'Anulando…' : 'Anular orden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OrdenesTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  estadoFiltro,
  puedeCrear,
  puedeFacturar,
}: {
  data: FilaOrden[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  estadoFiltro: string;
  puedeCrear: boolean;
  puedeFacturar: boolean;
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

  const columns = useMemo<ColumnDef<FilaOrden, unknown>[]>(
    () => [
      {
        accessorKey: 'numero',
        header: 'N°',
        meta: { sortable: true, sortKey: 'numero' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {String(row.original.numero).padStart(6, '0')}
          </span>
        ),
      },
      {
        accessorKey: 'fecha',
        header: 'Fecha',
        meta: { sortable: true, sortKey: 'fecha' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {formatearFecha(row.original.fecha)}
          </span>
        ),
      },
      {
        accessorKey: 'proveedor',
        header: 'Proveedor',
        cell: ({ row }) => (
          <span className="block max-w-[280px] truncate font-medium">
            {row.original.proveedor}
          </span>
        ),
      },
      {
        accessorKey: 'fecha_entrega',
        header: 'Entrega',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatearFecha(row.original.fechaEntrega)}
          </span>
        ),
      },
      {
        accessorKey: 'estado',
        header: 'Estado',
        cell: ({ row }) => (
          <Badge variant={VARIANTE_ESTADO[row.original.estado] ?? 'muted'}>
            {ETIQUETA_ESTADO_ORDEN[row.original.estado] ?? row.original.estado}
          </Badge>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        meta: { sortable: true, sortKey: 'total' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="block text-right font-medium tabular-nums">
            {formatearMoneda(row.original.total)}
          </span>
        ),
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <AccionesOrden
            orden={row.original}
            puedeCrear={puedeCrear}
            puedeFacturar={puedeFacturar}
          />
        ),
      },
    ],
    [puedeCrear, puedeFacturar],
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
      csvFilename="ordenes-compra"
      toolbar={
        <Select
          value={estadoFiltro || TODOS}
          onValueChange={(v) => navegar('estadoOrden', v === TODOS ? null : v)}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {Object.entries(ETIQUETA_ESTADO_ORDEN).map(([valor, etiqueta]) => (
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
