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
  DialogFooter,
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
import {
  calcularTotalesCompra,
  ETIQUETA_PERCEPCION,
  modoIvaDeLetra,
  TIPOS_PERCEPCION,
} from '@/lib/domain/compras/calculo';
import {
  compraSchema,
  ETIQUETA_TIPO_COMPRA,
  itemCompraDefaults,
  letraDeTipoCompra,
  percepcionDefaults,
  TIPOS_COMPRA,
  type CompraInput,
} from '@/lib/domain/compras/schema';
import { ALICUOTAS_VALIDAS } from '@/lib/domain/comprobantes/calculo';
import { formatearMoneda } from '@/lib/format';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';

import {
  buscarProductosCompra,
  buscarProveedores,
  registrarCompra,
  type ProductoCompra,
  type ProveedorCompra,
} from '../actions';

type Deposito = { id: string; nombre: string; es_default: boolean };

export type ItemPrecargado = {
  productoId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: number;
};

function hoyEnBuenosAires(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
}

// ---------------------------------------------------------------------
// Buscadores
// ---------------------------------------------------------------------

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
      <CommandInput
        placeholder="Razón social o CUIT…"
        value={termino}
        onValueChange={setTermino}
      />
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
                    {!p.manejaStock ? (
                      <Badge variant="muted" className="shrink-0">
                        no mueve stock
                      </Badge>
                    ) : null}
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

// ---------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------

