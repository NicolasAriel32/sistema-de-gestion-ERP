import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';

import { CompraEditor, type ItemPrecargado } from './compra-editor';

export const metadata: Metadata = { title: 'Cargar factura de proveedor' };

export default async function NuevaCompraPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ordenCompraId = typeof sp.orden === 'string' ? sp.orden : null;

  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'compras')) redirect('/compras');

  const supabase = await createClient();

  const { data: depositos } = await supabase
    .from('depositos')
    .select('id, nombre, es_default')
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true)
    .order('nombre');

  // Si viene desde una orden de compra, se precargan los renglones que
  // todavía están pendientes de recibir. El usuario los puede ajustar:
  // el proveedor puede haber mandado menos de lo pedido.
  let itemsPrecargados: ItemPrecargado[] = [];
  let ordenInfo: { id: string; numero: number; proveedorId: string; proveedor: string } | null =
    null;

  if (ordenCompraId) {
    const [{ data: orden }, { data: pendientes }] = await Promise.all([
      supabase
        .from('ordenes_compra')
        .select('id, numero, proveedor_id, deposito_id, proveedores(razon_social)')
        .eq('id', ordenCompraId)
        .eq('empresa_id', empresa.empresaId)
        .maybeSingle(),
      supabase.rpc('pendiente_orden_compra', { p_orden_compra_id: ordenCompraId }),
    ]);

    if (orden) {
      const prov = Array.isArray(orden.proveedores) ? orden.proveedores[0] : orden.proveedores;
      ordenInfo = {
        id: orden.id,
        numero: orden.numero,
        proveedorId: orden.proveedor_id,
        proveedor: prov?.razon_social ?? '—',
      };
      itemsPrecargados = (pendientes ?? []).map((p) => ({
        productoId: p.producto_id,
        descripcion: p.descripcion,
        cantidad: Number(p.pendiente),
        precioUnitario: Number(p.precio_unitario),
        alicuotaIva: Number(p.alicuota_iva),
      }));
    }
  }

  const depositoPorDefecto =
    depositos?.find((d) => d.es_default)?.id ?? depositos?.[0]?.id ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/compras">
            <ArrowLeft />
            Volver a compras
          </Link>
        </Button>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">Cargar factura de proveedor</h1>
        <p className="text-sm text-muted-foreground">
          Transcribí el comprobante tal como figura en el papel. Al guardar, la mercadería ingresa
          al depósito y el costo de los productos se actualiza al de esta compra.
        </p>
      </header>

      <CompraEditor
        depositos={depositos ?? []}
        depositoPorDefecto={depositoPorDefecto}
        ordenInfo={ordenInfo}
        itemsPrecargados={itemsPrecargados}
      />
    </div>
  );
}
