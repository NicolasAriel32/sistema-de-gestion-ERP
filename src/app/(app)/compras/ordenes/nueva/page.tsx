import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';

import { OrdenCompraEditor } from './orden-editor';

export const metadata: Metadata = { title: 'Nueva orden de compra' };

export default async function NuevaOrdenCompraPage() {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'ordenes_compra')) redirect('/compras/ordenes');

  const supabase = await createClient();
  const { data: depositos } = await supabase
    .from('depositos')
    .select('id, nombre, es_default')
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true)
    .order('nombre');

  const depositoPorDefecto =
    depositos?.find((d) => d.es_default)?.id ?? depositos?.[0]?.id ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/compras/ordenes">
            <ArrowLeft />
            Volver a órdenes
          </Link>
        </Button>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">Nueva orden de compra</h1>
        <p className="text-sm text-muted-foreground">
          Lo que se le pide al proveedor. No mueve stock ni genera deuda hasta que llegue la
          factura.
        </p>
      </header>

      <OrdenCompraEditor depositos={depositos ?? []} depositoPorDefecto={depositoPorDefecto} />
    </div>
  );
}
