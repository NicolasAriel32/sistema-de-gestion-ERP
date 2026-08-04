-- =====================================================================
-- GestiónPyme · FASE 3 — Stock: saldos, ajustes, transferencias, kardex
--
-- Principio rector de este archivo: EL SALDO NUNCA SE GUARDA.
--
-- No hay columna `stock_actual` en `productos` ni tabla de existencias.
-- El saldo es siempre `sum(cantidad)` sobre `stock_movimientos`, que es
-- append-only y está protegida por trigger. Esto hace estructuralmente
-- imposible el desfasaje clásico de los ERP mal modelados, donde la
-- columna de saldo y el historial de movimientos dicen cosas distintas y
-- nadie sabe cuál de las dos miente.
--
-- El costo es que cada consulta agrega. Los índices
-- `(producto_id, deposito_id)` y `(empresa_id, fecha)` de la Fase 0
-- sostienen ese agregado; si algún día el volumen lo exige, el camino
-- es una vista materializada refrescada por trigger, NO una columna
-- editable a mano.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SALDOS
-- ---------------------------------------------------------------------

-- Saldo de un producto: en un depósito puntual, o global si no se pasa.
create or replace function public.saldo_stock(
  p_producto_id uuid,
  p_deposito_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(sm.cantidad), 0)::numeric(15,4)
  from public.stock_movimientos sm
  where sm.producto_id = p_producto_id
    and (p_deposito_id is null or sm.deposito_id = p_deposito_id)
    and sm.empresa_id in (select public.empresas_del_usuario())
$$;

comment on function public.saldo_stock(uuid, uuid) is
  'Saldo derivado de stock_movimientos. Nunca leer un saldo de otra fuente.';

-- Grilla principal del módulo.
--
-- Reemplaza a la `stock_saldos` de la Fase 0, que sólo agregaba
-- movimientos y por lo tanto NO devolvía fila para un producto que nunca
-- se movió. En un listado de existencias eso es un error: un producto en
-- cero es exactamente el que hay que ver. Acá el cruce productos ×
-- depósitos garantiza una fila por combinación, con saldo 0 cuando no
-- hubo movimientos.
--
-- Se mantiene el nombre `stock_saldos` en lugar de crear una vista nueva
-- para no dejar dos objetos que responden la misma pregunta con distinto
-- criterio, que es como empiezan los reportes que no coinciden entre sí.
-- Las columnas de la versión anterior siguen presentes y con el mismo
-- significado.
drop view if exists public.stock_saldos;

create view public.stock_saldos
with (security_invoker = true)
as
select
  p.empresa_id,
  p.id                                        as producto_id,
  d.id                                        as deposito_id,
  coalesce(sm.saldo, 0)::numeric(15,4)        as saldo,
  sm.ultimo_movimiento,
  p.codigo,
  p.nombre,
  p.unidad_medida,
  p.stock_minimo,
  p.precio_costo,
  p.activo,
  d.nombre                                    as deposito_nombre,
  (coalesce(sm.saldo, 0) * p.precio_costo)::numeric(15,2) as valorizado,
  (p.stock_minimo > 0 and coalesce(sm.saldo, 0) < p.stock_minimo) as bajo_minimo
from public.productos p
cross join public.depositos d
left join (
  select producto_id, deposito_id,
         sum(cantidad)::numeric(15,4) as saldo,
         max(fecha)                   as ultimo_movimiento
  from public.stock_movimientos
  group by producto_id, deposito_id
) sm on sm.producto_id = p.id and sm.deposito_id = d.id
where p.maneja_stock
  and d.empresa_id = p.empresa_id
  and d.activo;

comment on view public.stock_saldos is
  'Saldo por producto y deposito, incluyendo los productos en cero. security_invoker: hereda las policies RLS de quien consulta.';

