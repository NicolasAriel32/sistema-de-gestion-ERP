'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import { calcularTotalesCompra } from '@/lib/domain/compras/calculo';
import {
  itemCompraDefaults,
  ordenCompraSchema,
  type OrdenCompraInput,
} from '@/lib/domain/compras/schema';
import { ALICUOTAS_VALIDAS } from '@/lib/domain/comprobantes/calculo';
import { formatearMoneda } from '@/lib/format';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';

import {
  buscarProductosCompra,
  buscarProveedores,
  guardarOrdenCompra,
  type ProductoCompra,
  type ProveedorCompra,
} from '../../actions';

type Deposito = { id: string; nombre: string; es_default: boolean };

function hoyEnBuenosAires(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
}

function BuscadorProveedor({
  seleccionado,
  onElegir,
}: {
  seleccionado: ProveedorCompra | null;
  onElegir: (p: ProveedorCompra | null) => void;
}) {
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ProveedorCompra[]>([]);
  const [pending, startTransition] = useTransition();
  const ultima = useRef('');

  useEffect(() => {
    const t = termino.trim();
    if (t.length < 2) {
      setResultados([]);
      return;
    }
    const id = setTimeout(() => {
      ultima.current = t;
      startTransition(async () => {
        const r = await buscarProveedores(t);
        if (ultima.current === t) setResultados(r);
      });
    }, 200);
    return () => clearTimeout(id);
  }, [termino]);

  if (seleccionado) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {seleccionado.razonSocial}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {seleccionado.cuit}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onElegir(null)}>
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <Command shouldFilter={false} className="rounded-md border border-border">
      <CommandInput placeholder="Razón social o CUIT…" value={termino} onValueChange={setTermino} />
      <CommandList className="max-h-40">
        <CommandEmpty>
          {pending
            ? 'Buscando…'
            : termino.trim().length < 2
              ? 'Escribí al menos 2 caracteres.'
              : 'Sin resultados.'}
        </CommandEmpty>
        {resultados.length > 0 ? (
          <CommandGroup>
            {resultados.map((p) => (
              <CommandItem key={p.id} value={p.id} onSelect={() => onElegir(p)}>
                <span className="min-w-0 flex-1 truncate">{p.razonSocial}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.cuit}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );
}

function DialogoProducto({
  open,
  onOpenChange,
  onElegir,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onElegir: (p: ProductoCompra) => void;
}) {
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ProductoCompra[]>([]);
  const [pending, startTransition] = useTransition();
  const ultima = useRef('');

  useEffect(() => {
    if (!open) return;
    const t = termino.trim();
    if (t.length < 2) {
      setResultados([]);
      return;
    }
    const id = setTimeout(() => {
      ultima.current = t;
      startTransition(async () => {
        const r = await buscarProductosCompra(t);
        if (ultima.current === t) setResultados(r);
      });
    }, 200);
    return () => clearTimeout(id);
  }, [termino, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Buscar producto</DialogTitle>
          <DialogDescription className="sr-only">
            Buscá por código, nombre o código de barras.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Código, nombre o código de barras…"
            value={termino}
            onValueChange={setTermino}
          />
          <CommandList>
            <CommandEmpty>
              {pending
                ? 'Buscando…'
                : termino.trim().length < 2
                  ? 'Escribí al menos 2 caracteres.'
                  : 'Sin resultados.'}
            </CommandEmpty>
            {resultados.length > 0 ? (
              <CommandGroup heading="Productos">
                {resultados.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onElegir(p);
                      setTermino('');
                      onOpenChange(false);
                    }}
                  >
                    <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
                      {p.codigo}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {formatearMoneda(p.precioCosto)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function OrdenCompraEditor({
  depositos,
  depositoPorDefecto,
}: {
  depositos: Deposito[];
  depositoPorDefecto: string | null;
}) {
  const router = useRouter();
  const [proveedor, setProveedor] = useState<ProveedorCompra | null>(null);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [indiceItem, setIndiceItem] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<OrdenCompraInput>({
    resolver: zodResolver(ordenCompraSchema),
    defaultValues: {
      proveedorId: '',
      depositoId: depositoPorDefecto,
      fecha: hoyEnBuenosAires(),
      fechaEntrega: '',
      observaciones: '',
      items: [{ ...itemCompraDefaults }],
    },
  });

  const items = useFieldArray({ control: form.control, name: 'items' });
  const valores = form.watch();

  // La orden se presupuesta siempre con IVA discriminado: es un documento
  // interno, no un comprobante fiscal.
  const totales = useMemo(() => {
    try {
      return calcularTotalesCompra(
        (valores.items ?? []).map((i) => ({
          cantidad: Number(i.cantidad) || 0,
          precioUnitario: Number(i.precioUnitario) || 0,
          alicuotaIva: Number(i.alicuotaIva) || 0,
        })),
        { modoIva: 'DISCRIMINADO' },
      );
    } catch {
      return null;
    }
  }, [valores.items]);

  function elegirProveedor(p: ProveedorCompra | null) {
    setProveedor(p);
    form.setValue('proveedorId', p?.id ?? '', { shouldValidate: true });
  }

  function aplicarProducto(p: ProductoCompra) {
    form.setValue(`items.${indiceItem}.productoId`, p.id);
    form.setValue(`items.${indiceItem}.descripcion`, p.nombre);
    form.setValue(`items.${indiceItem}.alicuotaIva`, p.alicuotaIva);
    if (!form.getValues(`items.${indiceItem}.precioUnitario`)) {
      form.setValue(`items.${indiceItem}.precioUnitario`, p.precioCosto);
    }
  }

  function onSubmit(values: OrdenCompraInput) {
    setError(null);
    startTransition(async () => {
      const res = await guardarOrdenCompra(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success('Orden de compra guardada como borrador');
      router.push('/compras/ordenes');
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <section className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label className="mb-2 block">Proveedor</Label>
            <BuscadorProveedor seleccionado={proveedor} onElegir={elegirProveedor} />
            {form.formState.errors.proveedorId ? (
              <p className="mt-1 text-sm text-destructive">
                {form.formState.errors.proveedorId.message}
              </p>
            ) : null}
          </div>

          <FormField
            control={form.control}
            name="fecha"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fechaEntrega"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entrega esperada</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="depositoId"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Depósito de destino</FormLabel>
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí un depósito" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {depositos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Renglones</h2>
              <Badge variant="outline">precios sin IVA</Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => items.append({ ...itemCompraDefaults })}
            >
              <Plus />
              Agregar renglón
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Descripción</TableHead>
                <TableHead className="w-[110px] text-right">Cantidad</TableHead>
                <TableHead className="w-[140px] text-right">Precio neto</TableHead>
                <TableHead className="w-[100px]">IVA</TableHead>
                <TableHead className="w-[130px] text-right">Subtotal</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.fields.map((campo, i) => (
                <TableRow key={campo.id}>
                  <TableCell>
                    <div className="flex gap-1">
                      <Input
                        {...form.register(`items.${i}.descripcion`)}
                        placeholder="Descripción del renglón"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIndiceItem(i);
                          setBuscadorAbierto(true);
                        }}
                      >
                        Buscar
                      </Button>
                    </div>
                    {form.formState.errors.items?.[i]?.descripcion ? (
                      <p className="mt-1 text-xs text-destructive">
                        {form.formState.errors.items?.[i]?.descripcion?.message}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Input
                      {...form.register(`items.${i}.cantidad`)}
                      type="number"
                      step="0.0001"
                      min="0"
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      {...form.register(`items.${i}.precioUnitario`)}
                      type="number"
                      step="0.01"
                      min="0"
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      {...form.register(`items.${i}.alicuotaIva`)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {ALICUOTAS_VALIDAS.map((a) => (
                        <option key={a} value={a}>
                          {a}%
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearMoneda(totales?.items[i]?.subtotal ?? 0)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar renglón"
                      disabled={items.fields.length === 1}
                      onClick={() => items.remove(i)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="observaciones"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observaciones</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={4} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <dl className="space-y-1.5 rounded-md border border-border p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Neto</dt>
              <dd className="tabular-nums">{formatearMoneda(totales?.netoGravado ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="tabular-nums">
                {formatearMoneda(
                  (totales?.iva105 ?? 0) + (totales?.iva21 ?? 0) + (totales?.iva27 ?? 0),
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
              <dt>Total estimado</dt>
              <dd className="tabular-nums">{formatearMoneda(totales?.total ?? 0)}</dd>
            </div>
          </dl>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/compras/ordenes')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar borrador'}
          </Button>
        </div>
      </form>

      <DialogoProducto
        open={buscadorAbierto}
        onOpenChange={setBuscadorAbierto}
        onElegir={aplicarProducto}
      />
    </Form>
  );
}
