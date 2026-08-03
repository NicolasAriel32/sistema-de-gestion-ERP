import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { PuntosVentaTabla } from './puntos-venta-tabla';

export const metadata: Metadata = { title: 'Puntos de venta' };
const ORDENABLES = new Set(['numero']);

export default async function PuntosVentaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseTablaParams(sp, { defaultSort: 'numero' });
  const sort = ORDENABLES.has(params.sort) ? params.sort : 'numero';

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  let query = supabase
    .from('puntos_venta')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa.empresaId);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) query = query.ilike('descripcion', `%${termino}%`);
  }
  if (params.estado === 'activos') query = query.eq('activo', true);
  if (params.estado === 'inactivos') query = query.eq('activo', false);

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: params.dir === 'asc' })
    .range(desde, hasta);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Puntos de venta</h1>
        <p className="text-sm text-muted-foreground">
          Talonarios de emisión. La numeración de comprobantes se lleva por punto de venta.
        </p>
      </header>
      <PuntosVentaTabla
        data={data ?? []}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        puedeEscribir={puedeEscribir(empresa.rol, 'puntos_venta')}
      />
    </div>
  );
}
