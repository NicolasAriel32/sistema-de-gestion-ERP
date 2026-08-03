-- =====================================================================
-- GestiónPyme · FASE 0 — Extensiones, enums y funciones de dominio
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() es STABLE y no sirve en expresiones de índice.
-- Este envoltorio la fija a un diccionario concreto y la vuelve IMMUTABLE.
create or replace function public.f_unaccent(p_texto text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_texto)
$$;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type condicion_iva as enum (
  'RESPONSABLE_INSCRIPTO','MONOTRIBUTO','EXENTO','CONSUMIDOR_FINAL','NO_ALCANZADO'
);
create type rol_usuario as enum ('ADMIN','VENDEDOR','DEPOSITO','CONTABLE');
create type tipo_documento as enum ('CUIT','CUIL','DNI','PASAPORTE','SIN_IDENTIFICAR');
create type letra_comprobante as enum ('A','B','C','M','E','X');
create type tipo_comprobante as enum (
  'PRESUPUESTO','PEDIDO','REMITO',
  'FACTURA_A','FACTURA_B','FACTURA_C',
  'NC_A','NC_B','NC_C',
  'ND_A','ND_B','ND_C'
);
create type estado_comprobante as enum ('BORRADOR','EMITIDO','ANULADO','PAGADO','PARCIAL');
create type condicion_venta as enum ('CONTADO','CUENTA_CORRIENTE');
create type tipo_emision as enum ('ELECTRONICA','CONTROLADOR_FISCAL','MANUAL','NO_FISCAL');
create type tipo_ajuste_lista as enum ('MANUAL','MARKUP_SOBRE_COSTO','PORCENTAJE_SOBRE_LISTA');
create type tipo_movimiento_stock as enum (
  'INICIAL','VENTA','DEVOLUCION_CLIENTE','COMPRA','DEVOLUCION_PROVEEDOR',
  'AJUSTE','TRANSFERENCIA_SALIDA','TRANSFERENCIA_ENTRADA'
);
create type entidad_tipo as enum ('CLIENTE','PROVEEDOR');
create type tipo_medio_pago as enum (
  'EFECTIVO','TRANSFERENCIA','TARJETA_DEBITO','TARJETA_CREDITO','OTRO'
);
create type estado_caja_sesion as enum ('ABIERTA','CERRADA');
create type tipo_movimiento_caja as enum ('INGRESO','EGRESO');
create type estado_orden_compra as enum ('BORRADOR','EMITIDA','RECIBIDA_PARCIAL','RECIBIDA','ANULADA');
create type estado_compra as enum ('BORRADOR','REGISTRADA','PARCIAL','PAGADA','ANULADA');
create type tipo_percepcion as enum ('IVA','GANANCIAS','IIBB','OTRO');
create type accion_audit as enum ('INSERT','UPDATE','DELETE');
create type estado_webhook as enum ('PENDIENTE','ENVIADO','FALLIDO','DESCARTADO');

-- ---------------------------------------------------------------------
-- VALIDACIÓN DE CUIT (módulo 11) — se usa en CHECK constraints
-- ---------------------------------------------------------------------
create or replace function public.es_cuit_valido(p_cuit text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_digitos text;
  v_pesos   int[] := array[5,4,3,2,7,6,5,4,3,2];
  v_suma    int := 0;
  v_dv      int;
  i         int;
begin
  if p_cuit is null then
    return false;
  end if;

  v_digitos := regexp_replace(p_cuit, '[^0-9]', '', 'g');
  if length(v_digitos) <> 11 then
    return false;
  end if;

  for i in 1..10 loop
    v_suma := v_suma + substr(v_digitos, i, 1)::int * v_pesos[i];
  end loop;

  v_dv := 11 - (v_suma % 11);
  if v_dv = 11 then
    v_dv := 0;
  elsif v_dv = 10 then
    v_dv := 9;
  end if;

  return v_dv = substr(v_digitos, 11, 1)::int;
end;
$$;

comment on function public.es_cuit_valido(text) is
  'Valida el digito verificador de un CUIT/CUIL por modulo 11. Ignora guiones y espacios.';

-- ---------------------------------------------------------------------
-- Coherencia letra ↔ tipo de comprobante
-- ---------------------------------------------------------------------
create or replace function public.letra_de_tipo(p_tipo tipo_comprobante)
returns letra_comprobante
language sql
immutable
as $$
  select case
    when p_tipo in ('FACTURA_A','NC_A','ND_A') then 'A'
    when p_tipo in ('FACTURA_B','NC_B','ND_B') then 'B'
    when p_tipo in ('FACTURA_C','NC_C','ND_C') then 'C'
    else 'X'                                  -- presupuesto, pedido, remito: no fiscales
  end::letra_comprobante
$$;
