-- =====================================================================
-- GestiónPyme · FASE 0 — Endurecimiento de funciones
--
-- Cierra dos hallazgos del linter de seguridad de Supabase:
--   1. search_path mutable: una función sin search_path fijo puede ser
--      secuestrada creando objetos homónimos en un schema anterior.
--   2. Funciones SECURITY DEFINER expuestas como RPC al rol anon.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. search_path fijo en todas las funciones propias
-- ---------------------------------------------------------------------
alter function public.f_unaccent(text)                            set search_path = public, pg_temp;
alter function public.es_cuit_valido(text)                        set search_path = public, pg_temp;
alter function public.letra_de_tipo(tipo_comprobante)             set search_path = public, pg_temp;
alter function public.impedir_modificacion()                      set search_path = public, pg_temp;
alter function public.bloquear_cambios_comprobante_emitido()      set search_path = public, pg_temp;
alter function public.bloquear_delete_comprobante()               set search_path = public, pg_temp;
alter function public.bloquear_items_de_comprobante_emitido()     set search_path = public, pg_temp;
alter function public.bloquear_caja_sesion_cerrada()              set search_path = public, pg_temp;
alter function public.validar_empresa_de_comprobante_item()       set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 2. Las funciones SECURITY DEFINER no se exponen al público.
--    Sólo las necesita un usuario autenticado (y el service role para
--    tareas de mantenimiento).
-- ---------------------------------------------------------------------
revoke execute on function public.empresas_del_usuario() from anon, public;
grant  execute on function public.empresas_del_usuario() to authenticated, service_role;

revoke execute on function public.es_miembro(uuid) from anon, public;
grant  execute on function public.es_miembro(uuid) to authenticated, service_role;

revoke execute on function public.tiene_rol(uuid, rol_usuario[]) from anon, public;
grant  execute on function public.tiene_rol(uuid, rol_usuario[]) to authenticated, service_role;

revoke execute on function public.siguiente_numero_comprobante(uuid, uuid, tipo_comprobante)
  from anon, public;
grant  execute on function public.siguiente_numero_comprobante(uuid, uuid, tipo_comprobante)
  to authenticated, service_role;
