import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import type { CondicionIva } from '@/lib/supabase/database.types';

import { PosPantalla, type ConfigPos } from './pos-pantalla';

export const metadata: Metadata = { title: 'Punto de venta' };

export default async function PosPage() {
  const { empresa } = await requireEmpresa();
  if (!puedeEscribir(empresa.rol, 'comprobantes')) notFound();

  const supabase = await createClient();

  const [{ data: emp }, { data: puntosVenta }, { data: depositos }, { data: listas }] =
    await Promise.all([
      supabase.from('empresas').select('condicion_iva').eq('id', empresa.empresaId).single(),
      supabase
        .from('puntos_venta')
        .select('id, numero, descripcion')
        .eq('empresa_id', empresa.empresaId)
        .eq('activo', true)
        .order('numero'),
      supabase
        .from('depositos')
        .select('id, es_default')
        .eq('empresa_id', empresa.empresaId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('listas_precios')
        .select('id, es_default')
        .eq('empresa_id', empresa.empresaId)
        .eq('activa', true)
        .order('nombre'),
    ]);

  if (!emp) notFound();

  // Cliente por defecto del mostrador: el consumidor final del catálogo.
  const { data: cf } = await supabase
    .from('clientes')
    .select('id, razon_social, condicion_iva')
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true)
    .eq('condicion_iva', 'CONSUMIDOR_FINAL')
    .order('razon_social')
    .limit(1)
    .maybeSingle();

  const config: ConfigPos = {
    puntosVenta: (puntosVenta ?? []).map((p) => ({
      id: p.id,
      numero: p.numero,
      descripcion: p.descripcion,
    })),
    depositoId: (depositos ?? []).find((d) => d.es_default)?.id ?? depositos?.[0]?.id ?? null,
    listaPrecioId: (listas ?? []).find((l) => l.es_default)?.id ?? listas?.[0]?.id ?? null,
    condicionIvaEmisor: emp.condicion_iva,
    consumidorFinal: cf
      ? {
          id: cf.id,
          razonSocial: cf.razon_social,
          condicionIva: cf.condicion_iva as CondicionIva,
        }
      : null,
  };

  if (config.puntosVenta.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-border bg-background p-6 text-center">
        <h1 className="text-base font-semibold">Falta un punto de venta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El mostrador necesita al menos un punto de venta activo. Creá uno en Catálogos → Puntos de
          venta.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Punto de venta</h1>
        <p className="text-sm text-muted-foreground">
          F2 buscar · F4 cliente · F10 cobrar · Esc volver al lector
        </p>
      </header>

      <PosPantalla config={config} />
    </div>
  );
}
