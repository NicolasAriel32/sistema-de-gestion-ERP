import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { ProductosTabla } from './productos-tabla';

export const metadata: Metadata = { title: 'Productos' };

const ORDENABLES = new Set(['codigo', 'nombre', 'precio_costo']);

export default async function ProductosPage({
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
    .from('productos')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa.empresaId);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) {
      const like = `%${termino}%`;
      query = query.or(`nombre.ilike.${like},codigo.ilike.${like},codigo_barras.ilike.${like}`);
    }
  }
  if (params.estado === 'activos') query = query.eq('activo', true);
  if (params.estado === 'inactivos') query = query.eq('activo', false);

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: params.dir === 'asc' })
    .range(desde, hasta);

  const { data: categorias } = await supabase
    .from('categorias')
    .select('id, nombre')
    .eq('empresa_id', empresa.empresaId)
    .order('nombre');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de productos: códigos, alícuotas de IVA, costos y control de stock.
        </p>
      </header>

      <ProductosTabla
        data={data ?? []}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        categorias={categorias ?? []}
        puedeEscribir={puedeEscribir(empresa.rol, 'productos')}
      />
    </div>
  );
}