-- Alertas de stock mínimo. Suma sobre todos los depósitos: un producto
-- no está en falta si le sobra en el depósito de al lado.
create or replace function public.productos_bajo_minimo(p_empresa_id uuid)
returns table (
  producto_id   uuid,
  codigo        text,
  nombre        text,
  stock_minimo  numeric,
  saldo_total   numeric,
  faltante      numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.codigo,
    p.nombre,
    p.stock_minimo,
    coalesce(s.saldo, 0)::numeric(15,4),
    (p.stock_minimo - coalesce(s.saldo, 0))::numeric(15,4)
  from public.productos p
  left join (
    select sm.producto_id, sum(sm.cantidad) as saldo
    from public.stock_movimientos sm
    where sm.empresa_id = p_empresa_id
    group by sm.producto_id
  ) s on s.producto_id = p.id
  where p.empresa_id = p_empresa_id
    and public.es_miembro(p_empresa_id)
    and p.maneja_stock
    and p.activo
    and p.stock_minimo > 0
    and coalesce(s.saldo, 0) < p.stock_minimo
  order by (p.stock_minimo - coalesce(s.saldo, 0)) desc
$$;

-- ---------------------------------------------------------------------
-- 2. KARDEX
--
-- Historial de un producto con saldo corrido. El saldo de cada renglón
-- se calcula con una window function sobre los mismos movimientos que
-- alimentan `saldo_stock`, así que el último renglón del kardex y el
-- saldo de la grilla salen de la misma suma. No pueden divergir.
--
-- `p_desde` recorta la ventana visible, no el cálculo: el saldo inicial
-- arrastra todo lo anterior. Un kardex que empieza en cero cada vez que
-- filtrás por fecha es un kardex inútil.
-- ---------------------------------------------------------------------
create or replace function public.kardex_producto(
  p_empresa_id  uuid,
  p_producto_id uuid,
  p_deposito_id uuid default null,
  p_desde       date default null,
  p_hasta       date default null
)
returns table (
  movimiento_id   uuid,
  fecha           timestamptz,
  tipo            tipo_movimiento_stock,
  deposito_id     uuid,
  deposito_nombre text,
  cantidad        numeric,
  entrada         numeric,
  salida          numeric,
  saldo           numeric,
  costo_unitario  numeric,
  comprobante_id  uuid,
  comprobante     text,
  motivo          text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with movimientos as (
    select
      sm.id, sm.fecha, sm.tipo, sm.deposito_id, sm.cantidad,
      sm.costo_unitario, sm.comprobante_id, sm.motivo, sm.creado_en,
      sum(sm.cantidad) over (
        order by sm.fecha, sm.creado_en, sm.id
        rows between unbounded preceding and current row
      )::numeric(15,4) as saldo_corrido
    from public.stock_movimientos sm
    where sm.empresa_id = p_empresa_id
      and sm.producto_id = p_producto_id
      and (p_deposito_id is null or sm.deposito_id = p_deposito_id)
  )
  select
    m.id,
    m.fecha,
    m.tipo,
    m.deposito_id,
    d.nombre,
    m.cantidad,
    case when m.cantidad > 0 then m.cantidad else 0 end::numeric(15,4),
    case when m.cantidad < 0 then -m.cantidad else 0 end::numeric(15,4),
    m.saldo_corrido,
    m.costo_unitario,
    m.comprobante_id,
    case
      when c.id is null then null
      else replace(c.tipo_comprobante::text, '_', ' ') || ' ' ||
           lpad(coalesce(pv.numero::text, '0'), 5, '0') || '-' ||
           lpad(coalesce(c.numero::text, '0'), 8, '0')
    end,
    m.motivo
  from movimientos m
  join public.depositos d on d.id = m.deposito_id
  left join public.comprobantes c on c.id = m.comprobante_id
  left join public.puntos_venta pv on pv.id = c.punto_venta_id
  where public.es_miembro(p_empresa_id)
    and (p_desde is null or m.fecha >= p_desde::timestamptz)
    and (p_hasta is null or m.fecha < (p_hasta + 1)::timestamptz)
  order by m.fecha, m.creado_en, m.id
$$;

comment on function public.kardex_producto(uuid, uuid, uuid, date, date) is
  'Historial con saldo corrido. El filtro de fechas recorta la vista, no el arrastre del saldo.';

-- ---------------------------------------------------------------------
-- 3. AJUSTE MANUAL
--
-- Va por función y no por INSERT directo para poder exigir el motivo con
-- un mensaje decente (el CHECK de la tabla lo exige igual, pero su error
-- es ilegible) y para validar que no se deje el stock en negativo por
-- descuido.
-- ---------------------------------------------------------------------
create or replace function public.ajustar_stock(
  p_empresa_id  uuid,
  p_producto_id uuid,
  p_deposito_id uuid,
  p_cantidad    numeric,
  p_motivo      text,
  p_costo_unitario numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_producto productos%rowtype;
  v_saldo    numeric(15,4);
  v_id       uuid;
begin
  if not public.tiene_rol(p_empresa_id, array['ADMIN','DEPOSITO']::rol_usuario[]) then
    raise exception 'Tu rol no puede ajustar stock. Se necesita perfil de administrador o de depósito.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad del ajuste no puede ser cero.'
      using errcode = 'integrity_constraint_violation';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'El ajuste necesita un motivo. Un ajuste sin explicación es un agujero de auditoría.'
      using errcode = 'integrity_constraint_violation';
  end if;

  select * into v_producto
  from public.productos
  where id = p_producto_id and empresa_id = p_empresa_id;

  if v_producto.id is null then
    raise exception 'El producto no existe en esta empresa.' using errcode = 'no_data_found';
  end if;

  if not v_producto.maneja_stock then
    raise exception 'El producto "%" no maneja stock: no admite ajustes.', v_producto.nombre
      using errcode = 'restrict_violation';
  end if;

  if not exists (
    select 1 from public.depositos
    where id = p_deposito_id and empresa_id = p_empresa_id and activo
  ) then
    raise exception 'El depósito no existe o está inactivo.' using errcode = 'no_data_found';
  end if;

  -- Un ajuste negativo no puede dejar existencias negativas: eso no es un
  -- ajuste, es un error de carga.
  if p_cantidad < 0 then
    select coalesce(sum(sm.cantidad), 0)::numeric(15,4) into v_saldo
    from public.stock_movimientos sm
    where sm.producto_id = p_producto_id and sm.deposito_id = p_deposito_id;

    if v_saldo + p_cantidad < 0 then
      raise exception
        'El ajuste dejaría el stock de "% (%)" en %. Disponible actual: %.',
        v_producto.nombre, v_producto.codigo, v_saldo + p_cantidad, v_saldo
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.stock_movimientos
    (empresa_id, producto_id, deposito_id, tipo, cantidad,
     costo_unitario, motivo, usuario_id)
  values
    (p_empresa_id, p_producto_id, p_deposito_id, 'AJUSTE', p_cantidad,
     coalesce(p_costo_unitario, v_producto.precio_costo), btrim(p_motivo), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. TRANSFERENCIA ENTRE DEPÓSITOS
--
-- Dos movimientos espejo en una sola transacción. Si el segundo falla,
-- el primero vuelve atrás: nunca queda mercadería evaporada entre dos
-- depósitos. Por eso va por RPC y no por dos INSERT desde el cliente.
-- ---------------------------------------------------------------------
create or replace function public.transferir_stock(
  p_empresa_id  uuid,
  p_producto_id uuid,
  p_origen_id   uuid,
  p_destino_id  uuid,
  p_cantidad    numeric,
  p_motivo      text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_producto productos%rowtype;
  v_saldo    numeric(15,4);
  v_salida   uuid;
  v_entrada  uuid;
  v_motivo   text;
  v_origen   text;
  v_destino  text;
begin
  if not public.tiene_rol(p_empresa_id, array['ADMIN','DEPOSITO']::rol_usuario[]) then
    raise exception 'Tu rol no puede transferir stock. Se necesita perfil de administrador o de depósito.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a transferir debe ser mayor a cero.'
      using errcode = 'integrity_constraint_violation';
  end if;

  if p_origen_id = p_destino_id then
    raise exception 'El depósito de origen y el de destino no pueden ser el mismo.'
      using errcode = 'integrity_constraint_violation';
  end if;

  select * into v_producto
  from public.productos
  where id = p_producto_id and empresa_id = p_empresa_id;

  if v_producto.id is null then
    raise exception 'El producto no existe en esta empresa.' using errcode = 'no_data_found';
  end if;

  if not v_producto.maneja_stock then
    raise exception 'El producto "%" no maneja stock: no admite transferencias.', v_producto.nombre
      using errcode = 'restrict_violation';
  end if;

  select nombre into v_origen from public.depositos
   where id = p_origen_id and empresa_id = p_empresa_id and activo;
  select nombre into v_destino from public.depositos
   where id = p_destino_id and empresa_id = p_empresa_id and activo;

  if v_origen is null or v_destino is null then
    raise exception 'Alguno de los depósitos no existe o está inactivo.'
      using errcode = 'no_data_found';
  end if;

  -- Una transferencia nunca puede generar stock: si no hay en el origen,
  -- no hay nada que mover. Acá no aplica `permite_venta_sin_stock`, que
  -- es una decisión comercial sobre la venta, no sobre la logística.
  select coalesce(sum(sm.cantidad), 0)::numeric(15,4) into v_saldo
  from public.stock_movimientos sm
  where sm.producto_id = p_producto_id and sm.deposito_id = p_origen_id;

  if v_saldo < p_cantidad then
    raise exception
      'No hay stock suficiente de "% (%)" en %. Disponible: %, se intenta transferir: %.',
      v_producto.nombre, v_producto.codigo, v_origen, v_saldo, p_cantidad
      using errcode = 'check_violation';
  end if;

  v_motivo := coalesce(nullif(btrim(p_motivo), ''),
                       'Transferencia ' || v_origen || ' → ' || v_destino);

  insert into public.stock_movimientos
    (empresa_id, producto_id, deposito_id, tipo, cantidad,
     costo_unitario, motivo, usuario_id)
  values
    (p_empresa_id, p_producto_id, p_origen_id, 'TRANSFERENCIA_SALIDA', -p_cantidad,
     v_producto.precio_costo, v_motivo, auth.uid())
  returning id into v_salida;

  insert into public.stock_movimientos
    (empresa_id, producto_id, deposito_id, tipo, cantidad,
     costo_unitario, motivo, usuario_id)
  values
    (p_empresa_id, p_producto_id, p_destino_id, 'TRANSFERENCIA_ENTRADA', p_cantidad,
     v_producto.precio_costo, v_motivo, auth.uid())
  returning id into v_entrada;

  return array[v_salida, v_entrada];
end;
$$;

comment on function public.transferir_stock(uuid, uuid, uuid, uuid, numeric, text) is
  'Dos movimientos espejo atomicos. Nunca invocar con dos INSERT sueltos desde la aplicacion.';

-- ---------------------------------------------------------------------
-- 5. Stock valorizado, para el reporte de la Fase 5 y el dashboard.
--    Se valoriza al costo actual del producto, no al costo histórico de
--    cada movimiento: es el criterio que usa una PyME para saber cuánta
--    plata tiene parada en el depósito hoy.
-- ---------------------------------------------------------------------
create or replace function public.stock_valorizado(
  p_empresa_id  uuid,
  p_deposito_id uuid default null
)
returns table (
  producto_id  uuid,
  codigo       text,
  nombre       text,
  saldo        numeric,
  precio_costo numeric,
  valorizado   numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id, p.codigo, p.nombre,
    coalesce(s.saldo, 0)::numeric(15,4),
    p.precio_costo,
    (coalesce(s.saldo, 0) * p.precio_costo)::numeric(15,2)
  from public.productos p
  left join (
    select sm.producto_id, sum(sm.cantidad) as saldo
    from public.stock_movimientos sm
    where sm.empresa_id = p_empresa_id
      and (p_deposito_id is null or sm.deposito_id = p_deposito_id)
    group by sm.producto_id
  ) s on s.producto_id = p.id
  where p.empresa_id = p_empresa_id
    and public.es_miembro(p_empresa_id)
    and p.maneja_stock
    and coalesce(s.saldo, 0) <> 0
  order by (coalesce(s.saldo, 0) * p.precio_costo) desc
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos: nada de esto se expone al rol anónimo.
-- ---------------------------------------------------------------------
do $$
declare
  f text;
  firmas text[] := array[
    'public.saldo_stock(uuid, uuid)',
    'public.productos_bajo_minimo(uuid)',
    'public.kardex_producto(uuid, uuid, uuid, date, date)',
    'public.ajustar_stock(uuid, uuid, uuid, numeric, text, numeric)',
    'public.transferir_stock(uuid, uuid, uuid, uuid, numeric, text)',
    'public.stock_valorizado(uuid, uuid)'
  ];
begin
  foreach f in array firmas loop
    execute format('revoke execute on function %s from anon, public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

revoke all on public.stock_saldos from anon, public;
grant select on public.stock_saldos to authenticated, service_role;
