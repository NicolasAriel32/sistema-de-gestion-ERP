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
import {
  categoriaFormDefaults,
  categoriaSchema,
  type CategoriaInput,
} from '@/lib/domain/categorias/schema';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';
import type { EstadoFiltro } from '@/lib/tables/params';
import type { Row } from '@/lib/supabase/database.types';

import { actualizarCategoria, cambiarEstadoCategoria, crearCategoria } from './actions';

type Categoria = Row<'categorias'>;
type OpcionCategoria = { id: string; nombre: string };

const SIN_PADRE = '__none__';

function aInput(c: Categoria): CategoriaInput {
  return { nombre: c.nombre, padreId: c.padre_id };
}

function CategoriaFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  categoria,
  opciones,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  categoria?: Categoria;
  opciones: OpcionCategoria[];
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: categoria ? aInput(categoria) : categoriaFormDefaults,
  });

  // Una categoría no puede ser su propio padre.
  const opcionesPadre = opciones.filter((o) => o.id !== categoria?.id);

  function setOpen(v: boolean) {
    if (!controlado) setInternalOpen(v);
    onOpenChangeProp?.(v);
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      form.reset(categoria ? aInput(categoria) : categoriaFormDefaults);
    }
  }

  function onSubmit(values: CategoriaInput) {
    setError(null);
    startTransition(async () => {
      const res = categoria
        ? await actualizarCategoria(categoria.id, values)
        : await crearCategoria(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success(categoria ? 'Categoría actualizada' : 'Categoría creada');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{categoria ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
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
              name="padreId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría padre</FormLabel>
                  <Select
                    value={field.value ?? SIN_PADRE}
                    onValueChange={(v) => field.onChange(v === SIN_PADRE ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SIN_PADRE}>— Ninguna (raíz) —</SelectItem>
                      {opcionesPadre.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

function AccionesCategoria({
  categoria,
  opciones,
}: {
  categoria: Categoria;
  opciones: OpcionCategoria[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      const res = await cambiarEstadoCategoria(categoria.id, !categoria.activa);
      if (esError(res)) {
        toast.error(res.error);
        return;
      }
      toast.success(categoria.activa ? 'Categoría desactivada' : 'Categoría activada');
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
            {categoria.activa ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoriaFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        categoria={categoria}
        opciones={opciones}
      />
    </>
  );
}

export function CategoriasTabla({
  data,
  total,
  page,
  size,
  sort,
  dir,
  q,
  estado,
  opciones,
  puedeEscribir,
}: {
  data: Categoria[];
  total: number;
  page: number;
  size: number;
  sort: string;
  dir: 'asc' | 'desc';
  q: string;
  estado: EstadoFiltro;
  opciones: OpcionCategoria[];
  puedeEscribir: boolean;
}) {
  const nombrePorId = useMemo(() => new Map(opciones.map((o) => [o.id, o.nombre])), [opciones]);

  const columns = useMemo<ColumnDef<Categoria, unknown>[]>(() => {
    const base: ColumnDef<Categoria, unknown>[] = [
      {
        accessorKey: 'nombre',
        header: 'Nombre',
        meta: { sortable: true, sortKey: 'nombre' } satisfies ColumnaMeta,
        cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
      },
      {
        id: 'padre',
        header: 'Categoría padre',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.padre_id ? (nombrePorId.get(row.original.padre_id) ?? '—') : '—'}
          </span>
        ),
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
        cell: ({ row }) => <AccionesCategoria categoria={row.original} opciones={opciones} />,
      });
    }
    return base;
  }, [nombrePorId, opciones, puedeEscribir]);

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
      searchPlaceholder="Buscar categoría…"
      csvFilename="categorias"
      toolbar={
        puedeEscribir ? (
          <CategoriaFormDialog
            opciones={opciones}
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
