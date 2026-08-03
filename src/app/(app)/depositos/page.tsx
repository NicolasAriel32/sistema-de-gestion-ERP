import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { DepositosTabla } from './depositos-tabla';

export const metadata: Metadata = { title: 'Depósitos' };
const ORDENABLES = new Set(['nombre']);

export default async function DepositosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseTablaParams(sp, { defaultSort: 'nombre' });
  const sort = ORDENABLES.has(params.sort) ? params.sort : 'nombre';

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  let query = supabase
    .from('depositos')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa.empresaId);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) {
      const like = `%${termino}%`;
      query = query.or(`nombre.ilike.${like},direccion.ilike.${like}`);
    }
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
        <h1 className="text-xl font-semibold tracking-tight">Depósitos</h1>
        <p className="text-sm text-muted-foreground">Ubicaciones físicas donde se controla el stock.</p>
      </header>
      <DepositosTabla
        data={data ?? []}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        puedeEscribir={puedeEscribir(empresa.rol, 'depositos')}
      />
    </div>
  );
}
