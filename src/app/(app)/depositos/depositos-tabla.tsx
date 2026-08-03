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
import { Switch } from '@/components/ui/switch';
import {
  depositoFormDefaults,
  depositoSchema,
  type DepositoInput,
} from '@/lib/domain/depositos/schema';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { Row } from '@/lib/supabase/database.types';

import { actualizarDeposito, cambiarEstadoDeposito, crearDeposito } from './actions';

type Deposito = Row<'depositos'>;

function aInput(d: Deposito): DepositoInput {
  return { nombre: d.nombre, direccion: d.direccion ?? '', esDefault: d.es_default };
}

function DepositoFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  deposito,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  deposito?: Deposito;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<DepositoInput>({
    resolver: zodResolver(depositoSchema),
    defaultValues: deposito ? aInput(deposito) : depositoFormDefaults,
  });

  function setOpen(v: boolean) {
    if (!controlado) setInternalOpen(v);
    onOpenChangeProp?.(v);
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      form.reset(deposito ? aInput(deposito) : depositoFormDefaults);
    }
  }

  function onSubmit(values: DepositoInput) {
    setError(null);
    startTransition(async () => {
      const res = deposito
        ? await actualizarDeposito(deposito.id, values)
        : await crearDeposito(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success(deposito ? 'Depósito actualizado' : 'Depósito creado');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deposito ? 'Editar depósito' : 'Nuevo depósito'}</DialogTitle>
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
            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="esDefault"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <FormLabel className="mb-0">Depósito principal</FormLabel>
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

function AccionesDeposito({ deposito }: { deposito: Deposito }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      const res = await cambiarEstadoDeposito(deposito.id, !deposito.activo);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success(deposito.activo ? 'Depósito desactivado' : 'Depósito activado');
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
            {deposito.activo ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DepositoFormDialog open={editOpen} onOpenChange={setEditOpen} deposito={deposito} />
    </>
  );
}

export function DepositosTabla({
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
  data: Deposito[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  puedeEscribir: boolean;
}) {
  const columns = useMemo<ColumnDef<Deposito, unknown>[]>(() => {
    const base: ColumnDef<Deposito, unknown>[] = [
      {
        accessorKey: 'nombre',
        header: 'Nombre',
        meta: { sortable: true, sortKey: 'nombre' } satisfies ColumnaMeta,
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.nombre}
            {row.original.es_default ? <Badge variant="muted">Principal</Badge> : null}
          </span>
        ),
      },
      {
        accessorKey: 'direccion',
        header: 'Dirección',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.direccion ?? '—'}</span>
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
        cell: ({ row }) => <AccionesDeposito deposito={row.original} />,
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
      searchPlaceholder="Buscar depósito…"
      csvFilename="depositos"
      toolbar={
        puedeEscribir ? (
          <DepositoFormDialog
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
