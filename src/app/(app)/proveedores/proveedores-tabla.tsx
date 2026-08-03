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
import { Textarea } from '@/components/ui/textarea';
import { formatearCuit } from '@/lib/domain/fiscal/cuit';
import { CONDICIONES_IVA, ETIQUETA_CONDICION_IVA } from '@/lib/domain/opciones';
import {
  proveedorFormDefaults,
  proveedorSchema,
  type ProveedorInput,
} from '@/lib/domain/proveedores/schema';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { Row } from '@/lib/supabase/database.types';

import { actualizarProveedor, cambiarEstadoProveedor, crearProveedor } from './actions';

type Proveedor = Row<'proveedores'>;

function aInput(p: Proveedor): ProveedorInput {
  return {
    razonSocial: p.razon_social,
    cuit: p.cuit ?? '',
    condicionIva: p.condicion_iva,
    email: p.email ?? '',
    telefono: p.telefono ?? '',
    domicilio: p.domicilio ?? '',
    observaciones: p.observaciones ?? '',
  };
}

function ProveedorFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  proveedor,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  proveedor?: Proveedor;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: proveedor ? aInput(proveedor) : proveedorFormDefaults,
  });

  function setOpen(v: boolean) {
    if (!controlado) setInternalOpen(v);
    onOpenChangeProp?.(v);
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      form.reset(proveedor ? aInput(proveedor) : proveedorFormDefaults);
    }
  }

  function onSubmit(values: ProveedorInput) {
    setError(null);
    startTransition(async () => {
      const res = proveedor
        ? await actualizarProveedor(proveedor.id, values)
        : await crearProveedor(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success(proveedor ? 'Proveedor actualizado' : 'Proveedor creado');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="razonSocial"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Razón social</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cuit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CUIT</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" placeholder="30-50000000-3" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="condicionIva"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condición IVA</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONDICIONES_IVA.map((c) => (
                        <SelectItem key={c} value={c}>
                          {ETIQUETA_CONDICION_IVA[c]}
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telefono"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="domicilio"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Domicilio</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="observaciones"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="sm:col-span-2">
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

function AccionesProveedor({ proveedor }: { proveedor: Proveedor }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      const res = await cambiarEstadoProveedor(proveedor.id, !proveedor.activo);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success(proveedor.activo ? 'Proveedor desactivado' : 'Proveedor activado');
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
            {proveedor.activo ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProveedorFormDialog open={editOpen} onOpenChange={setEditOpen} proveedor={proveedor} />
    </>
  );
}

export function ProveedoresTabla({
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
  data: Proveedor[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  puedeEscribir: boolean;
}) {
  const columns = useMemo<ColumnDef<Proveedor, unknown>[]>(() => {
    const base: ColumnDef<Proveedor, unknown>[] = [
      {
        accessorKey: 'razon_social',
        header: 'Razón social',
        meta: { sortable: true, sortKey: 'razon_social' } satisfies ColumnaMeta,
        cell: ({ row }) => <span className="font-medium">{row.original.razon_social}</span>,
      },
      {
        accessorKey: 'cuit',
        header: 'CUIT',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.cuit ? formatearCuit(row.original.cuit) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'condicion_iva',
        header: 'Cond. IVA',
        cell: ({ row }) => (
          <Badge variant="muted">{ETIQUETA_CONDICION_IVA[row.original.condicion_iva]}</Badge>
        ),
      },
      {
        accessorKey: 'telefono',
        header: 'Contacto',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.telefono ?? row.original.email ?? '—'}
          </span>
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
        cell: ({ row }) => <AccionesProveedor proveedor={row.original} />,
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
      searchPlaceholder="Buscar por razón social o CUIT…"
      csvFilename="proveedores"
      toolbar={
        puedeEscribir ? (
          <ProveedorFormDialog
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
