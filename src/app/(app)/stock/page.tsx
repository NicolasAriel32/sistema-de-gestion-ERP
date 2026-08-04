import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';

import { StockTabla, type FilaStock } from './stock-tabla';

export const metadata: Metadata = { title: 'Stock' };

const ORDENABLES = new Set(['codigo', 'nombre', 'saldo', 'valorizado', 'deposito_nombre']);

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseTablaParams(sp, { defaultSort: 'nombre', defaultSize: 25 });
  const sort = ORDENABLES.has(params.sort) ? params.sort : 'nombre';

  const depositoFiltro = typeof sp.deposito === 'string' ? sp.deposito : '';
  const soloBajoMinimo = sp.alerta === '1';

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  const [{ data: depositos }, { data: alertas }] = await Promise.all([
    supabase
      .from('depositos')
      .select('id, nombre')
      .eq('empresa_id', empresa.empresaId)
      .eq('activo', true)
      .order('nombre'),
    supabase.rpc('productos_bajo_minimo', { p_empresa_id: empresa.empresaId }),
  ]);

  let query = supabase
    .from('stock_saldos')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa.empresaId)
    .eq('activo', true);

  if (depositoFiltro) query = query.eq('deposito_id', depositoFiltro);
  if (soloBajoMinimo) query = query.eq('bajo_minimo', true);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) {
      const like = `%${termino}%`;
      query = query.or(`codigo.ilike.${like},nombre.ilike.${like}`);
    }
  }

  const [desde, hasta] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: params.dir === 'asc' })
    .order('deposito_nombre', { ascending: true })
    .range(desde, hasta);

  const filas: FilaStock[] = (data ?? []).map((f) => ({
    productoId: f.producto_id,
    depositoId: f.deposito_id,
    codigo: f.codigo,
    nombre: f.nombre,
    unidadMedida: f.unidad_medida,
    depositoNombre: f.deposito_nombre,
    saldo: Number(f.saldo),
    stockMinimo: Number(f.stock_minimo),
    precioCosto: Number(f.precio_costo),
    valorizado: Number(f.valorizado),
    bajoMinimo: f.bajo_minimo,
    ultimoMovimiento: f.ultimo_movimiento,
  }));

  const cantidadAlertas = (alertas ?? []).length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Existencias por producto y depósito. El saldo se deriva de los movimientos: no hay
            ningún número guardado a mano.
          </p>
        </div>
      </header>

      <StockTabla
        data={filas}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        depositos={depositos ?? []}
        depositoFiltro={depositoFiltro}
        soloBajoMinimo={soloBajoMinimo}
        cantidadAlertas={cantidadAlertas}
        puedeMover={puedeEscribir(empresa.rol, 'stock_movimientos')}
      />
    </div>
  );
}
