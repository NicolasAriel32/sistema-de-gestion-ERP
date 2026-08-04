'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { FileText, MoreHorizontal, Plus, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DataTable, type ColumnaMeta } from '@/components/tables/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO,
  ETIQUETA_TIPO_CORTA,
  VARIANTE_ESTADO,
  formatearNumeroComprobante,
} from '@/lib/domain/comprobantes/etiquetas';
import { formatearFecha } from '@/lib/fechas';
import { formatearMoneda } from '@/lib/format';
import { esError } from '@/lib/forms/resultado';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { EstadoComprobante, TipoComprobante } from '@/lib/supabase/database.types';

import { eliminarBorrador, emitirBorrador } from './actions';

export type FilaComprobante = {
  id: string;
  tipo: TipoComprobante;
  numero: number | null;
  puntoVenta: number | null;
  fechaEmision: string;
  fechaVencimiento: string | null;
  cliente: string;
  total: number;
  estado: EstadoComprobante;
  cae: string | null;
  observacionesAfip: string | null;
  condicionVenta: 'CONTADO' | 'CUENTA_CORRIENTE';
};

const TIPOS_FILTRO: TipoComprobante[] = [
  'FACTURA_A',
  'FACTURA_B',
  'FACTURA_C',
  'NC_A',
  'NC_B',
  'NC_C',
  'ND_A',
  'ND_B',
  'ND_C',
  'PRESUPUESTO',
  'PEDIDO',
  'REMITO',
];

const ESTADOS_FILTRO: EstadoComprobante[] = ['BORRADOR', 'EMITIDO', 'ANULADO', 'PAGADO', 'PARCIAL'];

const TODOS = '__todos__';

function AccionesComprobante({ fila }: { fila: FilaComprobante }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const esBorrador = fila.estado === 'BORRADOR';

  function reintentar() {
    startTransition(async () => {
      const res = await emitirBorrador(fila.id);
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Emitido N° ${res.numero}`);
      router.refresh();
    });
  }

  function eliminar() {
    startTransition(async () => {
      const res = await eliminarBorrador(fila.id);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success('Borrador eliminado');
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Acciones">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/ventas/${fila.id}`}>
            <FileText />
            Ver comprobante
          </Link>
        </DropdownMenuItem>

        {esBorrador ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/ventas/nuevo?editar=${fila.id}`}>Editar borrador</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={reintentar} disabled={pending}>
              <Send />
              Emitir
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={eliminar} disabled={pending}>
              <Trash2 />
              Eliminar borrador
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ComprobantesTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  tipoFiltro,
  estadoFiltro,
  desde,
  hasta,
  puedeEscribir,
}: {
  data: FilaComprobante[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  tipoFiltro: string;
  estadoFiltro: string;
  desde: string;
  hasta: string;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rangoDesde, setRangoDesde] = useState(desde);
  const [rangoHasta, setRangoHasta] = useState(hasta);

  const setParam = useCallback(
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

  const columns = useMemo<ColumnDef<FilaComprobante, unknown>[]>(
    () => [
      {
        id: 'comprobante',
        header: 'Comprobante',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <Link href={`/ventas/${c.id}`} className="flex flex-col hover:underline">
              <span className="font-medium">
                {ETIQUETA_TIPO_CORTA[c.tipo]}{' '}
                <span className="tabular-nums">
                  {formatearNumeroComprobante(c.puntoVenta, c.numero)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{ETIQUETA_TIPO[c.tipo]}</span>
            </Link>
          );
        },
      },
      {
        accessorKey: 'fechaEmision',
        header: 'Fecha',
        meta: { sortable: true, sortKey: 'fecha_emision' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatearFecha(row.original.fechaEmision)}</span>
        ),
      },
      {
        accessorKey: 'cliente',
        header: 'Cliente',
        cell: ({ row }) => <span className="truncate">{row.original.cliente}</span>,
      },
      {
        id: 'condicion',
        header: 'Condición',
        cell: ({ row }) => {
          const c = row.original;
          if (c.condicionVenta === 'CONTADO') {
            return <span className="text-xs text-muted-foreground">Contado</span>;
          }
          return (
            <span className="flex flex-col text-xs">
              <span>Cuenta corriente</span>
              {c.fechaVencimiento ? (
                <span className="text-muted-foreground tabular-nums">
                  vence {formatearFecha(c.fechaVencimiento)}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        accessorKey: 'total',
        header: 'Total',
        meta: { sortable: true, sortKey: 'total' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {formatearMoneda(row.original.total)}
          </div>
        ),
      },
      {
        accessorKey: 'estado',
        header: 'Estado',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <Badge variant={VARIANTE_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>
              {c.estado === 'BORRADOR' && c.observacionesAfip ? (
                <span className="max-w-52 truncate text-xs text-destructive" title={c.observacionesAfip}>
                  {c.observacionesAfip}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => <AccionesComprobante fila={row.original} />,
      },
    ],
    [],
  );

  const filtros = (
    <>
      <Select
        value={tipoFiltro || TODOS}
        onValueChange={(v) => setParam({ tipo: v === TODOS ? null : v })}
      >
        <SelectTrigger className="h-8 w-44">
          <SelectValue placeholder="Todos los tipos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos los tipos</SelectItem>
          {TIPOS_FILTRO.map((t) => (
            <SelectItem key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={estadoFiltro || TODOS}
        onValueChange={(v) => setParam({ estadoCbte: v === TODOS ? null : v })}
      >
        <SelectTrigger className="h-8 w-36">
          <SelectValue placeholder="Todos los estados" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos los estados</SelectItem>
          {ESTADOS_FILTRO.map((e) => (
            <SelectItem key={e} value={e}>
              {ETIQUETA_ESTADO[e]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        className="h-8 w-36"
        value={rangoDesde}
        onChange={(e) => setRangoDesde(e.target.value)}
        onBlur={() => setParam({ desde: rangoDesde || null })}
        aria-label="Desde"
      />
      <Input
        type="date"
        className="h-8 w-36"
        value={rangoHasta}
        onChange={(e) => setRangoHasta(e.target.value)}
        onBlur={() => setParam({ hasta: rangoHasta || null })}
        aria-label="Hasta"
      />
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">{filtros}</div>

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
        searchPlaceholder="Número de comprobante o CAE…"
        csvFilename="ventas"
        enableSelection
        enableEstadoFiltro={false}
        toolbar={
          puedeEscribir ? (
            <Button size="sm" asChild>
              <Link href="/ventas/nuevo">
                <Plus className="size-4" />
                Nuevo comprobante
              </Link>
            </Button>
          ) : null
        }
      />
    </div>
  );
}
