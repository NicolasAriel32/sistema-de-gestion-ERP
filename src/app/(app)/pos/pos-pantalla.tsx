'use client';

import { Loader2, Minus, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calcularTotales } from '@/lib/domain/comprobantes/calculo';
import { determinarLetra, modoIvaDeLetra } from '@/lib/domain/comprobantes/letra';
import { ETIQUETA_CONDICION_IVA } from '@/lib/domain/opciones';
import { hoyIso } from '@/lib/fechas';
import { formatearMoneda, formatearNumero } from '@/lib/format';
import { usePos } from '@/lib/stores/pos';
import type { CondicionIva, CondicionIvaEmisor } from '@/lib/supabase/database.types';

import {
  buscarClientesVenta,
  buscarProductosVenta,
  guardarYEmitir,
  type ClienteVenta,
  type ProductoVenta,
} from '../ventas/actions';

export type ConfigPos = {
  puntosVenta: { id: string; numero: number; descripcion: string | null }[];
  depositoId: string | null;
  listaPrecioId: string | null;
  condicionIvaEmisor: CondicionIvaEmisor;
  consumidorFinal: { id: string; razonSocial: string; condicionIva: CondicionIva } | null;
};

/**
 * Pantalla de mostrador.
 *
 * Corre sobre el mismo motor de cálculo y la misma acción de emisión que
 * el módulo de ventas: acá no hay una segunda implementación de nada, sólo
 * una interfaz más rápida. Todo se opera con teclado porque el vendedor de
 * mostrador tiene una mano en el lector de código de barras.
 */
