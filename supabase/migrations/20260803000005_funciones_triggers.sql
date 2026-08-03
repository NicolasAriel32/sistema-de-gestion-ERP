-- =====================================================================
-- GestiónPyme · FASE 0 — Tenencia, numeración e inmutabilidad
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de tenencia. SECURITY DEFINER para no recursar sobre las
-- políticas RLS de usuarios_empresa.
-- ---------------------------------------------------------------------
create or replace function public.empresas_del_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ue.empresa_id
  from public.usuarios_empresa ue
  where ue.usuario_id = auth.uid()
    and ue.activo
$$;

comment on function public.empresas_del_usuario() is
  'Empresas activas del usuario autenticado. Base de todas las politicas RLS.';

create or replace function public.es_miembro(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios_empresa ue
    where ue.usuario_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and ue.activo
  )
$$;

create or replace function public.tiene_rol(p_empresa_id uuid, p_roles rol_usuario[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios_empresa ue
    where ue.usuario_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and ue.activo
      and ue.rol = any(p_roles)
  )
$$;

-- ---------------------------------------------------------------------
-- NUMERACIÓN: contador por (empresa, punto de venta, tipo) con lock de
-- fila. Prohibido MAX(numero)+1 desde la aplicación.
--
-- Se llama DENTRO de la transacción que inserta el comprobante: si la
-- autorización falla y la transacción vuelve atrás, el número no se
-- consume. Eso garantiza correlatividad sin huecos.
-- ---------------------------------------------------------------------
create or replace function public.siguiente_numero_comprobante(
  p_empresa_id     uuid,
  p_punto_venta_id uuid,
  p_tipo           tipo_comprobante
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero bigint;
begin
  if not public.es_miembro(p_empresa_id) then
    raise exception 'Sin acceso a la empresa %', p_empresa_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.comprobante_contadores
    (empresa_id, punto_venta_id, tipo_comprobante, ultimo_numero)
  values (p_empresa_id, p_punto_venta_id, p_tipo, 0)
  on conflict (empresa_id, punto_venta_id, tipo_comprobante) do nothing;

  -- El FOR UPDATE serializa las emisiones concurrentes del mismo talonario.
  select cc.ultimo_numero + 1
    into v_numero
  from public.comprobante_contadores cc
  where cc.empresa_id = p_empresa_id
    and cc.punto_venta_id = p_punto_venta_id
    and cc.tipo_comprobante = p_tipo
  for update;

  update public.comprobante_contadores
     set ultimo_numero = v_numero,
         actualizado_en = now()
   where empresa_id = p_empresa_id
     and punto_venta_id = p_punto_venta_id
     and tipo_comprobante = p_tipo;

  return v_numero;
end;
$$;

comment on function public.siguiente_numero_comprobante(uuid, uuid, tipo_comprobante) is
  'Asigna el siguiente numero correlativo con lock de fila. Usar siempre dentro de la transaccion de emision.';

-- ---------------------------------------------------------------------
-- INMUTABILIDAD
-- ---------------------------------------------------------------------

-- Tablas append-only: ni UPDATE ni DELETE. El trigger cubre incluso a
-- las conexiones que evaden RLS (service role, migraciones).
create or replace function public.impedir_modificacion()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La tabla % es de solo insercion: % no esta permitido', TG_TABLE_NAME, TG_OP
    using errcode = 'restrict_violation';
end;
$$;

create trigger stock_movimientos_append_only
  before update or delete on stock_movimientos
  for each row execute function public.impedir_modificacion();

create trigger cta_cte_movimientos_append_only
  before update or delete on cta_cte_movimientos
  for each row execute function public.impedir_modificacion();

create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function public.impedir_modificacion();

create trigger movimientos_caja_append_only
  before update or delete on movimientos_caja
  for each row execute function public.impedir_modificacion();

-- Un comprobante fuera de BORRADOR no admite cambios de importes ni de
-- identificación fiscal. Sólo puede evolucionar su estado y sus datos
-- de autorización.
create or replace function public.bloquear_cambios_comprobante_emitido()
returns trigger
language plpgsql
as $$
begin
  if OLD.estado = 'BORRADOR' then
    return NEW;
  end if;

  if (NEW.tipo_comprobante, NEW.punto_venta_id, NEW.numero, NEW.letra,
      NEW.fecha_emision, NEW.cliente_id, NEW.moneda, NEW.cotizacion,
      NEW.neto_gravado, NEW.neto_no_gravado, NEW.exento,
      NEW.iva_105, NEW.iva_21, NEW.iva_27, NEW.otros_impuestos,
      NEW.descuento_porcentaje, NEW.descuento_importe, NEW.total)
     is distinct from
     (OLD.tipo_comprobante, OLD.punto_venta_id, OLD.numero, OLD.letra,
      OLD.fecha_emision, OLD.cliente_id, OLD.moneda, OLD.cotizacion,
      OLD.neto_gravado, OLD.neto_no_gravado, OLD.exento,
      OLD.iva_105, OLD.iva_21, OLD.iva_27, OLD.otros_impuestos,
      OLD.descuento_porcentaje, OLD.descuento_importe, OLD.total)
  then
    raise exception
      'El comprobante % esta en estado %: no admite modificacion de importes ni de identificacion fiscal. Para revertirlo, emitir una nota de credito.',
      OLD.id, OLD.estado
      using errcode = 'restrict_violation';
  end if;

  return NEW;
end;
$$;

create trigger comprobantes_inmutables
  before update on comprobantes
  for each row execute function public.bloquear_cambios_comprobante_emitido();

-- Un comprobante emitido no se borra jamás.
create or replace function public.bloquear_delete_comprobante()
returns trigger
language plpgsql
as $$
begin
  if OLD.estado <> 'BORRADOR' then
    raise exception
      'El comprobante % esta en estado % y no puede eliminarse. Se anula con una nota de credito.',
      OLD.id, OLD.estado
      using errcode = 'restrict_violation';
  end if;
  return OLD;
end;
$$;

create trigger comprobantes_no_se_borran
  before delete on comprobantes
  for each row execute function public.bloquear_delete_comprobante();

-- Los ítems siguen la suerte de su cabecera.
create or replace function public.bloquear_items_de_comprobante_emitido()
returns trigger
language plpgsql
as $$
declare
  v_estado estado_comprobante;
  v_comprobante_id uuid := coalesce(NEW.comprobante_id, OLD.comprobante_id);
begin
  select c.estado into v_estado from public.comprobantes c where c.id = v_comprobante_id;

  if v_estado is not null and v_estado <> 'BORRADOR' then
    raise exception
      'El comprobante % no esta en borrador: sus items no pueden modificarse.', v_comprobante_id
      using errcode = 'restrict_violation';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger comprobante_items_inmutables
  before insert or update or delete on comprobante_items
  for each row execute function public.bloquear_items_de_comprobante_emitido();

-- Una sesión de caja cerrada es inmutable.
create or replace function public.bloquear_caja_sesion_cerrada()
returns trigger
language plpgsql
as $$
begin
  if OLD.estado = 'CERRADA' then
    raise exception 'La sesion de caja % esta cerrada y no admite modificaciones.', OLD.id
      using errcode = 'restrict_violation';
  end if;
  return NEW;
end;
$$;

create trigger caja_sesiones_cierre_inmutable
  before update on caja_sesiones
  for each row execute function public.bloquear_caja_sesion_cerrada();

-- ---------------------------------------------------------------------
-- Coherencia de tenencia: un ítem no puede pertenecer a una empresa
-- distinta de la de su cabecera.
-- ---------------------------------------------------------------------
create or replace function public.validar_empresa_de_comprobante_item()
returns trigger
language plpgsql
as $$
declare
  v_empresa_id uuid;
begin
  select c.empresa_id into v_empresa_id
  from public.comprobantes c where c.id = NEW.comprobante_id;

  if v_empresa_id is distinct from NEW.empresa_id then
    raise exception 'El item pertenece a una empresa distinta de la del comprobante.'
      using errcode = 'integrity_constraint_violation';
  end if;

  return NEW;
end;
$$;

create trigger comprobante_items_empresa_coherente
  before insert or update on comprobante_items
  for each row execute function public.validar_empresa_de_comprobante_item();

-- ---------------------------------------------------------------------
-- Saldos de stock derivados de los movimientos: única fuente de verdad.
-- Nunca se persiste un saldo.
-- ---------------------------------------------------------------------
create or replace view stock_saldos
with (security_invoker = true)
as
  select
    sm.empresa_id,
    sm.producto_id,
    sm.deposito_id,
    sum(sm.cantidad)::numeric(15,4) as saldo,
    max(sm.fecha)                   as ultimo_movimiento
  from stock_movimientos sm
  group by sm.empresa_id, sm.producto_id, sm.deposito_id;

create or replace function public.saldo_stock(p_producto_id uuid, p_deposito_id uuid default null)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(sm.cantidad), 0)::numeric(15,4)
  from public.stock_movimientos sm
  where sm.producto_id = p_producto_id
    and (p_deposito_id is null or sm.deposito_id = p_deposito_id)
$$;
