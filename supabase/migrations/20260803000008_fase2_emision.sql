-- =====================================================================
-- GestiónPyme · FASE 2 — Emisión de comprobantes
--
-- Resuelve las dos reglas que están en tensión:
--
--   a) La numeración es correlativa y sin huecos.
--   b) Un intento de autorización fallido NUNCA consume número.
--
-- Estrategia: mientras el comprobante está en BORRADOR no tiene número
-- (`numero` pasa a ser nullable). El número se asigna recién en
-- `confirmar_emision_comprobante`, que se invoca DESPUÉS de que el
-- proveedor devolvió el CAE, dentro de una única transacción que además
-- mueve stock y cuenta corriente. Si el proveedor falla, no hubo escritura
-- del contador: el comprobante sigue en borrador, sin número.
--
-- Bajo emisiones concurrentes, dos transacciones pueden pedir autorización
-- para el mismo número tentativo. La que llega segunda recibe un error de
-- serialización (SQLSTATE 40001) y la aplicación reintenta con el número
-- siguiente, volviendo a pedir autorización. El resultado es una serie
-- correlativa sin huecos y sin números quemados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El borrador no ocupa número
-- ---------------------------------------------------------------------
alter table comprobantes alter column numero drop not null;

-- El UNIQUE (empresa, punto_venta, tipo, numero) ignora los NULL, así que
-- pueden convivir muchos borradores del mismo talonario.
alter table comprobantes
  add constraint comprobantes_numero_segun_estado
  check (estado = 'BORRADOR' or numero is not null);

-- Un comprobante fiscal emitido sin CAE es un comprobante inválido.
alter table comprobantes
  add constraint comprobantes_cae_si_es_fiscal
  check (
    estado <> 'EMITIDO'
    or tipo_comprobante in ('PRESUPUESTO','PEDIDO','REMITO')
    or cae is not null
  );

-- ---------------------------------------------------------------------
-- 2. Contadores: consulta, sincronización con el organismo
-- ---------------------------------------------------------------------

