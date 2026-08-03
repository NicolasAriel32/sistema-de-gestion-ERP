-- =====================================================================
-- GestiónPyme · FASE 0 — Row Level Security
-- Aislamiento multi-tenant: ninguna fila cruza el borde de empresa_id.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RLS activo en TODAS las tablas, sin excepción.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'empresas','usuarios_empresa',
    'categorias','listas_precios','depositos','puntos_venta',
    'clientes','proveedores','productos','precios',
    'comprobantes','comprobante_items','comprobante_contadores',
    'stock_movimientos',
    'medios_pago','cajas','caja_sesiones','movimientos_caja',
    'cta_cte_movimientos',
    'ordenes_compra','orden_compra_items','compras','compra_items','compra_percepciones',
    'audit_log','webhook_eventos'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Lectura: todo miembro activo ve lo de sus empresas y nada más.
--    (empresas y usuarios_empresa llevan política propia más abajo.)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'categorias','listas_precios','depositos','puntos_venta',
    'clientes','proveedores','productos','precios',
    'comprobantes','comprobante_items','comprobante_contadores',
    'stock_movimientos',
    'medios_pago','cajas','caja_sesiones','movimientos_caja',
    'cta_cte_movimientos',
    'ordenes_compra','orden_compra_items','compras','compra_items','compra_percepciones',
    'webhook_eventos'
  ];
begin
  foreach t in array tablas loop
    execute format(
      'create policy %I on public.%I for select to authenticated
       using (empresa_id in (select public.empresas_del_usuario()))',
      t || '_select_miembro', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Empresas y membresías
-- ---------------------------------------------------------------------
create policy empresas_select_miembro on empresas
  for select to authenticated
  using (id in (select public.empresas_del_usuario()));

create policy empresas_update_admin on empresas
  for update to authenticated
  using (public.tiene_rol(id, array['ADMIN']::rol_usuario[]))
  with check (public.tiene_rol(id, array['ADMIN']::rol_usuario[]));

create policy usuarios_empresa_select_miembro on usuarios_empresa
  for select to authenticated
  using (empresa_id in (select public.empresas_del_usuario()));

create policy usuarios_empresa_insert_admin on usuarios_empresa
  for insert to authenticated
  with check (public.tiene_rol(empresa_id, array['ADMIN']::rol_usuario[]));

create policy usuarios_empresa_update_admin on usuarios_empresa
  for update to authenticated
  using (public.tiene_rol(empresa_id, array['ADMIN']::rol_usuario[]))
  with check (public.tiene_rol(empresa_id, array['ADMIN']::rol_usuario[]));

create policy usuarios_empresa_delete_admin on usuarios_empresa
  for delete to authenticated
  using (public.tiene_rol(empresa_id, array['ADMIN']::rol_usuario[]));

-- ---------------------------------------------------------------------
-- 4. Escritura por rol. Se generan INSERT / UPDATE / DELETE con el
--    mismo conjunto de roles habilitados por tabla.
-- ---------------------------------------------------------------------
do $$
declare
  reglas constant text[][] := array[
    -- tabla                    roles habilitados para escribir
    array['clientes',              'ADMIN,VENDEDOR'],
    array['proveedores',           'ADMIN,CONTABLE'],
    array['categorias',            'ADMIN,DEPOSITO'],
    array['productos',             'ADMIN,DEPOSITO'],
    array['listas_precios',        'ADMIN'],
    array['precios',               'ADMIN'],
    array['depositos',             'ADMIN'],
    array['puntos_venta',          'ADMIN'],
    array['medios_pago',           'ADMIN'],
    array['cajas',                 'ADMIN'],
    array['comprobantes',          'ADMIN,VENDEDOR'],
    array['comprobante_items',     'ADMIN,VENDEDOR'],
    array['caja_sesiones',         'ADMIN,VENDEDOR,CONTABLE'],
    array['ordenes_compra',        'ADMIN,CONTABLE,DEPOSITO'],
    array['orden_compra_items',    'ADMIN,CONTABLE,DEPOSITO'],
    array['compras',               'ADMIN,CONTABLE'],
    array['compra_items',          'ADMIN,CONTABLE'],
    array['compra_percepciones',   'ADMIN,CONTABLE']
  ];
  i int;
  v_tabla text;
  v_roles text;
begin
  for i in 1 .. array_length(reglas, 1) loop
    v_tabla := reglas[i][1];
    v_roles := 'array[''' || replace(reglas[i][2], ',', ''',''') || ''']::rol_usuario[]';

    execute format(
      'create policy %I on public.%I for insert to authenticated
       with check (public.tiene_rol(empresa_id, %s))',
      v_tabla || '_insert', v_tabla, v_roles);

    execute format(
      'create policy %I on public.%I for update to authenticated
       using (public.tiene_rol(empresa_id, %s))
       with check (public.tiene_rol(empresa_id, %s))',
      v_tabla || '_update', v_tabla, v_roles, v_roles);

    execute format(
      'create policy %I on public.%I for delete to authenticated
       using (public.tiene_rol(empresa_id, %s))',
      v_tabla || '_delete', v_tabla, v_roles);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Tablas append-only: SELECT e INSERT. Sin UPDATE. Sin DELETE.
--    Los triggers de la migración anterior lo refuerzan incluso para
--    conexiones que evaden RLS.
-- ---------------------------------------------------------------------
create policy stock_movimientos_insert on stock_movimientos
  for insert to authenticated
  with check (public.tiene_rol(empresa_id, array['ADMIN','DEPOSITO','VENDEDOR']::rol_usuario[]));

create policy cta_cte_movimientos_insert on cta_cte_movimientos
  for insert to authenticated
  with check (public.tiene_rol(empresa_id, array['ADMIN','CONTABLE','VENDEDOR']::rol_usuario[]));

create policy movimientos_caja_insert on movimientos_caja
  for insert to authenticated
  with check (public.tiene_rol(empresa_id, array['ADMIN','VENDEDOR','CONTABLE']::rol_usuario[]));

-- El audit log lo lee quien audita; lo escribe cualquier miembro.
create policy audit_log_select on audit_log
  for select to authenticated
  using (empresa_id in (select public.empresas_del_usuario())
         and public.tiene_rol(empresa_id, array['ADMIN','CONTABLE']::rol_usuario[]));

create policy audit_log_insert on audit_log
  for insert to authenticated
  with check (empresa_id in (select public.empresas_del_usuario()));

create policy webhook_eventos_insert on webhook_eventos
  for insert to authenticated
  with check (empresa_id in (select public.empresas_del_usuario()));

-- comprobante_contadores queda sin política de escritura a propósito:
-- sólo se toca vía siguiente_numero_comprobante(), que es SECURITY DEFINER.
