'use client';

import { Download } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ETIQUETA_MOVIMIENTO } from '@/lib/domain/stock/schema';
import type { RenglonKardex } from '@/lib/domain/stock/kardex';
import { formatearMoneda, formatearNumero } from '@/lib/format';

type Deposito = { id: string; nombre: string };

const TODOS = '__todos__';

/** Movimientos que suman existencias, para colorear la fila. */
const ES_ENTRADA = new Set([
  'INICIAL',
  'COMPRA',
  'DEVOLUCION_CLIENTE',
  'TRANSFERENCIA_ENTRADA',
]);

function formatearFechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));
}

function descargarCsv(renglones: readonly RenglonKardex[], productoId: string): void {
  const headers = [
    'Fecha',
    'Tipo',
    'Depósito',
    'Comprobante',
    'Motivo',
    'Entrada',
    'Salida',
    'Saldo',
    'Costo unitario',
  ];

  const escapar = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const filas = renglones.map((r) => [
    formatearFechaHora(r.fecha),
    ETIQUETA_MOVIMIENTO[r.tipo] ?? r.tipo,
    r.depositoNombre,
    r.comprobante ?? '',
    r.motivo ?? '',
    r.entrada || '',
    r.salida || '',
    r.saldo,
    r.costoUnitario,
  ]);

  const csv = [headers, ...filas].map((f) => f.map(escapar).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kardex-${productoId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function KardexTabla({
  productoId,
  unidadMedida,
  renglones,
  depositos,
  depositoFiltro,
  desde,
  hasta,
  puedeMover,
}: {
  productoId: string;
  unidadMedida: string;
  renglones: RenglonKardex[];
  depositos: Deposito[];
  depositoFiltro: string;
  desde: string;
  hasta: string;
  puedeMover: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navegar = useCallback(
    (cambios: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === '') params.delete(clave);
        else params.set(clave, valor);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={depositoFiltro || TODOS}
          onValueChange={(v) => navegar({ deposito: v === TODOS ? null : v })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Depósito" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los depósitos</SelectItem>
            {depositos.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={desde}
          onChange={(e) => navegar({ desde: e.target.value })}
          className="w-[150px]"
          aria-label="Desde"
        />
        <Input
          type="date"
          value={hasta}
          onChange={(e) => navegar({ hasta: e.target.value })}
          className="w-[150px]"
          aria-label="Hasta"
        />

        {desde || hasta || depositoFiltro ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navegar({ desde: null, hasta: null, deposito: null })}
          >
            Limpiar
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {renglones.length} movimiento{renglones.length === 1 ? '' : 's'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => descargarCsv(renglones, productoId)}
            disabled={renglones.length === 0}
          >
            <Download />
            CSV
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Fecha</TableHead>
              <TableHead className="w-[170px]">Movimiento</TableHead>
              <TableHead>Depósito</TableHead>
              <TableHead>Origen / motivo</TableHead>
              <TableHead className="w-[100px] text-right">Entrada</TableHead>
              <TableHead className="w-[100px] text-right">Salida</TableHead>
              <TableHead className="w-[110px] text-right">Saldo</TableHead>
              <TableHead className="w-[110px] text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renglones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                  <p>Este producto no tiene movimientos en el período elegido.</p>
                  {puedeMover ? (
                    <p className="mt-1">
                      Podés cargar existencias con un ajuste manual desde{' '}
                      <Link href="/stock" className="underline">
                        la pantalla de stock
                      </Link>
                      .
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            ) : (
              renglones.map((r) => (
                <TableRow key={r.movimientoId}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatearFechaHora(r.fecha)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ES_ENTRADA.has(r.tipo) ? 'success' : 'muted'}>
                      {ETIQUETA_MOVIMIENTO[r.tipo] ?? r.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.depositoNombre}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm" title={r.motivo ?? ''}>
                    {r.comprobanteId ? (
                      <Link
                        href={`/ventas/${r.comprobanteId}`}
                        className="text-foreground underline-offset-2 hover:underline"
                      >
                        {r.comprobante}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{r.motivo ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[var(--success)]">
                    {r.entrada ? formatearNumero(r.entrada) : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {r.salida ? formatearNumero(r.salida) : ''}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatearNumero(r.saldo)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatearMoneda(r.costoUnitario)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {renglones.length > 0 ? (
        <p className="text-right text-sm text-muted-foreground">
          Saldo final:{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {formatearNumero(renglones.at(-1)?.saldo ?? 0)} {unidadMedida.toLowerCase()}
          </span>
        </p>
      ) : null}
    </div>
  );
}
