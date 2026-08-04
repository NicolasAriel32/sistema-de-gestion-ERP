-- =====================================================================
-- GestiónPyme · FASE 3 — Compras: orden de compra → factura de
-- proveedor → ingreso de stock
--
-- Diferencia esencial con el circuito de ventas: acá el comprobante NO
-- lo emitimos nosotros. El número, la letra y el CAE los trae impresos
-- el papel del proveedor. Por eso:
--
--   · No hay contador de numeración para `compras`. El número es un dato
--     que se carga, y la serie admite huecos por definición.
--   · No se pide CAE a ningún proveedor de facturación.
--   · El antiduplicado (misma empresa + proveedor + tipo + punto de
--     venta + número) es la única defensa contra cargar dos veces la
--     misma factura. Ya está en el schema de la Fase 0.
--
-- La orden de compra sí es un documento propio, y esa sí lleva contador.
--
-- CRITERIO DE COSTEO: último costo. Al ingresar mercadería,
-- `productos.precio_costo` pasa a ser el costo unitario de esta compra.
-- El costo histórico de cada ingreso queda igualmente registrado en
-- `stock_movimientos.costo_unitario`, así que la trazabilidad no se
-- pierde y migrar a promedio ponderado más adelante es posible sin
-- perder información.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Numeración de órdenes de compra
--
-- Mismo patrón que los comprobantes de venta: contador con lock de fila.
-- Prohibido MAX(numero)+1 desde la aplicación, también acá.
-- ---------------------------------------------------------------------
create table if not exists orden_compra_contadores (
  empresa_id      uuid primary key references empresas(id) on delete cascade,
  ultimo_numero   bigint not null default 0 check (ultimo_numero >= 0),
  actualizado_en  timestamptz not null default now()
);

alter table orden_compra_contadores enable row level security;

create policy orden_compra_contadores_select on orden_compra_contadores
  for select to authenticated
  using (empresa_id in (select public.empresas_del_usuario()));
-- Sin políticas de escritura: sólo se toca por función SECURITY DEFINER.