export function CompraEditor({
  depositos,
  depositoPorDefecto,
  ordenInfo,
  itemsPrecargados,
}: {
  depositos: Deposito[];
  depositoPorDefecto: string | null;
  ordenInfo: { id: string; numero: number; proveedorId: string; proveedor: string } | null;
  itemsPrecargados: ItemPrecargado[];
}) {
  const router = useRouter();
  const [proveedor, setProveedor] = useState<ProveedorCompra | null>(
    ordenInfo
      ? { id: ordenInfo.proveedorId, razonSocial: ordenInfo.proveedor, cuit: '', condicionIva: '' }
      : null,
  );
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [indiceItem, setIndiceItem] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<CompraInput>({
    resolver: zodResolver(compraSchema),
    defaultValues: {
      proveedorId: ordenInfo?.proveedorId ?? '',
      ordenCompraId: ordenInfo?.id ?? null,
      tipoComprobante: 'FACTURA_A',
      puntoVentaNumero: 1,
      numero: 1,
      caeProveedor: '',
      fechaEmision: hoyEnBuenosAires(),
      fechaVencimiento: '',
      depositoId: depositoPorDefecto,
      condicionVenta: 'CONTADO',
      observaciones: '',
      items:
        itemsPrecargados.length > 0
          ? itemsPrecargados.map((i) => ({
              productoId: i.productoId,
              descripcion: i.descripcion,
              cantidad: i.cantidad,
              precioUnitario: i.precioUnitario,
              alicuotaIva: i.alicuotaIva,
            }))
          : [{ ...itemCompraDefaults }],
      percepciones: [],
    },
  });

  const items = useFieldArray({ control: form.control, name: 'items' });
  const percepciones = useFieldArray({ control: form.control, name: 'percepciones' });

  const valores = form.watch();
  const letra = letraDeTipoCompra(valores.tipoComprobante);
  const modoIva = modoIvaDeLetra(letra);

  const totales = useMemo(() => {
    try {
      return calcularTotalesCompra(
        (valores.items ?? []).map((i) => ({
          cantidad: Number(i.cantidad) || 0,
          precioUnitario: Number(i.precioUnitario) || 0,
          alicuotaIva: Number(i.alicuotaIva) || 0,
        })),
        {
          modoIva,
          percepciones: (valores.percepciones ?? []).map((p) => ({
            tipo: p.tipo,
            jurisdiccion: p.jurisdiccion,
            baseImponible: Number(p.baseImponible) || 0,
            alicuota: Number(p.alicuota) || 0,
            importe: Number(p.importe) || 0,
          })),
        },
      );
    } catch {
      // Mientras el usuario escribe, un renglón a medio cargar puede no
      // ser calculable. No es un error: es un formulario en curso.
      return null;
    }
  }, [valores.items, valores.percepciones, modoIva]);

  function elegirProveedor(p: ProveedorCompra | null) {
    setProveedor(p);
    form.setValue('proveedorId', p?.id ?? '', { shouldValidate: true });
  }

  function abrirBuscador(indice: number) {
    setIndiceItem(indice);
    setBuscadorAbierto(true);
  }

  function aplicarProducto(p: ProductoCompra) {
    form.setValue(`items.${indiceItem}.productoId`, p.id);
    form.setValue(`items.${indiceItem}.descripcion`, p.nombre);
    form.setValue(`items.${indiceItem}.alicuotaIva`, p.alicuotaIva);
    if (!form.getValues(`items.${indiceItem}.precioUnitario`)) {
      form.setValue(`items.${indiceItem}.precioUnitario`, p.precioCosto);
    }
  }

  function onSubmit(values: CompraInput) {
    setError(null);
    startTransition(async () => {
      const res = await registrarCompra(values);
      if (esError(res)) {
        setError(res.error);
        setConfirmando(false);
        return;
      }
      toast.success('Factura registrada. La mercadería ingresó al depósito.');
      router.push('/compras');
      router.refresh();
    });
  }

  const hayProductosConStock = (valores.items ?? []).some((i) => i.productoId !== null);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(() => setConfirmando(true))}
        className="flex flex-col gap-5"
      >
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        {ordenInfo ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            Imputando contra la orden de compra{' '}
            <span className="font-medium">N° {ordenInfo.numero}</span>. Ajustá las cantidades si el
            proveedor mandó menos de lo pedido: la orden queda en recepción parcial.
          </p>
        ) : null}

        {/* --- Cabecera --- */}
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
            name="tipoComprobante"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPOS_COMPRA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ETIQUETA_TIPO_COMPRA[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="puntoVentaNumero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pto. venta</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min="0" className="tabular-nums" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="numero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min="1" className="tabular-nums" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="fechaEmision"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de emisión</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="condicionVenta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Condición</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="CONTADO">Contado</SelectItem>
                    <SelectItem value="CUENTA_CORRIENTE">Cuenta corriente</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fechaVencimiento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vencimiento</FormLabel>
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
              <FormItem>
                <FormLabel>Depósito de ingreso</FormLabel>
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

          <FormField
            control={form.control}
            name="caeProveedor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CAE del proveedor</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" placeholder="14 dígitos (opcional)" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* --- Renglones --- */}
        <section className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Renglones</h2>
              <Badge variant="outline">Letra {letra}</Badge>
              <span className="text-xs text-muted-foreground">
                {modoIva === 'DISCRIMINADO'
                  ? 'los precios se cargan sin IVA'
                  : 'los precios se cargan con IVA incluido'}
              </span>
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
                <TableHead className="w-[36%]">Descripción</TableHead>
                <TableHead className="w-[110px] text-right">Cantidad</TableHead>
                <TableHead className="w-[140px] text-right">
                  Precio {modoIva === 'DISCRIMINADO' ? 'neto' : 'final'}
                </TableHead>
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
                        onClick={() => abrirBuscador(i)}
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

        {/* --- Percepciones --- */}
        <section className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div>
              <h2 className="text-sm font-medium">Percepciones</h2>
              <p className="text-xs text-muted-foreground">
                Se suman al total pero no son ni neto ni IVA. El Libro IVA Digital las pide
                itemizadas.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => percepciones.append({ ...percepcionDefaults })}
            >
              <Plus />
              Agregar
            </Button>
          </div>

          {percepciones.fields.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Esta factura no tiene percepciones.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Tipo</TableHead>
                  <TableHead className="w-[140px]">Jurisdicción</TableHead>
                  <TableHead className="w-[140px] text-right">Base</TableHead>
                  <TableHead className="w-[110px] text-right">Alícuota %</TableHead>
                  <TableHead className="w-[140px] text-right">Importe</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {percepciones.fields.map((campo, i) => (
                  <TableRow key={campo.id}>
                    <TableCell>
                      <select
                        {...form.register(`percepciones.${i}.tipo`)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {TIPOS_PERCEPCION.map((t) => (
                          <option key={t} value={t}>
                            {ETIQUETA_PERCEPCION[t]}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`percepciones.${i}.jurisdiccion`)}
                        placeholder="CABA…"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`percepciones.${i}.baseImponible`)}
                        type="number"
                        step="0.01"
                        min="0"
                        className="text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`percepciones.${i}.alicuota`)}
                        type="number"
                        step="0.0001"
                        min="0"
                        className="text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`percepciones.${i}.importe`)}
                        type="number"
                        step="0.01"
                        min="0"
                        className="text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar percepción"
                        onClick={() => percepciones.remove(i)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* --- Totales y observaciones --- */}
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
              <dt className="text-muted-foreground">Neto gravado</dt>
              <dd className="tabular-nums">{formatearMoneda(totales?.netoGravado ?? 0)}</dd>
            </div>
            {(totales?.iva105 ?? 0) > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IVA 10,5%</dt>
                <dd className="tabular-nums">{formatearMoneda(totales?.iva105 ?? 0)}</dd>
              </div>
            ) : null}
            {(totales?.iva21 ?? 0) > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IVA 21%</dt>
                <dd className="tabular-nums">{formatearMoneda(totales?.iva21 ?? 0)}</dd>
              </div>
            ) : null}
            {(totales?.iva27 ?? 0) > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IVA 27%</dt>
                <dd className="tabular-nums">{formatearMoneda(totales?.iva27 ?? 0)}</dd>
              </div>
            ) : null}
            {(totales?.totalPercepciones ?? 0) > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Percepciones</dt>
                <dd className="tabular-nums">
                  {formatearMoneda(totales?.totalPercepciones ?? 0)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatearMoneda(totales?.total ?? 0)}</dd>
            </div>
          </dl>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/compras')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            Registrar factura
          </Button>
        </div>
      </form>

      <DialogoProducto
        open={buscadorAbierto}
        onOpenChange={setBuscadorAbierto}
        onElegir={aplicarProducto}
      />

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar registro de la factura</DialogTitle>
            <DialogDescription>
              La factura se registra por {formatearMoneda(totales?.total ?? 0)}.
              {hayProductosConStock
                ? ' La mercadería ingresa al depósito elegido y el costo de esos productos pasa a ser el de esta compra.'
                : ''}
              {valores.condicionVenta === 'CUENTA_CORRIENTE'
                ? ' Además se genera la deuda en la cuenta corriente del proveedor.'
                : ''}{' '}
              Una vez registrada no se puede editar: se anula y se vuelve a cargar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmando(false)}>
              Volver
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => onSubmit(form.getValues())}
            >
              {pending ? 'Registrando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
