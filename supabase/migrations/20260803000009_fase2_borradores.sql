-- =====================================================================
-- GestiónPyme · FASE 2 — Alta y edición de borradores
--
-- Cabecera e ítems se escriben en una sola transacción. Sin esto, un
-- fallo entre el insert de la cabecera y el de los renglones dejaría un
-- comprobante huérfano; con esto, o entra todo o no entra nada.
--
-- Los importes los calcula el motor de TypeScript (`/lib/domain`) y
-- viajan ya resueltos. La base no los recalcula, pero los verifica antes
-- de emitir en `validar_importes_comprobante`.
-- =====================================================================

create or replace function public.crear_comprobante_borrador(p_datos jsonb)
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

  if not public.tiene_rol(v_empresa, array['ADMIN','VENDEDOR']::rol_usuario[]) then
    raise exception 'Tu rol no puede crear comprobantes de venta.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_datos->'items', '[]'::jsonb)) = 0 then
    raise exception 'El comprobante necesita al menos un renglón.'
      using errcode = 'integrity_constraint_violation';
  end if;

  insert into public.comprobantes (
    empresa_id, tipo_comprobante, punto_venta_id, numero, letra,
    fecha_emision, fecha_vencimiento,
    cliente_id, vendedor_id, deposito_id, lista_precio_id, condicion_venta,
    neto_gravado, neto_no_gravado, exento, iva_105, iva_21, iva_27,
    otros_impuestos, descuento_porcentaje, descuento_importe, total,
    estado, comprobante_origen_id, observaciones, creado_por
  )
  values (
    v_empresa,
    (p_datos->>'tipo_comprobante')::tipo_comprobante,
    (p_datos->>'punto_venta_id')::uuid,
    null,                                        -- el borrador no ocupa número
    (p_datos->>'letra')::letra_comprobante,
    coalesce((p_datos->>'fecha_emision')::date,
             (now() at time zone 'America/Argentina/Buenos_Aires')::date),
    (p_datos->>'fecha_vencimiento')::date,
    (p_datos->>'cliente_id')::uuid,
    coalesce((p_datos->>'vendedor_id')::uuid, auth.uid()),
    (p_datos->>'deposito_id')::uuid,
    (p_datos->>'lista_precio_id')::uuid,
    coalesce((p_datos->>'condicion_venta')::condicion_venta, 'CONTADO'),
    coalesce((p_datos->>'neto_gravado')::numeric, 0),
    coalesce((p_datos->>'neto_no_gravado')::numeric, 0),
    coalesce((p_datos->>'exento')::numeric, 0),
    coalesce((p_datos->>'iva_105')::numeric, 0),
    coalesce((p_datos->>'iva_21')::numeric, 0),
    coalesce((p_datos->>'iva_27')::numeric, 0),
    coalesce((p_datos->>'otros_impuestos')::numeric, 0),
    coalesce((p_datos->>'descuento_porcentaje')::numeric, 0),
    coalesce((p_datos->>'descuento_importe')::numeric, 0),
    coalesce((p_datos->>'total')::numeric, 0),
    'BORRADOR',
    (p_datos->>'comprobante_origen_id')::uuid,
    nullif(btrim(coalesce(p_datos->>'observaciones','')), ''),
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_datos->'items') loop
    v_orden := v_orden + 1;
    insert into public.comprobante_items (
      empresa_id, comprobante_id, orden, producto_id, descripcion, cantidad,
      precio_unitario, descuento_porcentaje, alicuota_iva,
      subtotal_neto, subtotal_iva, subtotal
    )
    values (
      v_empresa, v_id, v_orden,
      (v_item->>'producto_id')::uuid,
      v_item->>'descripcion',
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric,
      coalesce((v_item->>'descuento_porcentaje')::numeric, 0),
      (v_item->>'alicuota_iva')::numeric,
      (v_item->>'subtotal_neto')::numeric,
      (v_item->>'subtotal_iva')::numeric,
      (v_item->>'subtotal')::numeric
    );
  end loop;

  return v_id;
end;
$$;

comment on function public.crear_comprobante_borrador(jsonb) is
  'Alta atomica de cabecera + renglones. El borrador nace sin numero.';