create or replace function public.siguiente_numero_orden_compra(p_empresa_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero bigint;
begin
  insert into public.orden_compra_contadores (empresa_id, ultimo_numero)
  values (p_empresa_id, 0)
  on conflict (empresa_id) do nothing;

  select oc.ultimo_numero + 1 into v_numero
  from public.orden_compra_contadores oc
  where oc.empresa_id = p_empresa_id
  for update;

  update public.orden_compra_contadores
     set ultimo_numero = v_numero, actualizado_en = now()
   where empresa_id = p_empresa_id;

  return v_numero;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Inmutabilidad de la compra registrada
--
-- Una factura de proveedor ya registrada movió stock y cuenta corriente.
-- Editarla dejaría esos efectos huérfanos. Se anula, no se corrige.
-- ---------------------------------------------------------------------
create or replace function public.bloquear_cambios_compra_registrada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if OLD.estado = 'BORRADOR' then
    return NEW;
  end if;

  -- Fuera de BORRADOR sólo puede evolucionar el estado (pagos de Fase 4,
  -- anulación) y las observaciones.
  if (NEW.proveedor_id, NEW.tipo_comprobante, NEW.letra, NEW.punto_venta_numero,
      NEW.numero, NEW.fecha_emision, NEW.deposito_id, NEW.moneda, NEW.cotizacion,
      NEW.neto_gravado, NEW.neto_no_gravado, NEW.exento,
      NEW.iva_105, NEW.iva_21, NEW.iva_27, NEW.total_percepciones, NEW.total)
     is distinct from
     (OLD.proveedor_id, OLD.tipo_comprobante, OLD.letra, OLD.punto_venta_numero,
      OLD.numero, OLD.fecha_emision, OLD.deposito_id, OLD.moneda, OLD.cotizacion,
      OLD.neto_gravado, OLD.neto_no_gravado, OLD.exento,
      OLD.iva_105, OLD.iva_21, OLD.iva_27, OLD.total_percepciones, OLD.total)
  then
    raise exception
      'La compra % está en estado %: no admite modificación. Para corregirla, anulala y volvé a cargarla.',
      OLD.id, OLD.estado
      using errcode = 'restrict_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists compras_inmutables on compras;
create trigger compras_inmutables
  before update on compras
  for each row execute function public.bloquear_cambios_compra_registrada();

create or replace function public.bloquear_delete_compra()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if OLD.estado <> 'BORRADOR' then
    raise exception
      'La compra % está en estado % y no puede eliminarse. Se anula, dejando rastro.',
      OLD.id, OLD.estado
      using errcode = 'restrict_violation';
  end if;
  return OLD;
end;
$$;

drop trigger if exists compras_no_se_borran on compras;
create trigger compras_no_se_borran
  before delete on compras
  for each row execute function public.bloquear_delete_compra();

-- ---------------------------------------------------------------------
-- 3. ÓRDENES DE COMPRA
--
-- Documento interno: no tiene efecto fiscal, no mueve stock, no genera
-- deuda. Es una intención de compra que después se cumple (total o
-- parcialmente) con una o varias facturas de proveedor.
-- ---------------------------------------------------------------------
create or replace function public.crear_orden_compra_borrador(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa uuid := (p_datos->>'empresa_id')::uuid;
  v_id      uuid;
  v_item    jsonb;
  v_orden   int := 0;
begin
  if v_empresa is null then
    raise exception 'Falta la empresa.' using errcode = 'integrity_constraint_violation';
  end if;

  if not public.tiene_rol(v_empresa, array['ADMIN','CONTABLE','DEPOSITO']::rol_usuario[]) then
    raise exception 'Tu rol no puede crear órdenes de compra.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_datos->'items', '[]'::jsonb)) = 0 then
    raise exception 'La orden de compra necesita al menos un renglón.'
      using errcode = 'integrity_constraint_violation';
  end if;

  insert into public.ordenes_compra (
    empresa_id, numero, proveedor_id, deposito_id, fecha, fecha_entrega,
    estado, neto, iva, total, observaciones, creado_por
  )
  values (
    v_empresa,
    public.siguiente_numero_orden_compra(v_empresa),
    (p_datos->>'proveedor_id')::uuid,
    (p_datos->>'deposito_id')::uuid,
    coalesce((p_datos->>'fecha')::date,
             (now() at time zone 'America/Argentina/Buenos_Aires')::date),
    (p_datos->>'fecha_entrega')::date,
    'BORRADOR',
    coalesce((p_datos->>'neto')::numeric, 0),
    coalesce((p_datos->>'iva')::numeric, 0),
    coalesce((p_datos->>'total')::numeric, 0),
    nullif(btrim(coalesce(p_datos->>'observaciones','')), ''),
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_datos->'items') loop
    v_orden := v_orden + 1;
    insert into public.orden_compra_items (
      empresa_id, orden_compra_id, orden, producto_id, descripcion,
      cantidad, precio_unitario, alicuota_iva,
      subtotal_neto, subtotal_iva, subtotal
    )
    values (
      v_empresa, v_id, v_orden,
      (v_item->>'producto_id')::uuid,
      v_item->>'descripcion',
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric,
      coalesce((v_item->>'alicuota_iva')::numeric, 21),
      (v_item->>'subtotal_neto')::numeric,
      (v_item->>'subtotal_iva')::numeric,
      (v_item->>'subtotal')::numeric
    );
  end loop;

  return v_id;
end;
$$;

create or replace function public.actualizar_orden_compra_borrador(
  p_orden_compra_id uuid,
  p_datos           jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc    ordenes_compra%rowtype;
  v_item  jsonb;
  v_orden int := 0;
begin
  select * into v_oc from public.ordenes_compra where id = p_orden_compra_id for update;

  if v_oc.id is null then
    raise exception 'La orden de compra no existe.' using errcode = 'no_data_found';
  end if;

  if not public.tiene_rol(v_oc.empresa_id, array['ADMIN','CONTABLE','DEPOSITO']::rol_usuario[]) then
    raise exception 'Tu rol no puede editar órdenes de compra.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_oc.estado <> 'BORRADOR' then
    raise exception
      'La orden de compra está en estado % y no se puede editar.', v_oc.estado
      using errcode = 'restrict_violation';
  end if;

  if jsonb_array_length(coalesce(p_datos->'items', '[]'::jsonb)) = 0 then
    raise exception 'La orden de compra necesita al menos un renglón.'
      using errcode = 'integrity_constraint_violation';
  end if;

  update public.ordenes_compra set
    proveedor_id  = coalesce((p_datos->>'proveedor_id')::uuid, proveedor_id),
    deposito_id   = (p_datos->>'deposito_id')::uuid,
    fecha         = coalesce((p_datos->>'fecha')::date, fecha),
    fecha_entrega = (p_datos->>'fecha_entrega')::date,
    neto          = coalesce((p_datos->>'neto')::numeric, 0),
    iva           = coalesce((p_datos->>'iva')::numeric, 0),
    total         = coalesce((p_datos->>'total')::numeric, 0),
    observaciones = nullif(btrim(coalesce(p_datos->>'observaciones','')), '')
  where id = p_orden_compra_id;

  delete from public.orden_compra_items where orden_compra_id = p_orden_compra_id;

  for v_item in select * from jsonb_array_elements(p_datos->'items') loop
    v_orden := v_orden + 1;
    insert into public.orden_compra_items (
      empresa_id, orden_compra_id, orden, producto_id, descripcion,
      cantidad, precio_unitario, alicuota_iva,
      subtotal_neto, subtotal_iva, subtotal
    )
    values (
      v_oc.empresa_id, p_orden_compra_id, v_orden,
      (v_item->>'producto_id')::uuid,
      v_item->>'descripcion',
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric,
      coalesce((v_item->>'alicuota_iva')::numeric, 21),
      (v_item->>'subtotal_neto')::numeric,
      (v_item->>'subtotal_iva')::numeric,
      (v_item->>'subtotal')::numeric
    );
  end loop;

  return p_orden_compra_id;
end;
$$;

create or replace function public.emitir_orden_compra(p_orden_compra_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc ordenes_compra%rowtype;
begin
  select * into v_oc from public.ordenes_compra where id = p_orden_compra_id for update;

  if v_oc.id is null then
    raise exception 'La orden de compra no existe.' using errcode = 'no_data_found';
  end if;

  if not public.tiene_rol(v_oc.empresa_id, array['ADMIN','CONTABLE','DEPOSITO']::rol_usuario[]) then
    raise exception 'Tu rol no puede emitir órdenes de compra.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_oc.estado <> 'BORRADOR' then
    raise exception 'La orden de compra ya fue emitida (estado %).', v_oc.estado
      using errcode = 'restrict_violation';
  end if;

  if not exists (select 1 from public.orden_compra_items where orden_compra_id = p_orden_compra_id) then
    raise exception 'La orden de compra no tiene renglones cargados.'
      using errcode = 'integrity_constraint_violation';
  end if;

  update public.ordenes_compra set estado = 'EMITIDA' where id = p_orden_compra_id;
  return p_orden_compra_id;
end;
$$;

create or replace function public.anular_orden_compra(
  p_orden_compra_id uuid,
  p_motivo          text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc ordenes_compra%rowtype;
begin
  select * into v_oc from public.ordenes_compra where id = p_orden_compra_id for update;

  if v_oc.id is null then
    raise exception 'La orden de compra no existe.' using errcode = 'no_data_found';
  end if;

  if not public.tiene_rol(v_oc.empresa_id, array['ADMIN','CONTABLE']::rol_usuario[]) then
    raise exception 'Tu rol no puede anular órdenes de compra.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_oc.estado in ('RECIBIDA','ANULADA') then
    raise exception
      'La orden de compra está en estado % y no puede anularse.', v_oc.estado
      using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1 from public.orden_compra_items
    where orden_compra_id = p_orden_compra_id and cantidad_recibida > 0
  ) then
    raise exception
      'La orden ya tiene mercadería recibida. Anulá primero las facturas de compra asociadas.'
      using errcode = 'restrict_violation';
  end if;

  update public.ordenes_compra
     set estado = 'ANULADA',
         observaciones = coalesce(observaciones || ' · ', '') || 'ANULADA: ' || coalesce(p_motivo, 's/motivo')
   where id = p_orden_compra_id;

  return p_orden_compra_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. EFECTOS DE LA COMPRA — piezas internas, no se invocan sueltas.
-- ---------------------------------------------------------------------

-- Ingreso de mercadería + actualización de costo.
--
-- Sobre qué se toma como costo: `precio_unitario` tal como se cargó. En
-- una factura A ese valor es neto (el IVA es crédito fiscal, no costo);
-- en una B o C el IVA no se discrimina y por lo tanto forma parte del
-- costo. En ambos casos el número correcto es el que cargó el usuario,
-- así que no hay que hacerle nada.
create or replace function public.aplicar_stock_compra(p_compra_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_c    compras%rowtype;
  v_item record;
begin
  select * into v_c from public.compras where id = p_compra_id;

  if not exists (
    select 1 from public.compra_items ci
    join public.productos p on p.id = ci.producto_id
    where ci.compra_id = p_compra_id and p.maneja_stock
  ) then
    -- Nada que ingresar: servicios, fletes, gastos.
    return;
  end if;

  if v_c.deposito_id is null then
    raise exception
      'La compra ingresa mercadería pero no tiene depósito asignado. Elegí un depósito antes de registrarla.'
      using errcode = 'integrity_constraint_violation';
  end if;

  for v_item in
    select ci.producto_id, ci.cantidad, ci.precio_unitario, p.maneja_stock
    from public.compra_items ci
    join public.productos p on p.id = ci.producto_id
    where ci.compra_id = p_compra_id
    order by ci.orden
  loop
    if v_item.maneja_stock then
      insert into public.stock_movimientos
        (empresa_id, producto_id, deposito_id, tipo, cantidad,
         costo_unitario, motivo, usuario_id)
      values
        (v_c.empresa_id, v_item.producto_id, v_c.deposito_id, 'COMPRA', v_item.cantidad,
         v_item.precio_unitario,
         'Ingreso por compra ' || lpad(v_c.punto_venta_numero::text, 5, '0')
           || '-' || lpad(v_c.numero::text, 8, '0'),
         auth.uid());
    end if;

    -- Último costo. Se actualiza incluso para productos que no manejan
    -- stock: el costo sirve igual para calcular márgenes y listas de
    -- precios con markup.
    update public.productos
       set precio_costo = v_item.precio_unitario
     where id = v_item.producto_id
       and v_item.precio_unitario > 0;
  end loop;
end;
$$;

comment on function public.aplicar_stock_compra(uuid) is
  'Ingresa mercaderia y actualiza precio_costo con el ultimo costo. Pieza interna de registrar_compra.';

-- Cuenta corriente del proveedor.
--
-- Convención de signo, la misma que para clientes: `debe` es lo que se
-- adeuda. En una cuenta de proveedor eso significa que un saldo positivo
-- es deuda NUESTRA con él. El pago (Fase 4) irá al `haber`.
create or replace function public.aplicar_cta_cte_compra(p_compra_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_c        compras%rowtype;
  v_concepto text;
begin
  select * into v_c from public.compras where id = p_compra_id;

  if v_c.condicion_venta <> 'CUENTA_CORRIENTE' then
    return;
  end if;

  v_concepto := replace(v_c.tipo_comprobante::text, '_', ' ') || ' ' ||
                lpad(v_c.punto_venta_numero::text, 5, '0') || '-' ||
                lpad(v_c.numero::text, 8, '0');

  insert into public.cta_cte_movimientos
    (empresa_id, entidad_tipo, entidad_id, fecha, fecha_vencimiento,
     concepto, debe, haber, usuario_id)
  values
    (v_c.empresa_id, 'PROVEEDOR', v_c.proveedor_id, v_c.fecha_emision,
     v_c.fecha_vencimiento, v_concepto, v_c.total, 0, auth.uid());
end;
$$;

-- Imputación contra la orden de compra: acumula lo recibido por renglón
-- y recalcula el estado. Soporta recepción parcial y varias facturas
-- contra la misma orden.
create or replace function public.imputar_recepcion_orden_compra(p_compra_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_c         compras%rowtype;
  v_item      record;
  v_pendiente boolean;
  v_algo      boolean;
begin
  select * into v_c from public.compras where id = p_compra_id;

  if v_c.orden_compra_id is null then
    return;
  end if;

  -- Se imputa por producto: el orden de los renglones de la factura no
  -- tiene por qué coincidir con el de la orden.
  for v_item in
    select ci.producto_id, sum(ci.cantidad) as cantidad
    from public.compra_items ci
    where ci.compra_id = p_compra_id and ci.producto_id is not null
    group by ci.producto_id
  loop
    update public.orden_compra_items oci
       set cantidad_recibida = greatest(oci.cantidad_recibida + v_item.cantidad, 0)
     where oci.orden_compra_id = v_c.orden_compra_id
       and oci.producto_id = v_item.producto_id;
  end loop;

  select
    bool_or(oci.cantidad_recibida < oci.cantidad),
    bool_or(oci.cantidad_recibida > 0)
    into v_pendiente, v_algo
  from public.orden_compra_items oci
  where oci.orden_compra_id = v_c.orden_compra_id;

  update public.ordenes_compra
     set estado = case
                    when not coalesce(v_algo, false)     then 'EMITIDA'
                    when coalesce(v_pendiente, false)    then 'RECIBIDA_PARCIAL'
                    else 'RECIBIDA'
                  end::estado_orden_compra
   where id = v_c.orden_compra_id
     and estado <> 'ANULADA';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. REGISTRAR FACTURA DE PROVEEDOR — el corazón del circuito
--
-- Cabecera + renglones + percepciones + ingreso de stock + costo +
-- cuenta corriente + imputación a la orden, todo en una transacción.
-- O entra completo o no entra nada.
-- ---------------------------------------------------------------------
create or replace function public.registrar_compra(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa uuid := (p_datos->>'empresa_id')::uuid;
  v_id      uuid;
  v_item    jsonb;
  v_perc    jsonb;
  v_orden   int := 0;
  v_suma    numeric(15,2);
  v_total   numeric(15,2);
begin
  if v_empresa is null then
    raise exception 'Falta la empresa.' using errcode = 'integrity_constraint_violation';
  end if;

  if not public.tiene_rol(v_empresa, array['ADMIN','CONTABLE']::rol_usuario[]) then
    raise exception 'Tu rol no puede registrar facturas de proveedor.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_datos->'items', '[]'::jsonb)) = 0 then
    raise exception 'La factura de compra necesita al menos un renglón.'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- La base no recalcula los importes, pero verifica que cierren. El
  -- motor de cálculo vive en TypeScript; esto es el control de que lo
  -- que llegó no está roto.
  select coalesce(sum((i->>'subtotal')::numeric), 0)
    into v_suma
  from jsonb_array_elements(p_datos->'items') i;

  v_total := coalesce((p_datos->>'total')::numeric, 0)
           - coalesce((p_datos->>'total_percepciones')::numeric, 0);

  if v_suma <> v_total then
    raise exception
      'Los importes no cierran: los renglones suman % y el total sin percepciones dice %.',
      v_suma, v_total
      using errcode = 'integrity_constraint_violation';
  end if;

  insert into public.compras (
    empresa_id, proveedor_id, orden_compra_id,
    tipo_comprobante, letra, punto_venta_numero, numero, cae_proveedor,
    fecha_emision, fecha_vencimiento, deposito_id, condicion_venta,
    moneda, cotizacion,
    neto_gravado, neto_no_gravado, exento, iva_105, iva_21, iva_27,
    total_percepciones, total, estado, observaciones, creado_por
  )
  values (
    v_empresa,
    (p_datos->>'proveedor_id')::uuid,
    (p_datos->>'orden_compra_id')::uuid,
    (p_datos->>'tipo_comprobante')::tipo_comprobante,
    (p_datos->>'letra')::letra_comprobante,
    (p_datos->>'punto_venta_numero')::integer,
    (p_datos->>'numero')::bigint,
    nullif(btrim(coalesce(p_datos->>'cae_proveedor','')), ''),
    (p_datos->>'fecha_emision')::date,
    (p_datos->>'fecha_vencimiento')::date,
    (p_datos->>'deposito_id')::uuid,
    coalesce((p_datos->>'condicion_venta')::condicion_venta, 'CONTADO'),
    coalesce(p_datos->>'moneda', 'ARS'),
    coalesce((p_datos->>'cotizacion')::numeric, 1),
    coalesce((p_datos->>'neto_gravado')::numeric, 0),
    coalesce((p_datos->>'neto_no_gravado')::numeric, 0),
    coalesce((p_datos->>'exento')::numeric, 0),
    coalesce((p_datos->>'iva_105')::numeric, 0),
    coalesce((p_datos->>'iva_21')::numeric, 0),
    coalesce((p_datos->>'iva_27')::numeric, 0),
    coalesce((p_datos->>'total_percepciones')::numeric, 0),
    coalesce((p_datos->>'total')::numeric, 0),
    'REGISTRADA',
    nullif(btrim(coalesce(p_datos->>'observaciones','')), ''),
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_datos->'items') loop
    v_orden := v_orden + 1;
    insert into public.compra_items (
      empresa_id, compra_id, orden, producto_id, descripcion,
      cantidad, precio_unitario, alicuota_iva,
      subtotal_neto, subtotal_iva, subtotal
    )
    values (
      v_empresa, v_id, v_orden,
      (v_item->>'producto_id')::uuid,
      v_item->>'descripcion',
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric,
      coalesce((v_item->>'alicuota_iva')::numeric, 21),
      (v_item->>'subtotal_neto')::numeric,
      (v_item->>'subtotal_iva')::numeric,
      (v_item->>'subtotal')::numeric
    );
  end loop;

  for v_perc in select * from jsonb_array_elements(coalesce(p_datos->'percepciones', '[]'::jsonb)) loop
    insert into public.compra_percepciones (
      empresa_id, compra_id, tipo, jurisdiccion, base_imponible, alicuota, importe
    )
    values (
      v_empresa, v_id,
      (v_perc->>'tipo')::tipo_percepcion,
      nullif(btrim(coalesce(v_perc->>'jurisdiccion','')), ''),
      coalesce((v_perc->>'base_imponible')::numeric, 0),
      coalesce((v_perc->>'alicuota')::numeric, 0),
      (v_perc->>'importe')::numeric
    );
  end loop;

  perform public.aplicar_stock_compra(v_id);
  perform public.aplicar_cta_cte_compra(v_id);
  perform public.imputar_recepcion_orden_compra(v_id);

  return v_id;
end;
$$;

comment on function public.registrar_compra(jsonb) is
  'Alta atomica de factura de proveedor: cabecera, renglones, percepciones, stock, costo y cuenta corriente.';

-- ---------------------------------------------------------------------
-- 6. ANULAR UNA COMPRA
--
-- No se borra: se revierte. El stock vuelve con un movimiento de
-- devolución al proveedor, la cuenta corriente recibe un contra-asiento,
-- y la orden de compra recupera su cantidad pendiente.
--
-- Lo que NO se revierte es `productos.precio_costo`: no hay forma
-- confiable de saber cuál era el costo anterior si hubo compras
-- posteriores. Se avisa en la UI y se corrige a mano si hace falta.
-- ---------------------------------------------------------------------
create or replace function public.anular_compra(
  p_compra_id uuid,
  p_motivo    text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c        compras%rowtype;
  v_item     record;
  v_saldo    numeric(15,4);
  v_concepto text;
begin
  select * into v_c from public.compras where id = p_compra_id for update;

  if v_c.id is null then
    raise exception 'La compra no existe.' using errcode = 'no_data_found';
  end if;

  if not public.tiene_rol(v_c.empresa_id, array['ADMIN','CONTABLE']::rol_usuario[]) then
    raise exception 'Tu rol no puede anular facturas de proveedor.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_c.estado = 'ANULADA' then
    raise exception 'La compra ya está anulada.' using errcode = 'restrict_violation';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'La anulación necesita un motivo.'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Devolución de la mercadería ingresada.
  for v_item in
    select ci.producto_id, ci.cantidad, ci.precio_unitario, p.nombre, p.codigo
    from public.compra_items ci
    join public.productos p on p.id = ci.producto_id
    where ci.compra_id = p_compra_id and p.maneja_stock
    order by ci.orden
  loop
    -- Si la mercadería ya se vendió, el stock no alcanza para devolverla.
    -- Anular igual dejaría existencias negativas, que es peor que
    -- bloquear: se emite una nota de crédito de compra, no se anula.
    select coalesce(sum(sm.cantidad), 0)::numeric(15,4) into v_saldo
    from public.stock_movimientos sm
    where sm.producto_id = v_item.producto_id
      and sm.deposito_id = v_c.deposito_id;

    if v_saldo < v_item.cantidad then
      raise exception
        'No se puede anular: de "% (%)" ingresaron % y hoy quedan %. Parte de esa mercadería ya salió.',
        v_item.nombre, v_item.codigo, v_item.cantidad, v_saldo
        using errcode = 'check_violation';
    end if;

    insert into public.stock_movimientos
      (empresa_id, producto_id, deposito_id, tipo, cantidad,
       costo_unitario, motivo, usuario_id)
    values
      (v_c.empresa_id, v_item.producto_id, v_c.deposito_id, 'DEVOLUCION_PROVEEDOR',
       -v_item.cantidad, v_item.precio_unitario,
       'Anulación de compra ' || lpad(v_c.punto_venta_numero::text, 5, '0')
         || '-' || lpad(v_c.numero::text, 8, '0') || ': ' || btrim(p_motivo),
       auth.uid());
  end loop;

  -- Contra-asiento de cuenta corriente.
  if v_c.condicion_venta = 'CUENTA_CORRIENTE' then
    v_concepto := 'Anulación ' || replace(v_c.tipo_comprobante::text, '_', ' ') || ' ' ||
                  lpad(v_c.punto_venta_numero::text, 5, '0') || '-' ||
                  lpad(v_c.numero::text, 8, '0');

    insert into public.cta_cte_movimientos
      (empresa_id, entidad_tipo, entidad_id, fecha, concepto, debe, haber, usuario_id)
    values
      (v_c.empresa_id, 'PROVEEDOR', v_c.proveedor_id,
       (now() at time zone 'America/Argentina/Buenos_Aires')::date,
       v_concepto, 0, v_c.total, auth.uid());
  end if;

  -- La orden de compra recupera lo pendiente.
  if v_c.orden_compra_id is not null then
    for v_item in
      select ci.producto_id, sum(ci.cantidad) as cantidad
      from public.compra_items ci
      where ci.compra_id = p_compra_id and ci.producto_id is not null
      group by ci.producto_id
    loop
      update public.orden_compra_items oci
         set cantidad_recibida = greatest(oci.cantidad_recibida - v_item.cantidad, 0)
       where oci.orden_compra_id = v_c.orden_compra_id
         and oci.producto_id = v_item.producto_id;
    end loop;

    update public.ordenes_compra oc
       set estado = case
             when not exists (
               select 1 from public.orden_compra_items x
               where x.orden_compra_id = oc.id and x.cantidad_recibida > 0
             ) then 'EMITIDA'
             when exists (
               select 1 from public.orden_compra_items x
               where x.orden_compra_id = oc.id and x.cantidad_recibida < x.cantidad
             ) then 'RECIBIDA_PARCIAL'
             else 'RECIBIDA'
           end::estado_orden_compra
     where oc.id = v_c.orden_compra_id
       and oc.estado <> 'ANULADA';
  end if;

  update public.compras
     set estado = 'ANULADA',
         observaciones = coalesce(observaciones || ' · ', '') || 'ANULADA: ' || btrim(p_motivo)
   where id = p_compra_id;

  return p_compra_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Consultas de apoyo
-- ---------------------------------------------------------------------

-- Renglones pendientes de recibir de una orden de compra, para
-- precargar la factura de proveedor.
create or replace function public.pendiente_orden_compra(p_orden_compra_id uuid)
returns table (
  producto_id       uuid,
  descripcion       text,
  cantidad          numeric,
  cantidad_recibida numeric,
  pendiente         numeric,
  precio_unitario   numeric,
  alicuota_iva      numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    oci.producto_id,
    oci.descripcion,
    oci.cantidad,
    oci.cantidad_recibida,
    (oci.cantidad - oci.cantidad_recibida)::numeric(15,4),
    oci.precio_unitario,
    oci.alicuota_iva
  from public.orden_compra_items oci
  join public.ordenes_compra oc on oc.id = oci.orden_compra_id
  where oci.orden_compra_id = p_orden_compra_id
    and public.es_miembro(oc.empresa_id)
    and oci.cantidad_recibida < oci.cantidad
  order by oci.orden
$$;

-- ---------------------------------------------------------------------
-- 8. Permisos
-- ---------------------------------------------------------------------
do $$
declare
  f text;
  firmas text[] := array[
    'public.siguiente_numero_orden_compra(uuid)',
    'public.crear_orden_compra_borrador(jsonb)',
    'public.actualizar_orden_compra_borrador(uuid, jsonb)',
    'public.emitir_orden_compra(uuid)',
    'public.anular_orden_compra(uuid, text)',
    'public.aplicar_stock_compra(uuid)',
    'public.aplicar_cta_cte_compra(uuid)',
    'public.imputar_recepcion_orden_compra(uuid)',
    'public.registrar_compra(jsonb)',
    'public.anular_compra(uuid, text)',
    'public.pendiente_orden_compra(uuid)'
  ];
begin
  foreach f in array firmas loop
    execute format('revoke execute on function %s from anon, public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- Las funciones de efectos son piezas internas: no se invocan sueltas.
revoke execute on function public.aplicar_stock_compra(uuid) from authenticated;
revoke execute on function public.aplicar_cta_cte_compra(uuid) from authenticated;
revoke execute on function public.imputar_recepcion_orden_compra(uuid) from authenticated;
revoke execute on function public.siguiente_numero_orden_compra(uuid) from authenticated;

-- ---------------------------------------------------------------------
-- 9. Índices para el listado de compras
-- ---------------------------------------------------------------------
create index if not exists compras_listado_idx
  on compras (empresa_id, fecha_emision desc, creado_en desc);

create index if not exists ordenes_compra_listado_idx
  on ordenes_compra (empresa_id, fecha desc, numero desc);

create index if not exists orden_compra_items_producto_idx
  on orden_compra_items (orden_compra_id, producto_id);

create index if not exists cta_cte_proveedor_idx
  on cta_cte_movimientos (empresa_id, entidad_tipo, entidad_id, fecha desc);
