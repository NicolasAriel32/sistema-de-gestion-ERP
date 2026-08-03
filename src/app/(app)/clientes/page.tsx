import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { ClientesTabla } from './clientes-tabla';

export const metadata: Metadata = { title: 'Clientes' };

const ORDENABLES = new Set(['razon_social', 'limite_credito']);

export default async function ClientesPage({
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
    .from('clientes')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa.empresaId);

  if (params.q) {
    // Se limpian los caracteres que rompen la sintaxis de `.or()`.
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) {
      const like = `%${termino}%`;
      query = query.or(
        `razon_social.ilike.${like},nombre_fantasia.ilike.${like},cuit_dni.ilike.${like}`,
      );
    }
  }
  if (params.estado === 'activos') query = query.eq('activo', true);
  if (params.estado === 'inactivos') query = query.eq('activo', false);

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: params.dir === 'asc' })
    .range(desde, hasta);

  const { data: listas } = await supabase
    .from('listas_precios')
    .select('id, nombre')
    .eq('empresa_id', empresa.empresaId)
    .eq('activa', true)
    .order('nombre');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Altas, cuentas y condiciones comerciales de tus clientes.
        </p>
      </header>

      <ClientesTabla
        data={data ?? []}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        listasPrecios={listas ?? []}
        puedeEscribir={puedeEscribir(empresa.rol, 'clientes')}
      />
    </div>
  );
}