-- Sólo lectura: sirve para proponer el número tentativo con el que se
-- pide el CAE. No bloquea ni reserva nada.
create or replace function public.proximo_numero_tentativo(
  p_empresa_id     uuid,
  p_punto_venta_id uuid,
  p_tipo           tipo_comprobante
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ultimo bigint;
begin
  if not public.es_miembro(p_empresa_id) then
    raise exception 'Sin acceso a la empresa %', p_empresa_id
      using errcode = 'insufficient_privilege';
  end if;

  select cc.ultimo_numero into v_ultimo
  from public.comprobante_contadores cc
  where cc.empresa_id = p_empresa_id
    and cc.punto_venta_id = p_punto_venta_id
    and cc.tipo_comprobante = p_tipo;

  return coalesce(v_ultimo, 0) + 1;
end;
$$;

comment on function public.proximo_numero_tentativo(uuid, uuid, tipo_comprobante) is
  'Numero tentativo para pedir autorizacion. No reserva: la reserva ocurre en confirmar_emision_comprobante.';

-- Alinea el contador local con el último número que informa el organismo.
-- Contra ARCA real la numeración la manda AFIP, no nuestra base: si AFIP
-- dice que el último autorizado es el 1200 y acá figura el 1150, el
-- contador se adelanta. Nunca retrocede.
create or replace function public.sincronizar_contador_comprobante(
  p_empresa_id     uuid,
  p_punto_venta_id uuid,
  p_tipo           tipo_comprobante,
  p_ultimo_numero  bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado bigint;
begin
  if not public.es_miembro(p_empresa_id) then
    raise exception 'Sin acceso a la empresa %', p_empresa_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.comprobante_contadores
    (empresa_id, punto_venta_id, tipo_comprobante, ultimo_numero)
  values (p_empresa_id, p_punto_venta_id, p_tipo, greatest(p_ultimo_numero, 0))
  on conflict (empresa_id, punto_venta_id, tipo_comprobante) do update
    set ultimo_numero  = greatest(comprobante_contadores.ultimo_numero, excluded.ultimo_numero),
        actualizado_en = now()
  returning ultimo_numero into v_resultado;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Qué comprobantes tocan el stock
--
--   FACTURA  → descuenta, salvo que ya lo haya descontado su remito.
--   REMITO   → descuenta (la mercadería sale con el remito).
--   NC       → devuelve, sólo si el comprobante de origen había movido.
--   ND       → no toca stock (es un ajuste de importe).
--   PRESUP.  → no toca stock.
--   PEDIDO   → no toca stock (reservar es post-MVP).
-- ---------------------------------------------------------------------
create or replace function public.mueve_stock(p_tipo tipo_comprobante)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_tipo in ('FACTURA_A','FACTURA_B','FACTURA_C','REMITO','NC_A','NC_B','NC_C')
$$;

create or replace function public.es_nota_credito(p_tipo tipo_comprobante)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_tipo in ('NC_A','NC_B','NC_C')
$$;

create or replace function public.es_fiscal(p_tipo tipo_comprobante)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_tipo not in ('PRESUPUESTO','PEDIDO','REMITO')
$$;

-- ---------------------------------------------------------------------
-- 4. Saldo de cuenta corriente, derivado de los movimientos
-- ---------------------------------------------------------------------
create or replace function public.saldo_cta_cte(
  p_entidad_tipo entidad_tipo,
  p_entidad_id   uuid
)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(m.debe) - sum(m.haber), 0)::numeric(15,2)
  from public.cta_cte_movimientos m
  where m.entidad_tipo = p_entidad_tipo
    and m.entidad_id = p_entidad_id
$$;

-- ---------------------------------------------------------------------
-- 5. Validación de coherencia de importes
--
-- El motor de cálculo vive en TypeScript, pero la base no confía en la
-- aplicación: antes de emitir verifica que la cabecera cierre contra sus
-- renglones. Si no cierra, el comprobante no sale.
-- ---------------------------------------------------------------------
create or replace function public.validar_importes_comprobante(p_comprobante_id uuid)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_c            comprobantes%rowtype;
  v_suma_items   numeric(15,2);
  v_suma_cabecera numeric(15,2);
  v_cantidad_items int;
begin
  select * into v_c from public.comprobantes where id = p_comprobante_id;

  select count(*), coalesce(sum(ci.subtotal), 0)
    into v_cantidad_items, v_suma_items
  from public.comprobante_items ci
  where ci.comprobante_id = p_comprobante_id;

  if v_cantidad_items = 0 then
    raise exception 'El comprobante no tiene renglones cargados.'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_suma_items <> v_c.total then
    raise exception
      'Los importes no cierran: los renglones suman % y la cabecera dice %.',
      v_suma_items, v_c.total
      using errcode = 'integrity_constraint_violation';
  end if;

  v_suma_cabecera := v_c.neto_gravado + v_c.neto_no_gravado + v_c.exento
                   + v_c.iva_105 + v_c.iva_21 + v_c.iva_27 + v_c.otros_impuestos;

  if v_suma_cabecera <> v_c.total then
    raise exception
      'Los importes no cierran: neto + IVA + impuestos suman % y el total dice %.',
      v_suma_cabecera, v_c.total
      using errcode = 'integrity_constraint_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Efectos de la emisión: stock y cuenta corriente
-- ---------------------------------------------------------------------
create or replace function public.aplicar_stock_comprobante(p_comprobante_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_c              comprobantes%rowtype;
  v_item           record;
  v_signo          int;
  v_tipo_mov       tipo_movimiento_stock;
  v_saldo          numeric(15,4);
  v_origen_remito  boolean := false;
  v_origen_movio   boolean := false;
begin
  select * into v_c from public.comprobantes where id = p_comprobante_id;

  if not public.mueve_stock(v_c.tipo_comprobante) then
    return;
  end if;

  -- Una factura que nace de un remito ya emitido no vuelve a descontar:
  -- la mercadería salió con el remito.
  if v_c.comprobante_origen_id is not null and not public.es_nota_credito(v_c.tipo_comprobante) then
    select exists (
      select 1 from public.comprobantes o
      where o.id = v_c.comprobante_origen_id
        and o.tipo_comprobante = 'REMITO'
        and o.estado <> 'BORRADOR'
    ) into v_origen_remito;

    if v_origen_remito then
      return;
    end if;
  end if;

  if public.es_nota_credito(v_c.tipo_comprobante) then
    -- La NC devuelve stock sólo si el comprobante que anula lo había movido.
    select exists (
      select 1 from public.stock_movimientos sm
      where sm.comprobante_id = v_c.comprobante_origen_id
    ) into v_origen_movio;

    if not v_origen_movio then
      return;
    end if;

    v_signo := 1;
    v_tipo_mov := 'DEVOLUCION_CLIENTE';
  else
    v_signo := -1;
    v_tipo_mov := 'VENTA';
  end if;

  if v_c.deposito_id is null then
    raise exception
      'El comprobante mueve stock pero no tiene depósito asignado. Elegí un depósito antes de emitir.'
      using errcode = 'integrity_constraint_violation';
  end if;

  for v_item in
    select ci.producto_id, ci.cantidad, ci.descripcion,
           p.nombre, p.codigo, p.maneja_stock, p.permite_venta_sin_stock, p.precio_costo
    from public.comprobante_items ci
    join public.productos p on p.id = ci.producto_id
    where ci.comprobante_id = p_comprobante_id
    order by ci.orden
  loop
    if not v_item.maneja_stock then
      continue;
    end if;

    if v_signo = -1 and not v_item.permite_venta_sin_stock then
      select coalesce(sum(sm.cantidad), 0)::numeric(15,4) into v_saldo
      from public.stock_movimientos sm
      where sm.producto_id = v_item.producto_id
        and sm.deposito_id = v_c.deposito_id;

      if v_saldo < v_item.cantidad then
        raise exception
          'No se pudo emitir: no hay stock suficiente de "% (%)". Disponible: %, necesario: %.',
          v_item.nombre, v_item.codigo, v_saldo, v_item.cantidad
          using errcode = 'integrity_constraint_violation';
      end if;
    end if;

    insert into public.stock_movimientos
      (empresa_id, producto_id, deposito_id, tipo, cantidad,
       costo_unitario, comprobante_id, usuario_id)
    values
      (v_c.empresa_id, v_item.producto_id, v_c.deposito_id, v_tipo_mov,
       v_signo * v_item.cantidad, v_item.precio_costo, p_comprobante_id, auth.uid());
  end loop;
end;
$$;

create or replace function public.aplicar_cta_cte_comprobante(
  p_comprobante_id uuid,
  p_forzar_credito boolean default false
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_c        comprobantes%rowtype;
  v_cliente  clientes%rowtype;
  v_saldo    numeric(15,2);
  v_concepto text;
begin
  select * into v_c from public.comprobantes where id = p_comprobante_id;

  if v_c.condicion_venta <> 'CUENTA_CORRIENTE' then
    return;
  end if;

  if v_c.tipo_comprobante in ('PRESUPUESTO','PEDIDO','REMITO') then
    return;
  end if;

  select * into v_cliente from public.clientes where id = v_c.cliente_id;

  v_concepto := replace(v_c.tipo_comprobante::text, '_', ' ') || ' ' ||
                lpad(coalesce((select pv.numero from public.puntos_venta pv
                               where pv.id = v_c.punto_venta_id)::text, '0'), 5, '0') ||
                '-' || lpad(v_c.numero::text, 8, '0');

  if public.es_nota_credito(v_c.tipo_comprobante) then
    -- La nota de crédito descarga la deuda del cliente.
    insert into public.cta_cte_movimientos
      (empresa_id, entidad_tipo, entidad_id, fecha, fecha_vencimiento,
       concepto, comprobante_id, debe, haber, usuario_id)
    values
      (v_c.empresa_id, 'CLIENTE', v_c.cliente_id, v_c.fecha_emision, null,
       v_concepto, p_comprobante_id, 0, v_c.total, auth.uid());
    return;
  end if;

  -- Límite de crédito: advertencia bloqueante. Sólo un ADMIN la saltea.
  if v_cliente.limite_credito > 0 then
    v_saldo := public.saldo_cta_cte('CLIENTE', v_c.cliente_id);

    if v_saldo + v_c.total > v_cliente.limite_credito then
      if not p_forzar_credito then
        raise exception
          'No se pudo emitir: el cliente % supera su límite de crédito de $%. Saldo actual $%, este comprobante $%.',
          v_cliente.razon_social,
          to_char(v_cliente.limite_credito, 'FM999G999G999D00'),
          to_char(v_saldo, 'FM999G999G999D00'),
          to_char(v_c.total, 'FM999G999G999D00')
          using errcode = 'check_violation';
      end if;

      if not public.tiene_rol(v_c.empresa_id, array['ADMIN']::rol_usuario[]) then
        raise exception
          'Sólo un administrador puede emitir por encima del límite de crédito del cliente.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  insert into public.cta_cte_movimientos
    (empresa_id, entidad_tipo, entidad_id, fecha, fecha_vencimiento,
     concepto, comprobante_id, debe, haber, usuario_id)
  values
    (v_c.empresa_id, 'CLIENTE', v_c.cliente_id, v_c.fecha_emision, v_c.fecha_vencimiento,
     v_concepto, p_comprobante_id, v_c.total, 0, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- 7. CONFIRMACIÓN DE EMISIÓN — el corazón de la fase
--
-- Se llama con el CAE ya en la mano. Todo lo que sigue ocurre en una sola
-- transacción: o queda el comprobante emitido con su número, su stock y su
-- cuenta corriente, o no queda nada.
-- ---------------------------------------------------------------------
do $$
begin
  create type resultado_emision as (
    comprobante_id uuid,
    numero         bigint,
    letra          letra_comprobante,
    estado         estado_comprobante
  );
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.confirmar_emision_comprobante(
  p_comprobante_id  uuid,
  p_numero          bigint,
  p_cae             text default null,
  p_cae_vencimiento date default null,
  p_afip_estado     text default null,
  p_forzar_credito  boolean default false
)
returns resultado_emision
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c        comprobantes%rowtype;
  v_esperado bigint;
  v_result   resultado_emision;
begin
  -- Lock de la cabecera: dos emisiones del mismo comprobante se serializan.
  select * into v_c
  from public.comprobantes
  where id = p_comprobante_id
  for update;

  if v_c.id is null then
    raise exception 'El comprobante no existe.' using errcode = 'no_data_found';
  end if;

  if not public.tiene_rol(v_c.empresa_id, array['ADMIN','VENDEDOR']::rol_usuario[]) then
    raise exception 'Tu rol no puede emitir comprobantes.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_c.estado <> 'BORRADOR' then
    raise exception 'El comprobante ya fue emitido (estado %).', v_c.estado
      using errcode = 'restrict_violation';
  end if;

  if public.es_fiscal(v_c.tipo_comprobante) and p_cae is null then
    raise exception 'No se puede emitir un comprobante fiscal sin CAE.'
      using errcode = 'integrity_constraint_violation';
  end if;

  perform public.validar_importes_comprobante(p_comprobante_id);

  -- Reserva del número. El FOR UPDATE serializa el talonario.
  insert into public.comprobante_contadores
    (empresa_id, punto_venta_id, tipo_comprobante, ultimo_numero)
  values (v_c.empresa_id, v_c.punto_venta_id, v_c.tipo_comprobante, 0)
  on conflict (empresa_id, punto_venta_id, tipo_comprobante) do nothing;

  select cc.ultimo_numero + 1 into v_esperado
  from public.comprobante_contadores cc
  where cc.empresa_id = v_c.empresa_id
    and cc.punto_venta_id = v_c.punto_venta_id
    and cc.tipo_comprobante = v_c.tipo_comprobante
  for update;

  -- El contador lo está creando otra transacción todavía sin confirmar.
  -- No se puede saber qué número corresponde: que la aplicación reintente.
  if v_esperado is null then
    raise exception 'El talonario está siendo inicializado por otra emisión. Reintentando.'
      using errcode = '40001';
  end if;

  -- El CAE se pidió para p_numero. Si otra emisión concurrente se quedó
  -- con ese número, no se puede reusar el CAE: 40001 le avisa a la
  -- aplicación que reintente pidiendo autorización para el siguiente.
  if p_numero <> v_esperado then
    raise exception
      'El número % ya fue tomado por otra emisión (corresponde el %). Reintentando.',
      p_numero, v_esperado
      using errcode = '40001';
  end if;

  update public.comprobante_contadores
     set ultimo_numero = v_esperado,
         actualizado_en = now()
   where empresa_id = v_c.empresa_id
     and punto_venta_id = v_c.punto_venta_id
     and tipo_comprobante = v_c.tipo_comprobante;

  update public.comprobantes
     set numero          = v_esperado,
         cae             = p_cae,
         cae_vencimiento = p_cae_vencimiento,
         afip_estado     = p_afip_estado,
         afip_observaciones = null,
         estado          = 'EMITIDO'
   where id = p_comprobante_id;

  -- A partir de acá el comprobante ya no está en BORRADOR: los efectos
  -- se aplican con el número definitivo disponible.
  perform public.aplicar_stock_comprobante(p_comprobante_id);
  perform public.aplicar_cta_cte_comprobante(p_comprobante_id, p_forzar_credito);

  -- Una nota de crédito anula su comprobante de origen.
  if public.es_nota_credito(v_c.tipo_comprobante) then
    update public.comprobantes
       set estado = 'ANULADO'
     where id = v_c.comprobante_origen_id
       and estado not in ('ANULADO','BORRADOR');
  end if;

  v_result := (p_comprobante_id, v_esperado, v_c.letra, 'EMITIDO'::estado_comprobante);
  return v_result;
end;
$$;

comment on function public.confirmar_emision_comprobante(uuid, bigint, text, date, text, boolean) is
  'Asigna numero, CAE, stock y cuenta corriente en una sola transaccion. Invocar SOLO con el CAE ya obtenido.';

-- ---------------------------------------------------------------------
-- 8. Comprobantes internos: no pasan por AFIP
-- ---------------------------------------------------------------------
create or replace function public.emitir_comprobante_no_fiscal(p_comprobante_id uuid)
returns resultado_emision
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c      comprobantes%rowtype;
  v_numero bigint;
  v_result resultado_emision;
begin
  select * into v_c from public.comprobantes where id = p_comprobante_id for update;

  if v_c.id is null then
    raise exception 'El comprobante no existe.' using errcode = 'no_data_found';
  end if;

  if public.es_fiscal(v_c.tipo_comprobante) then
    raise exception 'El comprobante % es fiscal: debe emitirse pidiendo CAE.', v_c.tipo_comprobante
      using errcode = 'restrict_violation';
  end if;

  if not public.tiene_rol(v_c.empresa_id, array['ADMIN','VENDEDOR']::rol_usuario[]) then
    raise exception 'Tu rol no puede emitir comprobantes.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_c.estado <> 'BORRADOR' then
    raise exception 'El comprobante ya fue emitido (estado %).', v_c.estado
      using errcode = 'restrict_violation';
  end if;

  perform public.validar_importes_comprobante(p_comprobante_id);

  v_numero := public.siguiente_numero_comprobante(
    v_c.empresa_id, v_c.punto_venta_id, v_c.tipo_comprobante);

  update public.comprobantes
     set numero = v_numero,
         estado = 'EMITIDO'
   where id = p_comprobante_id;

  perform public.aplicar_stock_comprobante(p_comprobante_id);

  v_result := (p_comprobante_id, v_numero, v_c.letra, 'EMITIDO'::estado_comprobante);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Registrar un intento de autorización fallido
--
-- Deja constancia de por qué falló sin tocar el número ni el estado. El
-- comprobante queda en BORRADOR con el botón de reintento.
-- ---------------------------------------------------------------------
create or replace function public.registrar_fallo_autorizacion(
  p_comprobante_id uuid,
  p_estado         text,
  p_observaciones  text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.comprobantes where id = p_comprobante_id;

  if v_empresa_id is null or not public.es_miembro(v_empresa_id) then
    raise exception 'Sin acceso al comprobante.' using errcode = 'insufficient_privilege';
  end if;

  update public.comprobantes
     set afip_estado        = p_estado,
         afip_observaciones = p_observaciones
   where id = p_comprobante_id
     and estado = 'BORRADOR';
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Nota de crédito de anulación total
--
-- Crea el BORRADOR de la NC copiando los renglones del comprobante de
-- origen. La emisión sigue el mismo camino que cualquier otro comprobante
-- fiscal: pedir CAE y confirmar. Los importes se copian tal cual para que
-- la reversión sea exacta al centavo.
-- ---------------------------------------------------------------------
create or replace function public.crear_nota_credito_borrador(
  p_comprobante_origen_id uuid,
  p_motivo                text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_o    comprobantes%rowtype;
  v_tipo tipo_comprobante;
  v_nc   uuid;
begin
  select * into v_o from public.comprobantes where id = p_comprobante_origen_id;

  if v_o.id is null then
    raise exception 'El comprobante a anular no existe.' using errcode = 'no_data_found';
  end if;

  if not public.tiene_rol(v_o.empresa_id, array['ADMIN','VENDEDOR']::rol_usuario[]) then
    raise exception 'Tu rol no puede emitir notas de crédito.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_o.estado <> 'EMITIDO' and v_o.estado <> 'PARCIAL' and v_o.estado <> 'PAGADO' then
    raise exception
      'Sólo se puede anular un comprobante emitido. Este está en estado %.', v_o.estado
      using errcode = 'restrict_violation';
  end if;

  v_tipo := case v_o.tipo_comprobante
              when 'FACTURA_A' then 'NC_A'
              when 'FACTURA_B' then 'NC_B'
              when 'FACTURA_C' then 'NC_C'
              else null
            end::tipo_comprobante;

  if v_tipo is null then
    raise exception
      'Sólo se anulan facturas con nota de crédito. El comprobante es de tipo %.',
      v_o.tipo_comprobante
      using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1 from public.comprobantes nc
    where nc.comprobante_origen_id = p_comprobante_origen_id
      and public.es_nota_credito(nc.tipo_comprobante)
      and nc.estado <> 'ANULADO'
  ) then
    raise exception 'El comprobante ya tiene una nota de crédito asociada.'
      using errcode = 'restrict_violation';
  end if;

  insert into public.comprobantes (
    empresa_id, tipo_comprobante, punto_venta_id, numero, letra,
    fecha_emision, cliente_id, vendedor_id, deposito_id, lista_precio_id,
    condicion_venta, moneda, cotizacion,
    neto_gravado, neto_no_gravado, exento, iva_105, iva_21, iva_27,
    otros_impuestos, descuento_porcentaje, descuento_importe, total,
    estado, comprobante_origen_id, observaciones, creado_por
  )
  values (
    v_o.empresa_id, v_tipo, v_o.punto_venta_id, null, public.letra_de_tipo(v_tipo),
    (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    v_o.cliente_id, v_o.vendedor_id, v_o.deposito_id, v_o.lista_precio_id,
    v_o.condicion_venta, v_o.moneda, v_o.cotizacion,
    v_o.neto_gravado, v_o.neto_no_gravado, v_o.exento, v_o.iva_105, v_o.iva_21, v_o.iva_27,
    v_o.otros_impuestos, v_o.descuento_porcentaje, v_o.descuento_importe, v_o.total,
    'BORRADOR', v_o.id, p_motivo, auth.uid()
  )
  returning id into v_nc;

  insert into public.comprobante_items (
    empresa_id, comprobante_id, orden, producto_id, descripcion, cantidad,
    precio_unitario, descuento_porcentaje, alicuota_iva,
    subtotal_neto, subtotal_iva, subtotal
  )
  select
    ci.empresa_id, v_nc, ci.orden, ci.producto_id, ci.descripcion, ci.cantidad,
    ci.precio_unitario, ci.descuento_porcentaje, ci.alicuota_iva,
    ci.subtotal_neto, ci.subtotal_iva, ci.subtotal
  from public.comprobante_items ci
  where ci.comprobante_id = p_comprobante_origen_id
  order by ci.orden;

  return v_nc;
end;
$$;

-- ---------------------------------------------------------------------
-- 11. Permisos: nada de esto se expone al rol anónimo
-- ---------------------------------------------------------------------
do $$
declare
  f text;
  firmas text[] := array[
    'public.proximo_numero_tentativo(uuid, uuid, tipo_comprobante)',
    'public.sincronizar_contador_comprobante(uuid, uuid, tipo_comprobante, bigint)',
    'public.saldo_cta_cte(entidad_tipo, uuid)',
    'public.validar_importes_comprobante(uuid)',
    'public.aplicar_stock_comprobante(uuid)',
    'public.aplicar_cta_cte_comprobante(uuid, boolean)',
    'public.confirmar_emision_comprobante(uuid, bigint, text, date, text, boolean)',
    'public.emitir_comprobante_no_fiscal(uuid)',
    'public.registrar_fallo_autorizacion(uuid, text, text)',
    'public.crear_nota_credito_borrador(uuid, text)',
    'public.mueve_stock(tipo_comprobante)',
    'public.es_nota_credito(tipo_comprobante)',
    'public.es_fiscal(tipo_comprobante)'
  ];
begin
  foreach f in array firmas loop
    execute format('revoke execute on function %s from anon, public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- Las funciones de efectos son piezas internas de la emisión: no se
-- invocan sueltas desde la aplicación.
revoke execute on function public.aplicar_stock_comprobante(uuid) from authenticated;
revoke execute on function public.aplicar_cta_cte_comprobante(uuid, boolean) from authenticated;

-- ---------------------------------------------------------------------
-- 12. Índices que necesita el listado de comprobantes
-- ---------------------------------------------------------------------
create index if not exists comprobantes_listado_idx
  on comprobantes (empresa_id, fecha_emision desc, creado_en desc);

create index if not exists comprobantes_talonario_idx
  on comprobantes (empresa_id, punto_venta_id, tipo_comprobante, numero desc);

create index if not exists cta_cte_saldo_idx
  on cta_cte_movimientos (entidad_tipo, entidad_id);