export function PosPantalla({ config }: { config: ConfigPos }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    lineas,
    clienteId,
    clienteNombre,
    descuentoGlobal,
    agregar,
    cambiarCantidad,
    cambiarPrecio,
    cambiarDescuentoLinea,
    quitar,
    setCliente,
    setDescuentoGlobal,
    vaciar,
  } = usePos();

  const [condicionIvaCliente, setCondicionIvaCliente] = useState<CondicionIva>(
    config.consumidorFinal?.condicionIva ?? 'CONSUMIDOR_FINAL',
  );
  const [puntoVentaId, setPuntoVentaId] = useState(config.puntosVenta[0]?.id ?? '');
  const [buscador, setBuscador] = useState(false);
  const [buscadorClientes, setBuscadorClientes] = useState(false);
  const [cobro, setCobro] = useState(false);
  const [recibido, setRecibido] = useState('');
  const [error, setError] = useState<string | null>(null);
  const escaner = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState('');

  // El cliente por defecto es el "Consumidor Final" del catálogo.
  useEffect(() => {
    if (!clienteId && config.consumidorFinal) {
      setCliente(config.consumidorFinal.id, config.consumidorFinal.razonSocial);
      setCondicionIvaCliente(config.consumidorFinal.condicionIva);
    }
  }, [clienteId, config.consumidorFinal, setCliente]);

  const letra = determinarLetra(config.condicionIvaEmisor, condicionIvaCliente);
  const modoIva = modoIvaDeLetra(letra);

  const totales = useMemo(() => {
    try {
      return calcularTotales(
        lineas.map((l) => ({
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          descuentoPorcentaje: l.descuentoPorcentaje,
          alicuotaIva: l.alicuotaIva,
        })),
        { modoIva, descuentoPorcentaje: descuentoGlobal },
      );
    } catch {
      return null;
    }
  }, [lineas, modoIva, descuentoGlobal]);

  const total = totales?.total ?? 0;
  const vuelto = Math.max(0, Number(recibido.replace(',', '.') || 0) - total);

  // ---------------- Atajos ----------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        setBuscador(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        setBuscadorClientes(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (lineas.length > 0) {
          setError(null);
          setCobro(true);
        } else {
          toast.error('El carrito está vacío.');
        }
      } else if (e.key === 'Escape' && !buscador && !buscadorClientes && !cobro) {
        escaner.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lineas.length, buscador, buscadorClientes, cobro]);

  useEffect(() => {
    escaner.current?.focus();
  }, []);

  /** Lector de código de barras: escribe el código y manda Enter. */
  function onEscanear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const termino = codigo.trim();
    if (!termino) return;

    startTransition(async () => {
      const encontrados = await buscarProductosVenta(termino, {
        listaPrecioId: config.listaPrecioId,
        depositoId: config.depositoId,
        modoIva,
      });
      const exacto =
        encontrados.find((p) => p.codigo.toLowerCase() === termino.toLowerCase()) ??
        (encontrados.length === 1 ? encontrados[0] : undefined);

      if (!exacto) {
        toast.error(`No se encontró el producto "${termino}".`);
        return;
      }
      agregarProducto(exacto);
      setCodigo('');
    });
  }

  function agregarProducto(p: ProductoVenta) {
    agregar({
      productoId: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      precioUnitario: p.precio,
      alicuotaIva: p.alicuotaIva,
      saldo: p.saldo,
      manejaStock: p.manejaStock,
      permiteVentaSinStock: p.permiteVentaSinStock,
    });
  }

  function cobrar() {
    if (!clienteId) {
      setError('Elegí un cliente (F4).');
      return;
    }
    if (!puntoVentaId) {
      setError('No hay punto de venta configurado.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await guardarYEmitir({
        clase: 'FACTURA',
        puntoVentaId,
        clienteId,
        depositoId: config.depositoId,
        listaPrecioId: config.listaPrecioId,
        vendedorId: null,
        fechaEmision: hoyIso(),
        fechaVencimiento: '',
        condicionVenta: 'CONTADO',
        descuentoPorcentaje: descuentoGlobal,
        comprobanteOrigenId: null,
        observaciones: '',
        items: lineas.map((l) => ({
          productoId: l.productoId,
          descripcion: l.nombre,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          descuentoPorcentaje: l.descuentoPorcentaje,
          alicuotaIva: l.alicuotaIva,
        })),
      });

      if ('error' in res) {
        setError(res.error);
        return;
      }

      toast.success(`Factura ${letra} N° ${res.numero} emitida`);
      vaciar();
      setRecibido('');
      setCobro(false);
      router.refresh();
      escaner.current?.focus();
    });
  }

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-7rem)] lg:flex-row">
      {/* ---------------- Carrito ---------------- */}
      <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Input
            ref={escaner}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={onEscanear}
            placeholder="Escaneá o escribí un código y apretá Enter…"
            className="h-10 flex-1 text-base"
            autoComplete="off"
          />
          <Button variant="outline" onClick={() => setBuscador(true)} className="h-10">
            <Search className="size-4" />
            Buscar (F2)
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {lineas.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
              <p className="text-sm font-medium">El carrito está vacío</p>
              <p className="text-sm text-muted-foreground">
                Escaneá un producto o buscalo con F2.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {lineas.map((l) => {
                  const faltante =
                    l.manejaStock && !l.permiteVentaSinStock && l.saldo !== null
                      ? l.cantidad > l.saldo
                      : false;

                  return (
                    <tr key={l.productoId} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.codigo}
                          {l.saldo !== null ? ` · stock ${formatearNumero(l.saldo)}` : ''}
                          {faltante ? (
                            <span className="text-destructive"> · sin stock suficiente</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-7"
                            onClick={() => cambiarCantidad(l.productoId, l.cantidad - 1)}
                            aria-label="Restar uno"
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <Input
                            className="h-7 w-16 text-center tabular-nums"
                            value={String(l.cantidad)}
                            inputMode="decimal"
                            onChange={(e) =>
                              cambiarCantidad(l.productoId, Number(e.target.value.replace(',', '.')) || 0)
                            }
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-7"
                            onClick={() => cambiarCantidad(l.productoId, l.cantidad + 1)}
                            aria-label="Sumar uno"
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-7 w-24 text-right tabular-nums"
                          value={String(l.precioUnitario)}
                          inputMode="decimal"
                          onChange={(e) =>
                            cambiarPrecio(l.productoId, Number(e.target.value.replace(',', '.')) || 0)
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-7 w-16 text-right tabular-nums"
                          value={String(l.descuentoPorcentaje)}
                          inputMode="decimal"
                          aria-label="Descuento del renglón"
                          onChange={(e) =>
                            cambiarDescuentoLinea(
                              l.productoId,
                              Number(e.target.value.replace(',', '.')) || 0,
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatearMoneda(l.cantidad * l.precioUnitario * (1 - l.descuentoPorcentaje / 100))}
                      </td>
                      <td className="px-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => quitar(l.productoId)}
                          aria-label="Quitar"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ---------------- Panel de cobro ---------------- */}
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        <div className="rounded-lg border border-border bg-background p-3">
          <button
            type="button"
            onClick={() => setBuscadorClientes(true)}
            className="flex w-full items-center gap-2 rounded-md border border-input px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {clienteNombre ?? 'Elegí un cliente (F4)'}
            </span>
            <Badge variant="secondary" className="shrink-0">
              {letra}
            </Badge>
          </button>
          <p className="mt-1 px-1 text-xs text-muted-foreground">
            {ETIQUETA_CONDICION_IVA[condicionIvaCliente]}
          </p>

          {config.puntosVenta.length > 1 ? (
            <div className="mt-2">
              <Label className="text-xs text-muted-foreground">Punto de venta</Label>
              <Select value={puntoVentaId} onValueChange={setPuntoVentaId}>
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.puntosVenta.map((pv) => (
                    <SelectItem key={pv.id} value={pv.id}>
                      {String(pv.numero).padStart(5, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Descuento general %</Label>
            <Input
              className="h-8 w-20 text-right tabular-nums"
              value={String(descuentoGlobal)}
              inputMode="decimal"
              onChange={(e) => setDescuentoGlobal(Number(e.target.value.replace(',', '.')) || 0)}
            />
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Total a cobrar</p>
            <p className="text-3xl font-semibold tabular-nums">{formatearMoneda(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lineas.length} {lineas.length === 1 ? 'renglón' : 'renglones'} · Factura {letra}
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-3">
            <Button
              size="lg"
              className="h-12 text-base"
              disabled={lineas.length === 0 || pending || !totales}
              onClick={() => {
                setError(null);
                setCobro(true);
              }}
            >
              Cobrar (F10)
            </Button>
            <Button
              variant="ghost"
              disabled={lineas.length === 0 || pending}
              onClick={() => {
                vaciar();
                escaner.current?.focus();
              }}
            >
              <X className="size-4" />
              Vaciar carrito
            </Button>
          </div>
        </div>
      </aside>

      {/* ---------------- Buscadores ---------------- */}
      <BuscadorPos
        open={buscador}
        onOpenChange={setBuscador}
        listaPrecioId={config.listaPrecioId}
        depositoId={config.depositoId}
        modoIva={modoIva}
        onElegir={(p) => {
          agregarProducto(p);
          escaner.current?.focus();
        }}
      />

      <BuscadorClientePos
        open={buscadorClientes}
        onOpenChange={setBuscadorClientes}
        onElegir={(c) => {
          setCliente(c.id, c.razonSocial);
          setCondicionIvaCliente(c.condicionIva);
          escaner.current?.focus();
        }}
      />

      {/* ---------------- Cobro ---------------- */}
      <Dialog open={cobro} onOpenChange={setCobro}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrar {formatearMoneda(total)}</DialogTitle>
            <DialogDescription>
              Se emite una factura {letra} al contado. Una vez emitida no se edita: si hay un error,
              se anula con una nota de crédito.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="recibido">Efectivo recibido (opcional)</Label>
            <Input
              id="recibido"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              inputMode="decimal"
              className="h-11 text-right text-lg tabular-nums"
              placeholder="0,00"
            />
            {Number(recibido.replace(',', '.') || 0) > 0 ? (
              <p className="text-right text-sm">
                Vuelto: <span className="font-semibold tabular-nums">{formatearMoneda(vuelto)}</span>
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setCobro(false)} disabled={pending}>
              Volver
            </Button>
            <Button onClick={cobrar} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {error ? 'Reintentar' : 'Confirmar y emitir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BuscadorPos({
  open,
  onOpenChange,
  listaPrecioId,
  depositoId,
  modoIva,
  onElegir,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  listaPrecioId: string | null;
  depositoId: string | null;
  modoIva: 'DISCRIMINADO' | 'INCLUIDO' | 'SIN_DISCRIMINAR';
  onElegir: (p: ProductoVenta) => void;
}) {
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ProductoVenta[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || termino.trim().length < 1) {
      setResultados([]);
      return;
    }
    const id = setTimeout(() => {
      startTransition(async () =>
        setResultados(await buscarProductosVenta(termino, { listaPrecioId, depositoId, modoIva })),
      );
    }, 180);
    return () => clearTimeout(id);
  }, [termino, open, listaPrecioId, depositoId, modoIva]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput placeholder="Producto…" value={termino} onValueChange={setTermino} />
      <CommandList>
        <CommandEmpty>{pending ? 'Buscando…' : 'Sin resultados.'}</CommandEmpty>
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
                <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">
                  {p.codigo}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="shrink-0 tabular-nums">{formatearMoneda(p.precio)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

function BuscadorClientePos({
  open,
  onOpenChange,
  onElegir,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onElegir: (c: ClienteVenta) => void;
}) {
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ClienteVenta[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      startTransition(async () => setResultados(await buscarClientesVenta(termino)));
    }, 180);
    return () => clearTimeout(id);
  }, [termino, open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput placeholder="Cliente…" value={termino} onValueChange={setTermino} />
      <CommandList>
        <CommandEmpty>{pending ? 'Buscando…' : 'Sin resultados.'}</CommandEmpty>
        {resultados.length > 0 ? (
          <CommandGroup heading="Clientes">
            {resultados.map((c) => (
              <CommandItem
                key={c.id}
                value={c.id}
                onSelect={() => {
                  onElegir(c);
                  setTermino('');
                  onOpenChange(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{c.razonSocial}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {ETIQUETA_CONDICION_IVA[c.condicionIva]}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
