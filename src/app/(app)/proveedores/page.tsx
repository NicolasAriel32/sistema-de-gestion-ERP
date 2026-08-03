import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { ProveedoresTabla } from './proveedores-tabla';

export const metadata: Metadata = { title: 'Proveedores' };
const ORDENABLES = new Set(['razon_social']);

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseTablaParams(sp, { defaultSort: 'razon_social' });
  const sort = ORDENABLES.has(params.sort) ? params.sort : 'razon_social';

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  let query = supabase
    .from('proveedores')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa.empresaId);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) {
      const like = `%${termino}%`;
      query = query.or(`razon_social.ilike.${like},cuit.ilike.${like}`);
    }
  }
  if (params.estado === 'activos') query = query.eq('activo', true);
  if (params.estado === 'inactivos') query = query.eq('activo', false);

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: params.dir === 'asc' })
    .range(desde, hasta);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Proveedores</h1>
        <p className="text-sm text-muted-foreground">Quienes te venden mercadería y servicios.</p>
      </header>
      <ProveedoresTabla
        data={data ?? []}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        puedeEscribir={puedeEscribir(empresa.rol, 'proveedores')}
      />
    </div>
  );
}
