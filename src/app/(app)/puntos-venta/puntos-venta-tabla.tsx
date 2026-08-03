'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Plus, Power } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { DataTable, type ColumnaMeta } from '@/components/tables/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ETIQUETA_TIPO_EMISION, TIPOS_EMISION } from '@/lib/domain/opciones';
import {
  puntoVentaFormDefaults,
  puntoVentaSchema,
  type PuntoVentaInput,
} from '@/lib/domain/puntos-venta/schema';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { Row } from '@/lib/supabase/database.types';

import { actualizarPuntoVenta, cambiarEstadoPuntoVenta, crearPuntoVenta } from './actions';

type PuntoVenta = Row<'puntos_venta'>;

function aInput(p: PuntoVenta): PuntoVentaInput {
  return { numero: p.numero, descripcion: p.descripcion ?? '', tipoEmision: p.tipo_emision };
}

function PuntoVentaFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  punto,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  punto?: PuntoVenta;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<PuntoVentaInput>({
    resolver: zodResolver(puntoVentaSchema),
    defaultValues: punto ? aInput(punto) : puntoVentaFormDefaults,
  });

  function setOpen(v: boolean) {
    if (!controlado) setInternalOpen(v);
    onOpenChangeProp?.(v);
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      form.reset(punto ? aInput(punto) : puntoVentaFormDefaults);
    }
  }

  function onSubmit(values: PuntoVentaInput) {
    setError(null);
    startTransition(async () => {
      const res = punto
        ? await actualizarPuntoVenta(punto.id, values)
        : await crearPuntoVenta(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success(punto ? 'Punto de venta actualizado' : 'Punto de venta creado');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{punto ? 'Editar punto de venta' : 'Nuevo punto de venta'}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="numero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="99999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tipoEmision"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de emisión</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_EMISION.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ETIQUETA_TIPO_EMISION[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AccionesPunto({ punto }: { punto: PuntoVenta }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      const res = await cambiarEstadoPuntoVenta(punto.id, !punto.activo);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success(punto.activo ? 'Punto desactivado' : 'Punto activado');
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
            {punto.activo ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PuntoVentaFormDialog open={editOpen} onOpenChange={setEditOpen} punto={punto} />
    </>
  );
}

export function PuntosVentaTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  puedeEscribir,
}: {
  data: PuntoVenta[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  puedeEscribir: boolean;
}) {
  const columns = useMemo<ColumnDef<PuntoVenta, unknown>[]>(() => {
    const base: ColumnDef<PuntoVenta, unknown>[] = [
      {
        accessorKey: 'numero',
        header: 'Número',
        meta: { sortable: true, sortKey: 'numero' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {String(row.original.numero).padStart(5, '0')}
          </span>
        ),
      },
      {
        accessorKey: 'descripcion',
        header: 'Descripción',
        cell: ({ row }) => (
          <span className="text-sm">{row.original.descripcion ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'tipo_emision',
        header: 'Emisión',
        cell: ({ row }) => (
          <Badge variant="muted">{ETIQUETA_TIPO_EMISION[row.original.tipo_emision]}</Badge>
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
        cell: ({ row }) => <AccionesPunto punto={row.original} />,
      });
    }
    return base;
  }, [puedeEscribir]);

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
      searchPlaceholder="Buscar por descripción…"
      csvFilename="puntos_venta"
      toolbar={
        puedeEscribir ? (
          <PuntoVentaFormDialog
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
