'use client';

import { Ban } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatearMoneda } from '@/lib/format';
import { esError } from '@/lib/forms/resultado';

import { anularCompra } from '../actions';

export function AnularCompra({ compraId, total }: { compraId: string; total: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const res = await anularCompra({ compraId, motivo });
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success('Compra anulada. El stock y la cuenta corriente se revirtieron.');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setMotivo('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Ban />
          Anular
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular la factura de proveedor</DialogTitle>
          <DialogDescription>
            Se devuelve al proveedor la mercadería que había ingresado ({formatearMoneda(total)}) y
            se contra-asienta la cuenta corriente. La factura no se borra: queda con estado anulada
            y con el motivo registrado.
            <br />
            <br />
            Si parte de esa mercadería ya se vendió, la anulación se va a rechazar: en ese caso
            corresponde una nota de crédito del proveedor, no una anulación.
            <br />
            <br />
            El costo de los productos NO vuelve atrás. Si esta compra actualizó el costo,
            revisalo a mano.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="motivo-anulacion">Motivo</Label>
          <Textarea
            id="motivo-anulacion"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cargada por error, mercadería devuelta al proveedor…"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || motivo.trim().length < 3}
            onClick={confirmar}
          >
            {pending ? 'Anulando…' : 'Anular factura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
