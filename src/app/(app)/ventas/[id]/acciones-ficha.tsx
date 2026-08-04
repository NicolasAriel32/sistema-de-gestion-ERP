'use client';

import { Ban, Download, FileText, Loader2, Pencil, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CONVERSIONES, ETIQUETA_TIPO } from '@/lib/domain/comprobantes/etiquetas';
import { esFactura, esNoFiscal } from '@/lib/domain/comprobantes/letra';
import type { EstadoComprobante, TipoComprobante } from '@/lib/supabase/database.types';

import { anularConNotaCredito, emitirBorrador } from '../actions';

export function AccionesFicha({
  comprobanteId,
  tipo,
  estado,
  puedeEscribir,
  puedeForzarCredito,
}: {
  comprobanteId: string;
  tipo: TipoComprobante;
  estado: EstadoComprobante;
  puedeEscribir: boolean;
  puedeForzarCredito: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [anularAbierto, setAnularAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [errorEmitir, setErrorEmitir] = useState<string | null>(null);
  const [excedeCredito, setExcedeCredito] = useState(false);

  const esBorrador = estado === 'BORRADOR';
  const emitido = ['EMITIDO', 'PARCIAL', 'PAGADO'].includes(estado);
  const anulable = esFactura(tipo) && emitido;
  const conversiones = emitido && esNoFiscal(tipo) ? (CONVERSIONES[tipo] ?? []) : [];

  function emitir(forzarCredito: boolean) {
    startTransition(async () => {
      const res = await emitirBorrador(comprobanteId, forzarCredito);
      if ('error' in res) {
        setErrorEmitir(res.error);
        setExcedeCredito(res.error.includes('límite de crédito'));
        toast.error(res.error);
        return;
      }
      toast.success(`Emitido N° ${res.numero}`);
      setErrorEmitir(null);
      router.refresh();
    });
  }

  function anular() {
    setErrorAnular(null);
    startTransition(async () => {
      const res = await anularConNotaCredito(comprobanteId, motivo);
      if ('error' in res) {
        setErrorAnular(res.error);
        return;
      }
      toast.success(`Nota de crédito emitida N° ${res.numero}`);
      setAnularAbierto(false);
      setMotivo('');
      router.push(`/ventas/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {emitido ? (
        <Button variant="outline" size="sm" asChild>
          <a href={`/ventas/${comprobanteId}/pdf`} target="_blank" rel="noopener noreferrer">
            <Download className="size-4" />
            PDF
          </a>
        </Button>
      ) : null}

      {conversiones.map((c) => (
        <Button key={c.destino} variant="outline" size="sm" asChild>
          <Link href={`/ventas/nuevo?desde=${comprobanteId}&clase=${c.destino}`}>
            <FileText className="size-4" />
            {c.etiqueta}
          </Link>
        </Button>
      ))}

      {esBorrador && puedeEscribir ? (
        <>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/ventas/nuevo?editar=${comprobanteId}`}>
              <Pencil className="size-4" />
              Editar
            </Link>
          </Button>
          <Button size="sm" onClick={() => emitir(false)} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {errorEmitir ? 'Reintentar emisión' : 'Emitir'}
          </Button>
          {excedeCredito && puedeForzarCredito ? (
            <Button variant="destructive" size="sm" onClick={() => emitir(true)} disabled={pending}>
              Emitir excediendo el crédito
            </Button>
          ) : null}
        </>
      ) : null}

      {anulable && puedeEscribir ? (
        <Button variant="outline" size="sm" onClick={() => setAnularAbierto(true)}>
          <Ban className="size-4" />
          Anular con NC
        </Button>
      ) : null}

      <Dialog open={anularAbierto} onOpenChange={setAnularAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular {ETIQUETA_TIPO[tipo]}</DialogTitle>
            <DialogDescription>
              La factura no se borra ni se edita: se emite una nota de crédito por el total, que
              revierte el stock y la cuenta corriente. La factura original queda intacta y visible.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motivo">Motivo de la anulación</Label>
            <Textarea
              id="motivo"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: error en el precio unitario acordado con el cliente"
            />
          </div>

          {errorAnular ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorAnular}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAnularAbierto(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={anular}
              disabled={pending || motivo.trim().length < 3}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Emitir nota de crédito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