-- ---------------------------------------------------------------------
-- Edición de un borrador: se reemplazan todos los renglones.
--
-- El trigger `comprobante_items_inmutables` sólo lo permite mientras la
-- cabecera está en BORRADOR, así que un comprobante emitido no puede
-- llegar acá aunque se lo pidan.
-- ---------------------------------------------------------------------
create or replace function public.actualizar_comprobante_borrador(
  p_comprobante_id uuid,
  p_datos          jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     comprobantes%rowtype;
  v_item  jsonb;
  v_orden int := 0;
begin
  select * into v_c from public.comprobantes where id = p_comprobante_id for update;

  if v_c.id is null then
    raise exception 'El comprobante no existe.' using errcode = 'no_data_found';
  end if;

  if not public.tiene_rol(v_c.empresa_id, array['ADMIN','VENDEDOR']::rol_usuario[]) then
    raise exception 'Tu rol no puede editar comprobantes de venta.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_c.estado <> 'BORRADOR' then
    raise exception
      'El comprobante está en estado % y no se puede editar. Para corregirlo, emitir una nota de crédito.',
      v_c.estado
      using errcode = 'restrict_violation';
  end if;

  if jsonb_array_length(coalesce(p_datos->'items', '[]'::jsonb)) = 0 then
    raise exception 'El comprobante necesita al menos un renglón.'
      using errcode = 'integrity_constraint_violation';
  end if;

  update public.comprobantes set
    tipo_comprobante     = coalesce((p_datos->>'tipo_comprobante')::tipo_comprobante, tipo_comprobante),
    punto_venta_id       = coalesce((p_datos->>'punto_venta_id')::uuid, punto_venta_id),
    letra                = coalesce((p_datos->>'letra')::letra_comprobante, letra),
    fecha_emision        = coalesce((p_datos->>'fecha_emision')::date, fecha_emision),
    fecha_vencimiento    = (p_datos->>'fecha_vencimiento')::date,
    cliente_id           = coalesce((p_datos->>'cliente_id')::uuid, cliente_id),
    deposito_id          = (p_datos->>'deposito_id')::uuid,
    lista_precio_id      = (p_datos->>'lista_precio_id')::uuid,
    condicion_venta      = coalesce((p_datos->>'condicion_venta')::condicion_venta, condicion_venta),
    neto_gravado         = coalesce((p_datos->>'neto_gravado')::numeric, 0),
    neto_no_gravado      = coalesce((p_datos->>'neto_no_gravado')::numeric, 0),
    exento               = coalesce((p_datos->>'exento')::numeric, 0),
    iva_105              = coalesce((p_datos->>'iva_105')::numeric, 0),
    iva_21               = coalesce((p_datos->>'iva_21')::numeric, 0),
    iva_27               = coalesce((p_datos->>'iva_27')::numeric, 0),
    otros_impuestos      = coalesce((p_datos->>'otros_impuestos')::numeric, 0),
    descuento_porcentaje = coalesce((p_datos->>'descuento_porcentaje')::numeric, 0),
    descuento_importe    = coalesce((p_datos->>'descuento_importe')::numeric, 0),
    total                = coalesce((p_datos->>'total')::numeric, 0),
    observaciones        = nullif(btrim(coalesce(p_datos->>'observaciones','')), '')
  where id = p_comprobante_id;

  delete from public.comprobante_items where comprobante_id = p_comprobante_id;

  for v_item in select * from jsonb_array_elements(p_datos->'items') loop
    v_orden := v_orden + 1;
    insert into public.comprobante_items (
      empresa_id, comprobante_id, orden, producto_id, descripcion, cantidad,
      precio_unitario, descuento_porcentaje, alicuota_iva,
      subtotal_neto, subtotal_iva, subtotal
    )
    values (
      v_c.empresa_id, p_comprobante_id, v_orden,
      (v_item->>'producto_id')::uuid,
      v_item->>'descripcion',
      (v_item->>'cantidad')::numeric,
      (v_item->>'precio_unitario')::numeric,
      coalesce((v_item->>'descuento_porcentaje')::numeric, 0),
      (v_item->>'alicuota_iva')::numeric,
      (v_item->>'subtotal_neto')::numeric,
      (v_item->>'subtotal_iva')::numeric,
      (v_item->>'subtotal')::numeric
    );
  end loop;

  return p_comprobante_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Saldo de stock por producto y depósito, para la pantalla de emisión.
-- Devuelve una fila por depósito con existencias.
-- ---------------------------------------------------------------------
create or replace function public.saldos_de_productos(
  p_empresa_id  uuid,
  p_producto_ids uuid[],
  p_deposito_id uuid default null
)
returns table (producto_id uuid, deposito_id uuid, saldo numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sm.producto_id, sm.deposito_id, sum(sm.cantidad)::numeric(15,4)
  from public.stock_movimientos sm
  where sm.empresa_id = p_empresa_id
    and public.es_miembro(p_empresa_id)
    and sm.producto_id = any(p_producto_ids)
    and (p_deposito_id is null or sm.deposito_id = p_deposito_id)
  group by sm.producto_id, sm.deposito_id
$$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
do $$
declare
  f text;
  firmas text[] := array[
    'public.crear_comprobante_borrador(jsonb)',
    'public.actualizar_comprobante_borrador(uuid, jsonb)',
    'public.saldos_de_productos(uuid, uuid[], uuid)'
  ];
begin
  foreach f in array firmas loop
    execute format('revoke execute on function %s from anon, public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
