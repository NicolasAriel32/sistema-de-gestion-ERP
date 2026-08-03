import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { CategoriasTabla } from './categorias-tabla';

export const metadata: Metadata = { title: 'Categorías' };
const ORDENABLES = new Set(['nombre']);

export default async function CategoriasPage({
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
    .from('categorias')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa.empresaId);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) query = query.ilike('nombre', `%${termino}%`);
  }
  if (params.estado === 'activos') query = query.eq('activa', true);
  if (params.estado === 'inactivos') query = query.eq('activa', false);

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: params.dir === 'asc' })
    .range(desde, hasta);

  const { data: opciones } = await supabase
    .from('categorias')
    .select('id, nombre')
    .eq('empresa_id', empresa.empresaId)
    .order('nombre');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted-foreground">Agrupan los productos. Admiten jerarquía padre-hijo.</p>
      </header>
      <CategoriasTabla
        data={data ?? []}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        opciones={opciones ?? []}
        puedeEscribir={puedeEscribir(empresa.rol, 'categorias')}
      />
    </div>
  );
}
