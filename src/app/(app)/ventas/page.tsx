import type { Metadata } from 'next';

import { requireEmpresa } from '@/lib/auth/contexto';
import { puedeEscribir } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';
import { parseTablaParams, rangoPagina } from '@/lib/tables/params';
import type { EstadoComprobante, TipoComprobante } from '@/lib/supabase/database.types';

import { ComprobantesTabla, type FilaComprobante } from './comprobantes-tabla';

export const metadata: Metadata = { title: 'Ventas' };

const ORDENABLES = new Set(['fecha_emision', 'total', 'numero']);

const ESTADOS: EstadoComprobante[] = ['BORRADOR', 'EMITIDO', 'ANULADO', 'PAGADO', 'PARCIAL'];

const TIPOS: TipoComprobante[] = [
  'PRESUPUESTO',
  'PEDIDO',
  'REMITO',
  'FACTURA_A',
  'FACTURA_B',
  'FACTURA_C',
  'NC_A',
  'NC_B',
  'NC_C',
  'ND_A',
  'ND_B',
  'ND_C',
];

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseTablaParams(sp, { defaultSort: 'fecha_emision', defaultSize: 25 });
  const sort = ORDENABLES.has(params.sort) ? params.sort : 'fecha_emision';
  const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  const tipoFiltro = primero(sp.tipo);
  const estadoFiltro = primero(sp.estadoCbte);
  const desde = primero(sp.desde);
  const hasta = primero(sp.hasta);

  const { empresa } = await requireEmpresa();
  const supabase = await createClient();

  let query = supabase
    .from('comprobantes')
    .select(
      'id, tipo_comprobante, letra, numero, fecha_emision, fecha_vencimiento, total, estado, cae, afip_observaciones, condicion_venta, clientes ( razon_social ), puntos_venta ( numero )',
      { count: 'exact' },
    )
    .eq('empresa_id', empresa.empresaId);

  const tipoValido = TIPOS.find((t) => t === tipoFiltro);
  const estadoValido = ESTADOS.find((e) => e === estadoFiltro);

  if (tipoValido) query = query.eq('tipo_comprobante', tipoValido);
  if (estadoValido) query = query.eq('estado', estadoValido);
  if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) query = query.gte('fecha_emision', desde);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) query = query.lte('fecha_emision', hasta);

  if (params.q) {
    const termino = params.q.replace(/[,()]/g, ' ').trim();
    if (termino) {
      // Un número suelto se busca como número de comprobante; si no, se
      // busca por CAE. El nombre del cliente se filtra después, en JS,
      // porque PostgREST no permite `or` sobre una tabla relacionada.
      const soloDigitos = /^\d+$/.test(termino);
      if (soloDigitos) {
        query = query.eq('numero', Number(termino));
      } else {
        query = query.ilike('cae', `%${termino}%`);
      }
    }
  }

  const [inicio, fin] = rangoPagina(params.page, params.size);
  const { data, count } = await query
    .order(sort, { ascending: params.dir === 'asc' })
    .order('creado_en', { ascending: false })
    .range(inicio, fin);

  type Fila = {
    id: string;
    tipo_comprobante: TipoComprobante;
    letra: string;
    numero: number | null;
    fecha_emision: string;
    fecha_vencimiento: string | null;
    total: number;
    estado: EstadoComprobante;
    cae: string | null;
    afip_observaciones: string | null;
    condicion_venta: 'CONTADO' | 'CUENTA_CORRIENTE';
    clientes: { razon_social: string } | null;
    puntos_venta: { numero: number } | null;
  };

  const filas: FilaComprobante[] = ((data ?? []) as unknown as Fila[]).map((c) => ({
    id: c.id,
    tipo: c.tipo_comprobante,
    numero: c.numero,
    puntoVenta: c.puntos_venta?.numero ?? null,
    fechaEmision: c.fecha_emision,
    fechaVencimiento: c.fecha_vencimiento,
    cliente: c.clientes?.razon_social ?? '—',
    total: Number(c.total),
    estado: c.estado,
    cae: c.cae,
    observacionesAfip: c.afip_observaciones,
    condicionVenta: c.condicion_venta,
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Presupuestos, pedidos, remitos, facturas y notas de crédito.
        </p>
      </header>

      <ComprobantesTabla
        data={filas}
        total={count ?? 0}
        page={params.page}
        size={params.size}
        sort={sort}
        dir={params.dir}
        q={params.q}
        estado={params.estado}
        tipoFiltro={tipoValido ?? ''}
        estadoFiltro={estadoValido ?? ''}
        desde={desde}
        hasta={hasta}
        puedeEscribir={puedeEscribir(empresa.rol, 'comprobantes')}
      />
    </div>
  );
}
