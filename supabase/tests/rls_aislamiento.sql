-- =====================================================================
-- GestiónPyme · FASE 0 — Test de aislamiento multi-tenant
--
-- Demuestra que un usuario de la empresa A no puede leer NADA de la
-- empresa B, recorriendo TODAS las tablas que tienen empresa_id en vez
-- de confiar en una muestra.
--
-- Requiere el seed aplicado. No deja rastro: termina en ROLLBACK.
-- Falla ruidosamente (raise exception) ante la menor filtración.
-- =====================================================================

begin;

do $$
declare
  v_empresa_a  constant uuid := '11111111-1111-4111-8111-111111111111';
  v_empresa_b  constant uuid := '22222222-2222-4222-8222-222222222222';
  v_user_a     constant uuid := 'a1111111-1111-4111-8111-111111111111';  -- ADMIN empresa A
  v_user_b     constant uuid := 'b1111111-1111-4111-8111-111111111111';  -- ADMIN empresa B
  r            record;
  v_filtradas  bigint;
  v_visibles   bigint;
  v_esperadas  bigint;
  v_afectadas  bigint;
  v_tablas     int := 0;
  v_rol        text;
begin
  -- Cuántos clientes tiene realmente cada empresa (sin RLS, como superusuario).
  select count(*) into v_esperadas from clientes where empresa_id = v_empresa_a;

  if v_esperadas = 0 then
    raise exception 'El seed no está aplicado: la empresa A no tiene clientes.';
  end if;

  -- ================================================================
  -- FASE 1 · El usuario de la empresa A no ve nada de la empresa B
  -- ================================================================
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- Sin esto el test podría pasar de forma vacía: si SET LOCAL no tomara
  -- efecto, todo correría como superusuario y RLS ni entraría en juego.
  select current_user into v_rol;
  if v_rol <> 'authenticated' then
    raise exception 'El test no cambió de rol (current_user = %). SET LOCAL no tuvo efecto.', v_rol;
  end if;

  for r in
    select c.table_name
    from information_schema.columns c
    join pg_tables t on t.tablename = c.table_name and t.schemaname = 'public'
    where c.table_schema = 'public'
      and c.column_name = 'empresa_id'
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where empresa_id = $1', r.table_name)
      into v_filtradas
      using v_empresa_b;

    if v_filtradas > 0 then
      raise exception
        'FILTRACIÓN: el usuario de la empresa A ve % fila(s) de la empresa B en la tabla %',
        v_filtradas, r.table_name;
    end if;

    v_tablas := v_tablas + 1;
  end loop;

  -- La tabla empresas se chequea aparte: su columna de tenencia es "id".
  select count(*) into v_filtradas from empresas where id = v_empresa_b;
  if v_filtradas > 0 then
    raise exception 'FILTRACIÓN: el usuario de la empresa A ve la empresa B en la tabla empresas';
  end if;

  -- Y lo propio sí lo ve: el aislamiento no puede lograrse a costa de no ver nada.
  select count(*) into v_visibles from clientes;
  if v_visibles <> v_esperadas then
    raise exception
      'El usuario de la empresa A ve % clientes propios pero deberia ver %',
      v_visibles, v_esperadas;
  end if;

  raise notice 'OK · empresa A aislada: % tablas verificadas, % clientes propios visibles',
    v_tablas, v_visibles;

  -- ================================================================
  -- FASE 2 · Simétrico: el usuario de la empresa B no ve nada de la A
  -- ================================================================
  reset role;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  for r in
    select c.table_name
    from information_schema.columns c
    join pg_tables t on t.tablename = c.table_name and t.schemaname = 'public'
    where c.table_schema = 'public'
      and c.column_name = 'empresa_id'
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where empresa_id = $1', r.table_name)
      into v_filtradas
      using v_empresa_a;

    if v_filtradas > 0 then
      raise exception
        'FILTRACIÓN: el usuario de la empresa B ve % fila(s) de la empresa A en la tabla %',
        v_filtradas, r.table_name;
    end if;
  end loop;

  raise notice 'OK · empresa B aislada simétricamente';

  -- ================================================================
  -- FASE 3 · Las tablas append-only no admiten UPDATE ni DELETE
  -- ================================================================
  reset role;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- Sin política de UPDATE, RLS no expone ninguna fila: 0 afectadas.
  update stock_movimientos set cantidad = cantidad + 1;
  get diagnostics v_afectadas = row_count;
  if v_afectadas > 0 then
    raise exception
      'stock_movimientos aceptó % UPDATE(s): la tabla debe ser de sólo inserción', v_afectadas;
  end if;

  delete from cta_cte_movimientos;
  get diagnostics v_afectadas = row_count;
  if v_afectadas > 0 then
    raise exception
      'cta_cte_movimientos aceptó % DELETE(s): la tabla debe ser de sólo inserción', v_afectadas;
  end if;

  raise notice 'OK · tablas append-only sin UPDATE ni DELETE bajo RLS';

  -- ================================================================
  -- FASE 4 · El trigger frena incluso a quien evade RLS
  -- ================================================================
  reset role;

  begin
    update stock_movimientos set cantidad = cantidad + 1
    where id = (select id from stock_movimientos limit 1);

    raise exception 'El trigger de inmutabilidad NO frenó un UPDATE con privilegios de superusuario';
  exception
    when restrict_violation then
      raise notice 'OK · el trigger de inmutabilidad frena el UPDATE aun evadiendo RLS';
  end;

  -- ================================================================
  -- FASE 5 · Un comprobante emitido no admite cambio de importes
  -- ================================================================
  begin
    insert into comprobantes (
      empresa_id, tipo_comprobante, punto_venta_id, numero, letra,
      cliente_id, estado, total
    )
    select v_empresa_a, 'FACTURA_A',
           (select id from puntos_venta where empresa_id = v_empresa_a order by numero limit 1),
           999999, 'A',
           (select id from clientes where empresa_id = v_empresa_a
             and condicion_iva = 'RESPONSABLE_INSCRIPTO' limit 1),
           'EMITIDO', 1000;

    update comprobantes set total = 2000
    where empresa_id = v_empresa_a and numero = 999999;

    raise exception 'Se pudo modificar el total de un comprobante EMITIDO';
  exception
    when restrict_violation then
      raise notice 'OK · un comprobante EMITIDO rechaza el cambio de importes';
  end;

  raise notice '=== TODOS LOS CHEQUEOS PASARON ===';
end;
$$;

rollback;
