'use client';

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ajusteStockDefaults,
  ajusteStockSchema,
  transferenciaStockDefaults,
  transferenciaStockSchema,
  type AjusteStockInput,
  type TransferenciaStockInput,
} from '@/lib/domain/stock/schema';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';

import { ajustarStock, buscarProductosStock, transferirStock, type ProductoBusqueda } from './actions';

type Deposito = { id: string; nombre: string };

/**
 * Selector de producto embebido. No usa CommandDialog porque ya estamos
 * dentro de un Dialog: anidar dos overlays de Radix rompe el foco.
 */
function SelectorProducto({
  seleccionado,
  onElegir,
}: {
  seleccionado: ProductoBusqueda | null;
  onElegir: (p: ProductoBusqueda | null) => void;
}) {
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ProductoBusqueda[]>([]);
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
        const r = await buscarProductosStock(t);
        if (ultima.current === t) setResultados(r);
      });
    }, 200);
    return () => clearTimeout(id);
  }, [termino]);

  if (seleccionado) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
        <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
          {seleccionado.codigo}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{seleccionado.nombre}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onElegir(null)}>
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <Command shouldFilter={false} className="rounded-md border border-border">
      <CommandInput
        placeholder="Código, nombre o código de barras…"
        value={termino}
        onValueChange={setTermino}
      />
      <CommandList className="max-h-48">
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
                <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {p.codigo}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );
}

// ---------------------------------------------------------------------
// Ajuste manual
// ---------------------------------------------------------------------

export function AjusteDialog({
  trigger,
  depositos,
}: {
  trigger: ReactNode;
  depositos: Deposito[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [producto, setProducto] = useState<ProductoBusqueda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<AjusteStockInput>({
    resolver: zodResolver(ajusteStockSchema),
    defaultValues: ajusteStockDefaults,
  });

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      setProducto(null);
      form.reset({
        ...ajusteStockDefaults,
        depositoId: depositos[0]?.id ?? '',
      });
    }
  }

  function elegir(p: ProductoBusqueda | null) {
    setProducto(p);
    form.setValue('productoId', p?.id ?? '', { shouldValidate: true });
  }

  function onSubmit(values: AjusteStockInput) {
    setError(null);
    startTransition(async () => {
      const res = await ajustarStock(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success('Ajuste registrado');
      setOpen(false);
      router.refresh();
    });
  }

  const cantidad = form.watch('cantidad');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste manual de stock</DialogTitle>
          <DialogDescription>
            El movimiento queda registrado para siempre y no se puede editar ni borrar. Poné una
            cantidad positiva para sumar existencias y negativa para restarlas.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="productoId"
              render={() => (
                <FormItem>
                  <FormLabel>Producto</FormLabel>
                  <SelectorProducto seleccionado={producto} onElegir={elegir} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="depositoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depósito</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
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
                name="cantidad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.0001"
                        inputMode="decimal"
                        className="tabular-nums"
                      />
                    </FormControl>
                    <FormDescription>
                      {Number(cantidad) > 0
                        ? 'Suma existencias'
                        : Number(cantidad) < 0
                          ? 'Resta existencias'
                          : 'Positivo suma, negativo resta'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="Rotura, faltante de inventario, corrección de carga…"
                    />
                  </FormControl>
                  <FormDescription>
                    Obligatorio. Es lo único que va a explicar este ajuste dentro de seis meses.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Registrando…' : 'Registrar ajuste'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// Transferencia entre depósitos
// ---------------------------------------------------------------------

export function TransferenciaDialog({
  trigger,
  depositos,
}: {
  trigger: ReactNode;
  depositos: Deposito[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [producto, setProducto] = useState<ProductoBusqueda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<TransferenciaStockInput>({
    resolver: zodResolver(transferenciaStockSchema),
    defaultValues: transferenciaStockDefaults,
  });

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      setProducto(null);
      form.reset({
        ...transferenciaStockDefaults,
        origenId: depositos[0]?.id ?? '',
        destinoId: depositos[1]?.id ?? '',
      });
    }
  }

  function elegir(p: ProductoBusqueda | null) {
    setProducto(p);
    form.setValue('productoId', p?.id ?? '', { shouldValidate: true });
  }

  function onSubmit(values: TransferenciaStockInput) {
    setError(null);
    startTransition(async () => {
      const res = await transferirStock(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success('Transferencia registrada');
      setOpen(false);
      router.refresh();
    });
  }

  const hayDosDepositos = depositos.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir entre depósitos</DialogTitle>
          <DialogDescription>
            Genera dos movimientos espejo: una salida del origen y una entrada al destino. El stock
            total de la empresa no cambia.
          </DialogDescription>
        </DialogHeader>

        {!hayDosDepositos ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Necesitás al menos dos depósitos activos para poder transferir.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="productoId"
              render={() => (
                <FormItem>
                  <FormLabel>Producto</FormLabel>
                  <SelectorProducto seleccionado={producto} onElegir={elegir} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="origenId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desde</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Origen" />
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
                name="destinoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hacia</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Destino" />
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
            </div>

            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      step="0.0001"
                      min="0"
                      inputMode="decimal"
                      className="tabular-nums"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Reposición de mostrador…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || !hayDosDepositos}>
                {pending ? 'Transfiriendo…' : 'Transferir'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
