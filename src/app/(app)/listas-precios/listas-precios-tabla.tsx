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
import { Switch } from '@/components/ui/switch';
import { ETIQUETA_TIPO_AJUSTE, TIPOS_AJUSTE_LISTA } from '@/lib/domain/opciones';
import {
  listaPrecioFormDefaults,
  listaPrecioSchema,
  type ListaPrecioInput,
} from '@/lib/domain/listas-precios/schema';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { Row } from '@/lib/supabase/database.types';

import { actualizarListaPrecio, cambiarEstadoListaPrecio, crearListaPrecio } from './actions';

type Lista = Row<'listas_precios'>;

function aInput(l: Lista): ListaPrecioInput {
  return {
    nombre: l.nombre,
    tipoAjuste: l.tipo_ajuste,
    porcentaje: l.porcentaje,
    esDefault: l.es_default,
  };
}

function ListaFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  lista,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  lista?: Lista;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<ListaPrecioInput>({
    resolver: zodResolver(listaPrecioSchema),
    defaultValues: lista ? aInput(lista) : listaPrecioFormDefaults,
  });

  function setOpen(v: boolean) {
    if (!controlado) setInternalOpen(v);
    onOpenChangeProp?.(v);
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      form.reset(lista ? aInput(lista) : listaPrecioFormDefaults);
    }
  }

  function onSubmit(values: ListaPrecioInput) {
    setError(null);
    startTransition(async () => {
      const res = lista
        ? await actualizarListaPrecio(lista.id, values)
        : await crearListaPrecio(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success(lista ? 'Lista actualizada' : 'Lista creada');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lista ? 'Editar lista de precios' : 'Nueva lista de precios'}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tipoAjuste"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de ajuste</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPOS_AJUSTE_LISTA.map((t) => (
                          <SelectItem key={t} value={t}>
                            {ETIQUETA_TIPO_AJUSTE[t]}
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
                name="porcentaje"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porcentaje (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="esDefault"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <FormLabel className="mb-0">Lista por defecto</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
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

function AccionesLista({ lista }: { lista: Lista }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      const res = await cambiarEstadoListaPrecio(lista.id, !lista.activa);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success(lista.activa ? 'Lista desactivada' : 'Lista activada');
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
            {lista.activa ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ListaFormDialog open={editOpen} onOpenChange={setEditOpen} lista={lista} />
    </>
  );
}

export function ListasPreciosTabla({
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
  data: Lista[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  puedeEscribir: boolean;
}) {
  const columns = useMemo<ColumnDef<Lista, unknown>[]>(() => {
    const base: ColumnDef<Lista, unknown>[] = [
      {
        accessorKey: 'nombre',
        header: 'Nombre',
        meta: { sortable: true, sortKey: 'nombre' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.nombre}
            {row.original.es_default ? <Badge variant="muted">Por defecto</Badge> : null}
          </span>
        ),
      },
      {
        accessorKey: 'tipo_ajuste',
        header: 'Ajuste',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {ETIQUETA_TIPO_AJUSTE[row.original.tipo_ajuste]}
          </span>
        ),
      },
      {
        accessorKey: 'porcentaje',
        header: 'Porcentaje',
        cell: ({ row }) => <span className="tabular-nums">{row.original.porcentaje}%</span>,
      },
      {
        accessorKey: 'activa',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.activa ? (
            <Badge variant="success">Activa</Badge>
          ) : (
            <Badge variant="muted">Inactiva</Badge>
          ),
      },
    ];
    if (puedeEscribir) {
      base.push({
        id: 'acciones',
        header: '',
        cell: ({ row }) => <AccionesLista lista={row.original} />,
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
      searchPlaceholder="Buscar lista…"
      csvFilename="listas_precios"
      toolbar={
        puedeEscribir ? (
          <ListaFormDialog
            trigger={
              <Button size="sm">
                <Plus />
                Nueva
              </Button>
            }
          />
        ) : null
      }
    />
  );
}
