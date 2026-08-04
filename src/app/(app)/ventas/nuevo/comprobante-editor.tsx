'use client';

import { AlertTriangle, Loader2, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { calcularTotales } from '@/lib/domain/comprobantes/calculo';
import { CLASES_EMISION } from '@/lib/domain/comprobantes/etiquetas';
import { determinarLetra, modoIvaDeLetra } from '@/lib/domain/comprobantes/letra';
import type { ComprobanteInput } from '@/lib/domain/comprobantes/schema';
import { ETIQUETA_CONDICION_IVA } from '@/lib/domain/opciones';
import { formatearCuit } from '@/lib/domain/fiscal/cuit';
import { sumarDiasIso } from '@/lib/fechas';
import { formatearMoneda, formatearNumero } from '@/lib/format';
import type { CondicionIvaEmisor } from '@/lib/supabase/database.types';

import {
  buscarClientesVenta,
  buscarProductosVenta,
  guardarBorrador,
  guardarYEmitir,
  type ClienteVenta,
  type ProductoVenta,
} from '../actions';

// ---------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------

export type Renglon = {
  /** Clave estable de React: los índices se reordenan al borrar. */
  key: string;
  productoId: string | null;
  codigo: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  descuentoPorcentaje: string;
  alicuotaIva: number;
  saldo: number | null;
  manejaStock: boolean;
  permiteVentaSinStock: boolean;
};

export type Catalogos = {
  puntosVenta: { id: string; numero: number; descripcion: string | null }[];
  depositos: { id: string; nombre: string; esDefault: boolean }[];
  listasPrecios: { id: string; nombre: string; esDefault: boolean }[];
};

export type BorradorInicial = {
  id: string | null;
  clase: ComprobanteInput['clase'];
  cliente: ClienteVenta | null;
  puntoVentaId: string;
  depositoId: string | null;
  listaPrecioId: string | null;
  condicionVenta: 'CONTADO' | 'CUENTA_CORRIENTE';
  fechaEmision: string;
  fechaVencimiento: string;
  descuentoPorcentaje: string;
  observaciones: string;
  comprobanteOrigenId: string | null;
  renglones: Renglon[];
};

let contador = 0;
function nuevaKey(): string {
  contador += 1;
  return `r${contador}`;
}

export function renglonVacio(): Renglon {
  return {
    key: nuevaKey(),
    productoId: null,
    codigo: '',
    descripcion: '',
    cantidad: '1',
    precioUnitario: '0',
    descuentoPorcentaje: '0',
    alicuotaIva: 21,
    saldo: null,
    manejaStock: false,
    permiteVentaSinStock: true,
  };
}

const numero = (v: string): number => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------

export function ComprobanteEditor({
  catalogos,
  condicionIvaEmisor,
  inicial,
  puedeForzarCredito,
  origen,
}: {
  catalogos: Catalogos;
  condicionIvaEmisor: CondicionIvaEmisor;
  inicial: BorradorInicial;
  puedeForzarCredito: boolean;
  origen: { id: string; descripcion: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [clase, setClase] = useState(inicial.clase);
  const [cliente, setCliente] = useState<ClienteVenta | null>(inicial.cliente);
  const [puntoVentaId, setPuntoVentaId] = useState(inicial.puntoVentaId);
  const [depositoId, setDepositoId] = useState(inicial.depositoId);
  const [listaPrecioId, setListaPrecioId] = useState(inicial.listaPrecioId);
  const [condicionVenta, setCondicionVenta] = useState(inicial.condicionVenta);
  const [fechaEmision, setFechaEmision] = useState(inicial.fechaEmision);
  const [fechaVencimiento, setFechaVencimiento] = useState(inicial.fechaVencimiento);
  const [descuentoGlobal, setDescuentoGlobal] = useState(inicial.descuentoPorcentaje);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [renglones, setRenglones] = useState<Renglon[]>(
    inicial.renglones.length > 0 ? inicial.renglones : [renglonVacio()],
  );

  const [buscadorProductos, setBuscadorProductos] = useState(false);
  const [buscadorClientes, setBuscadorClientes] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [errorEmision, setErrorEmision] = useState<string | null>(null);
  const [excedeCredito, setExcedeCredito] = useState(false);

  // La letra no se elige: se deriva. Mostrarla es informativo.
  const letra = cliente ? determinarLetra(condicionIvaEmisor, cliente.condicionIva) : null;
  const modoIva = letra ? modoIvaDeLetra(letra) : 'INCLUIDO';
  const esFiscal = clase === 'FACTURA';
  const modoEfectivo = esFiscal ? modoIva : 'INCLUIDO';

  const totales = useMemo(() => {
    try {
      return calcularTotales(
        renglones
          .filter((r) => r.descripcion.trim().length > 0)
          .map((r) => ({
            cantidad: numero(r.cantidad),
            precioUnitario: numero(r.precioUnitario),
            descuentoPorcentaje: numero(r.descuentoPorcentaje),
            alicuotaIva: r.alicuotaIva,
          })),
        { modoIva: modoEfectivo, descuentoPorcentaje: numero(descuentoGlobal) },
      );
    } catch {
      return null;
    }
  }, [renglones, modoEfectivo, descuentoGlobal]);

  // Vencimiento sugerido según los días de crédito del cliente.
  useEffect(() => {
    if (condicionVenta !== 'CUENTA_CORRIENTE') return;
    if (fechaVencimiento !== '') return;
    const dias = cliente?.diasCredito ?? 30;
    setFechaVencimiento(sumarDiasIso(fechaEmision, dias > 0 ? dias : 30));
  }, [condicionVenta, cliente, fechaEmision, fechaVencimiento]);

  function actualizar(key: string, cambios: Partial<Renglon>) {
    setRenglones((prev) => prev.map((r) => (r.key === key ? { ...r, ...cambios } : r)));
  }

  function quitar(key: string) {
    setRenglones((prev) => (prev.length === 1 ? [renglonVacio()] : prev.filter((r) => r.key !== key)));
  }

  const agregarProducto = useCallback(
    (p: ProductoVenta) => {
      setRenglones((prev) => {
        const existente = prev.find((r) => r.productoId === p.id);
        if (existente) {
          return prev.map((r) =>
            r.key === existente.key
              ? { ...r, cantidad: String(numero(r.cantidad) + 1) }
              : r,
          );
        }
        const nuevo: Renglon = {
          key: nuevaKey(),
          productoId: p.id,
          codigo: p.codigo,
          descripcion: p.nombre,
          cantidad: '1',
          precioUnitario: String(p.precio),
          descuentoPorcentaje: '0',
          alicuotaIva: p.alicuotaIva,
          saldo: p.saldo,
          manejaStock: p.manejaStock,
          permiteVentaSinStock: p.permiteVentaSinStock,
        };
        const vacios = prev.filter((r) => r.descripcion.trim() === '' && r.productoId === null);
        const conDatos = prev.filter((r) => !vacios.includes(r));
        return [...conDatos, nuevo];
      });
    },
    [],
  );

  // ---------------- Atajos de teclado ----------------
  // El mostrador se opera sin mouse. F2 producto, F4 cliente, F10 emitir.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        setBuscadorProductos(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        setBuscadorClientes(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        intentarEmitir();
      } else if (e.key === 'Escape') {
        if (!buscadorProductos && !buscadorClientes && !confirmar) {
          router.push('/ventas');
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscadorProductos, buscadorClientes, confirmar, renglones, cliente, clase]);

  function construirInput(): ComprobanteInput | null {
    if (!cliente) {
      toast.error('Elegí un cliente (F4).');
      return null;
    }
    const items = renglones
      .filter((r) => r.descripcion.trim().length > 0 && numero(r.cantidad) > 0)
      .map((r) => ({
        productoId: r.productoId,
        descripcion: r.descripcion.trim(),
        cantidad: numero(r.cantidad),
        precioUnitario: numero(r.precioUnitario),
        descuentoPorcentaje: numero(r.descuentoPorcentaje),
        alicuotaIva: r.alicuotaIva,
      }));

    if (items.length === 0) {
      toast.error('Agregá al menos un renglón (F2).');
      return null;
    }

    return {
      clase,
      puntoVentaId,
      clienteId: cliente.id,
      depositoId,
      listaPrecioId,
      vendedorId: null,
      fechaEmision,
      fechaVencimiento: condicionVenta === 'CUENTA_CORRIENTE' ? fechaVencimiento : '',
      condicionVenta,
      descuentoPorcentaje: numero(descuentoGlobal),
      comprobanteOrigenId: inicial.comprobanteOrigenId,
      observaciones,
      items,
    };
  }

  function intentarEmitir() {
    const input = construirInput();
    if (!input) return;
    setErrorEmision(null);
    setExcedeCredito(false);
    setConfirmar(true);
  }

  function emitir(forzarCredito: boolean) {
    const input = construirInput();
    if (!input) return;

    startTransition(async () => {
      const res = await guardarYEmitir(input, {
        comprobanteId: inicial.id ?? undefined,
        forzarCredito,
      });

      if ('error' in res) {
        setErrorEmision(res.error);
        setExcedeCredito(res.error.includes('límite de crédito'));
        return;
      }

      toast.success(`Comprobante emitido N° ${res.numero}`);
      setConfirmar(false);
      router.push(`/ventas/${res.id}`);
      router.refresh();
    });
  }

  function guardar() {
    const input = construirInput();
    if (!input) return;

    startTransition(async () => {
      const res = await guardarBorrador(input, inicial.id ?? undefined);
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      toast.success('Borrador guardado');
      router.push(`/ventas/${res.id}`);
      router.refresh();
    });
  }

  const sinStock = renglones.filter(
    (r) =>
      r.manejaStock &&
      !r.permiteVentaSinStock &&
      r.saldo !== null &&
      numero(r.cantidad) > r.saldo &&
      esFiscal,
  );

  return (
    <div className="flex flex-col gap-4">
      {origen ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          Generado a partir de <span className="font-medium">{origen.descripcion}</span>. Se conserva
          la trazabilidad con el comprobante de origen.
        </div>
      ) : null}

      {/* ---------------- Cabecera ---------------- */}
      <div className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label className="text-xs text-muted-foreground">Cliente · F4</Label>
          <button
            type="button"
            onClick={() => setBuscadorClientes(true)}
            className="mt-1 flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm hover:bg-accent"
          >
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            {cliente ? (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-medium">{cliente.razonSocial}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {ETIQUETA_CONDICION_IVA[cliente.condicionIva]}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Elegí un cliente…</span>
            )}
            {letra && esFiscal ? (
              <Badge variant="secondary" className="ml-auto shrink-0">
                Factura {letra}
              </Badge>
            ) : null}
          </button>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Comprobante</Label>
          <Select value={clase} onValueChange={(v) => setClase(v as typeof clase)}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLASES_EMISION.map((c) => (
                <SelectItem key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Punto de venta</Label>
          <Select value={puntoVentaId} onValueChange={setPuntoVentaId}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalogos.puntosVenta.map((pv) => (
                <SelectItem key={pv.id} value={pv.id}>
                  {String(pv.numero).padStart(5, '0')}
                  {pv.descripcion ? ` · ${pv.descripcion}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Fecha</Label>
          <Input
            type="date"
            className="mt-1 h-9"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Condición de venta</Label>
          <Select
            value={condicionVenta}
            onValueChange={(v) => setCondicionVenta(v as typeof condicionVenta)}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CONTADO">Contado</SelectItem>
              <SelectItem value="CUENTA_CORRIENTE">Cuenta corriente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {condicionVenta === 'CUENTA_CORRIENTE' ? (
          <div>
            <Label className="text-xs text-muted-foreground">Vencimiento</Label>
            <Input
              type="date"
              className="mt-1 h-9"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
            />
          </div>
        ) : null}

        <div>
          <Label className="text-xs text-muted-foreground">Depósito</Label>
          <Select value={depositoId ?? ''} onValueChange={(v) => setDepositoId(v)}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Sin depósito" />
            </SelectTrigger>
            <SelectContent>
              {catalogos.depositos.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Lista de precios</Label>
          <Select value={listaPrecioId ?? ''} onValueChange={(v) => setListaPrecioId(v)}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue placeholder="Sin lista" />
            </SelectTrigger>
            <SelectContent>
              {catalogos.listasPrecios.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ---------------- Renglones ---------------- */}
      <div className="rounded-lg border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Renglones</span>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {esFiscal && letra === 'A'
                ? 'Precios NETOS (el IVA se discrimina)'
                : 'Precios FINALES (IVA incluido)'}
            </span>
            <Button size="sm" variant="outline" onClick={() => setBuscadorProductos(true)}>
              <Search className="size-4" />
              Buscar producto (F2)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRenglones((p) => [...p, renglonVacio()])}>
              <Plus className="size-4" />
              Renglón libre
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Código</th>
                <th className="px-2 py-1.5 text-left font-medium">Descripción</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">Cantidad</th>
                <th className="w-28 px-2 py-1.5 text-right font-medium">Precio</th>
                <th className="w-20 px-2 py-1.5 text-right font-medium">Desc. %</th>
                <th className="w-20 px-2 py-1.5 text-right font-medium">IVA</th>
                <th className="w-28 px-2 py-1.5 text-right font-medium">Subtotal</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {renglones.map((r, i) => {
                const calculado = totales?.items[i];
                const faltante =
                  r.manejaStock && !r.permiteVentaSinStock && r.saldo !== null && esFiscal
                    ? numero(r.cantidad) > r.saldo
                    : false;

                return (
                  <tr key={r.key} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-1">
                      <span className="text-xs text-muted-foreground">{r.codigo || '—'}</span>
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8 border-0 px-1 shadow-none focus-visible:ring-1"
                        value={r.descripcion}
                        placeholder="Descripción del renglón"
                        onChange={(e) => actualizar(r.key, { descripcion: e.target.value })}
                      />
                      {r.saldo !== null ? (
                        <span
                          className={
                            faltante
                              ? 'px-1 text-xs text-destructive'
                              : 'px-1 text-xs text-muted-foreground'
                          }
                        >
                          Stock: {formatearNumero(r.saldo)}
                          {faltante ? ' · insuficiente' : ''}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8 border-0 px-1 text-right tabular-nums shadow-none focus-visible:ring-1"
                        value={r.cantidad}
                        inputMode="decimal"
                        onChange={(e) => actualizar(r.key, { cantidad: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8 border-0 px-1 text-right tabular-nums shadow-none focus-visible:ring-1"
                        value={r.precioUnitario}
                        inputMode="decimal"
                        onChange={(e) => actualizar(r.key, { precioUnitario: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        className="h-8 border-0 px-1 text-right tabular-nums shadow-none focus-visible:ring-1"
                        value={r.descuentoPorcentaje}
                        inputMode="decimal"
                        onChange={(e) => actualizar(r.key, { descuentoPorcentaje: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={String(r.alicuotaIva)}
                        onValueChange={(v) => actualizar(r.key, { alicuotaIva: Number(v) })}
                      >
                        <SelectTrigger className="h-8 border-0 px-1 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0, 10.5, 21, 27].map((a) => (
                            <SelectItem key={a} value={String(a)}>
                              {a}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatearMoneda(calculado?.subtotal ?? 0)}
                    </td>
                    <td className="px-2 py-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => quitar(r.key)}
                        aria-label="Quitar renglón"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- Pie ---------------- */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Observaciones</Label>
          <Textarea
            rows={4}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Texto que se imprime al pie del comprobante"
          />
        </div>

        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3 pb-2">
            <Label className="text-xs text-muted-foreground">Descuento general %</Label>
            <Input
              className="h-8 w-24 text-right tabular-nums"
              value={descuentoGlobal}
              inputMode="decimal"
              onChange={(e) => setDescuentoGlobal(e.target.value)}
            />
          </div>

          {totales ? (
            <dl className="flex flex-col gap-1 border-t border-border pt-2 text-sm tabular-nums">
              {esFiscal && letra !== 'C' ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Neto gravado</dt>
                    <dd>{formatearMoneda(totales.netoGravado)}</dd>
                  </div>
                  {totales.iva105 > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">IVA 10,5%</dt>
                      <dd>{formatearMoneda(totales.iva105)}</dd>
                    </div>
                  ) : null}
                  {totales.iva21 > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">IVA 21%</dt>
                      <dd>{formatearMoneda(totales.iva21)}</dd>
                    </div>
                  ) : null}
                  {totales.iva27 > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">IVA 27%</dt>
                      <dd>{formatearMoneda(totales.iva27)}</dd>
                    </div>
                  ) : null}
                </>
              ) : null}
              {totales.descuentoImporte > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Descuento general</dt>
                  <dd>− {formatearMoneda(totales.descuentoImporte)}</dd>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatearMoneda(totales.total)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-destructive">
              Hay un dato inválido en algún renglón: revisá cantidades, precios y descuentos.
            </p>
          )}

          {sinStock.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {sinStock.length === 1
                ? 'Un renglón supera el stock disponible y la emisión se va a bloquear.'
                : `${sinStock.length} renglones superan el stock disponible y la emisión se va a bloquear.`}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={intentarEmitir} disabled={pending || !totales}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Emitir (F10)
            </Button>
            <Button variant="outline" onClick={guardar} disabled={pending || !totales}>
              Guardar borrador
            </Button>
            <Button variant="ghost" onClick={() => router.push('/ventas')} disabled={pending}>
              Cancelar (Esc)
            </Button>
          </div>
        </div>
      </div>

      <BuscadorProductos
        open={buscadorProductos}
        onOpenChange={setBuscadorProductos}
        listaPrecioId={listaPrecioId}
        depositoId={depositoId}
        modoIva={modoEfectivo}
        onElegir={agregarProducto}
      />

      <BuscadorClientes
        open={buscadorClientes}
        onOpenChange={setBuscadorClientes}
        onElegir={(c) => {
          setCliente(c);
          if (c.listaPrecioId) setListaPrecioId(c.listaPrecioId);
        }}
      />

      <ConfirmacionEmision
        open={confirmar}
        onOpenChange={setConfirmar}
        pending={pending}
        clase={clase}
        letra={letra}
        cliente={cliente}
        total={totales?.total ?? 0}
        error={errorEmision}
        excedeCredito={excedeCredito}
        puedeForzarCredito={puedeForzarCredito}
        onConfirmar={emitir}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Buscadores
// ---------------------------------------------------------------------

function BuscadorProductos({
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
  const ultimaBusqueda = useRef('');

  useEffect(() => {
    if (!open) return;
    const t = termino.trim();
    if (t.length < 1) {
      setResultados([]);
      return;
    }
    const id = setTimeout(() => {
      ultimaBusqueda.current = t;
      startTransition(async () => {
        const r = await buscarProductosVenta(t, { listaPrecioId, depositoId, modoIva });
        if (ultimaBusqueda.current === t) setResultados(r);
      });
    }, 200);
    return () => clearTimeout(id);
  }, [termino, open, listaPrecioId, depositoId, modoIva]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Código, nombre o código de barras…"
        value={termino}
        onValueChange={setTermino}
      />
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
                <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                  {p.codigo}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                {p.saldo !== null ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    stock {formatearNumero(p.saldo)}
                  </span>
                ) : null}
                <span className="shrink-0 tabular-nums">{formatearMoneda(p.precio)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

function BuscadorClientes({
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
    }, 200);
    return () => clearTimeout(id);
  }, [termino, open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Razón social, nombre de fantasía o CUIT…"
        value={termino}
        onValueChange={setTermino}
      />
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
                  {c.documento ? formatearCuit(c.documento) : '—'}
                </span>
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

// ---------------------------------------------------------------------
// Confirmación: emitir es irreversible.
// ---------------------------------------------------------------------

function ConfirmacionEmision({
  open,
  onOpenChange,
  pending,
  clase,
  letra,
  cliente,
  total,
  error,
  excedeCredito,
  puedeForzarCredito,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  clase: string;
  letra: string | null;
  cliente: ClienteVenta | null;
  total: number;
  error: string | null;
  excedeCredito: boolean;
  puedeForzarCredito: boolean;
  onConfirmar: (forzar: boolean) => void;
}) {
  const nombre =
    clase === 'FACTURA' ? `Factura ${letra ?? ''}`.trim() : clase.charAt(0) + clase.slice(1).toLowerCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar emisión</DialogTitle>
          <DialogDescription>
            Un comprobante emitido no se edita ni se borra: si hay un error, se anula con una nota de
            crédito.
          </DialogDescription>
        </DialogHeader>

        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Comprobante</dt>
            <dd className="font-medium">{nombre}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="max-w-[60%] truncate font-medium">{cliente?.razonSocial ?? '—'}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatearMoneda(total)}</dd>
          </div>
        </dl>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Volver
          </Button>
          {excedeCredito && puedeForzarCredito ? (
            <Button variant="destructive" onClick={() => onConfirmar(true)} disabled={pending}>
              Emitir igual (excede el crédito)
            </Button>
          ) : null}
          <Button onClick={() => onConfirmar(false)} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {error ? 'Reintentar' : 'Emitir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
