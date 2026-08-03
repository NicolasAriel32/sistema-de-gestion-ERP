-- =====================================================================
-- GestiónPyme · FASE 0 — Seed de demostración (idempotente)
--
-- Corre las veces que haga falta sin duplicar nada: identificadores
-- fijos + ON CONFLICT sobre las claves naturales.
--
-- Crea DOS empresas a propósito: la demo y una segunda que sólo existe
-- para que el test de aislamiento de RLS tenga contra qué comparar.
--
-- Usuarios (contraseña de todos: gestionpyme123)
--   admin@demo.test     ADMIN     empresa demo
--   vendedor@demo.test  VENDEDOR  empresa demo
--   deposito@demo.test  DEPOSITO  empresa demo
--   admin@otra.test     ADMIN     empresa ajena
-- =====================================================================

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------
-- Usuarios de autenticación
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000','a1111111-1111-4111-8111-111111111111','authenticated','authenticated','admin@demo.test',    extensions.crypt('gestionpyme123', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Ana Delgado"}'),
  ('00000000-0000-0000-0000-000000000000','a2222222-2222-4222-8222-222222222222','authenticated','authenticated','vendedor@demo.test', extensions.crypt('gestionpyme123', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Bruno Vera"}'),
  ('00000000-0000-0000-0000-000000000000','a3333333-3333-4333-8333-333333333333','authenticated','authenticated','deposito@demo.test', extensions.crypt('gestionpyme123', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Carla Ruiz"}'),
  ('00000000-0000-0000-0000-000000000000','b1111111-1111-4111-8111-111111111111','authenticated','authenticated','admin@otra.test',    extensions.crypt('gestionpyme123', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Diego Paz"}')
on conflict (id) do nothing;

-- GoTrue falla al leer NULL en las columnas de token durante el login. Los
-- usuarios sembrados a mano quedan con esas columnas en NULL, así que se
-- fuerzan a cadena vacía para que puedan ingresar.
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email in ('admin@demo.test','vendedor@demo.test','deposito@demo.test','admin@otra.test');

insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.id, u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
from auth.users u
where u.email in ('admin@demo.test','vendedor@demo.test','deposito@demo.test','admin@otra.test')
on conflict (provider, provider_id) do nothing;

-- ---------------------------------------------------------------------
-- Empresas
-- ---------------------------------------------------------------------
insert into empresas (id, razon_social, nombre_fantasia, cuit, condicion_iva,
                      domicilio, localidad, provincia, ingresos_brutos, inicio_actividades)
values
  ('11111111-1111-4111-8111-111111111111','DISTRIBUIDORA SAN MARTIN S.R.L.','Distribuidora San Martín',
   '30716595540','RESPONSABLE_INSCRIPTO','Av. San Martín 2450','Rosario','Santa Fe','021-123456-7','2018-03-15'),
  ('22222222-2222-4222-8222-222222222222','COMERCIAL DEL LITORAL S.A.','Comercial del Litoral',
   '30683726407','RESPONSABLE_INSCRIPTO','Bv. Oroño 1200','Rosario','Santa Fe','021-765432-1','2020-07-01')
on conflict (id) do nothing;

insert into usuarios_empresa (usuario_id, empresa_id, rol)
values
  ('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','ADMIN'),
  ('a2222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','VENDEDOR'),
  ('a3333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','DEPOSITO'),
  ('b1111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ADMIN')
on conflict (usuario_id, empresa_id) do nothing;

-- ---------------------------------------------------------------------
-- Estructura de la empresa demo
-- ---------------------------------------------------------------------
insert into depositos (empresa_id, nombre, direccion, es_default)
values
  ('11111111-1111-4111-8111-111111111111','Depósito Central','Av. San Martín 2450', true),
  ('11111111-1111-4111-8111-111111111111','Depósito Sucursal Norte','Ruta 34 km 12', false)
on conflict (empresa_id, nombre) do nothing;

insert into puntos_venta (empresa_id, numero, descripcion, tipo_emision)
values
  ('11111111-1111-4111-8111-111111111111', 1, 'Casa Central — Facturación electrónica','ELECTRONICA'),
  ('11111111-1111-4111-8111-111111111111', 2, 'Mostrador — Punto de venta','ELECTRONICA')
on conflict (empresa_id, numero) do nothing;

insert into listas_precios (empresa_id, nombre, tipo_ajuste, porcentaje, es_default)
values
  ('11111111-1111-4111-8111-111111111111','Lista General','MANUAL', 0, true),
  ('11111111-1111-4111-8111-111111111111','Lista Mayorista','PORCENTAJE_SOBRE_LISTA', -12, false)
on conflict (empresa_id, nombre) do nothing;

insert into medios_pago (empresa_id, nombre, tipo, recargo_porcentaje)
values
  ('11111111-1111-4111-8111-111111111111','Efectivo','EFECTIVO', 0),
  ('11111111-1111-4111-8111-111111111111','Transferencia bancaria','TRANSFERENCIA', 0),
  ('11111111-1111-4111-8111-111111111111','Tarjeta de débito','TARJETA_DEBITO', 0),
  ('11111111-1111-4111-8111-111111111111','Tarjeta de crédito','TARJETA_CREDITO', 8)
on conflict (empresa_id, nombre) do nothing;

insert into cajas (empresa_id, nombre)
values ('11111111-1111-4111-8111-111111111111','Caja Mostrador')
on conflict (empresa_id, nombre) do nothing;

-- Estructura mínima de la empresa ajena, para el test de aislamiento.
insert into depositos (empresa_id, nombre, es_default)
values ('22222222-2222-4222-8222-222222222222','Depósito Litoral', true)
on conflict (empresa_id, nombre) do nothing;

insert into puntos_venta (empresa_id, numero, descripcion)
values ('22222222-2222-4222-8222-222222222222', 1, 'Casa Central Litoral')
on conflict (empresa_id, numero) do nothing;

insert into listas_precios (empresa_id, nombre, es_default)
values ('22222222-2222-4222-8222-222222222222','Lista Litoral', true)
on conflict (empresa_id, nombre) do nothing;

-- ---------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------
insert into categorias (empresa_id, nombre)
values
  ('11111111-1111-4111-8111-111111111111','Bebidas'),
  ('11111111-1111-4111-8111-111111111111','Almacén'),
  ('11111111-1111-4111-8111-111111111111','Limpieza'),
  ('11111111-1111-4111-8111-111111111111','Perfumería'),
  ('11111111-1111-4111-8111-111111111111','Kiosco')
on conflict (empresa_id, nombre) do nothing;

-- ---------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------
insert into proveedores (empresa_id, razon_social, cuit, condicion_iva, email, telefono)
values
  ('11111111-1111-4111-8111-111111111111','BEBIDAS DEL CENTRO S.A.','20356789017','RESPONSABLE_INSCRIPTO','ventas@bebidascentro.test','341-4550001'),
  ('11111111-1111-4111-8111-111111111111','ALIMENTOS PAMPA S.R.L.','27123456780','RESPONSABLE_INSCRIPTO','pedidos@pampa.test','341-4550002'),
  ('11111111-1111-4111-8111-111111111111','QUIMICA LITORAL S.A.','33998877666','RESPONSABLE_INSCRIPTO','info@quimicalitoral.test','341-4550003'),
  ('11111111-1111-4111-8111-111111111111','COSMETICA ARGENTINA S.R.L.','20287654325','RESPONSABLE_INSCRIPTO','contacto@cosmetica.test','341-4550004'),
  ('11111111-1111-4111-8111-111111111111','GOLOSINAS ROSARIO','23345678905','MONOTRIBUTO','golosinas@rosario.test','341-4550005')
on conflict (empresa_id, cuit) do nothing;

-- ---------------------------------------------------------------------
-- Clientes (mix de condiciones frente al IVA)
-- ---------------------------------------------------------------------
-- clientes no tiene clave natural única, así que la idempotencia se
-- resuelve con NOT EXISTS sobre (empresa_id, razon_social).
insert into clientes (empresa_id, razon_social, nombre_fantasia, tipo_doc, cuit_dni,
                      condicion_iva, email, telefono, localidad, provincia,
                      limite_credito, dias_credito)
select v.empresa_id::uuid, v.razon_social, v.nombre_fantasia, v.tipo_doc::tipo_documento,
       v.cuit_dni, v.condicion_iva::condicion_iva, v.email, v.telefono, v.localidad,
       v.provincia, v.limite_credito::numeric(15,2), v.dias_credito::integer
from (values
  ('11111111-1111-4111-8111-111111111111','SUPERMERCADOS DEL SUR S.A.','Súper del Sur','CUIT','30554433223','RESPONSABLE_INSCRIPTO','compras@superdelsur.test','341-4560001','Rosario','Santa Fe', 2500000, 30),
  ('11111111-1111-4111-8111-111111111111','ALMACEN LA ESQUINA S.R.L.','La Esquina','CUIT','27456789019','RESPONSABLE_INSCRIPTO','laesquina@mail.test','341-4560002','Rosario','Santa Fe', 800000, 15),
  ('11111111-1111-4111-8111-111111111111','KIOSCO EL TREBOL','El Trébol','CUIT','20112233440','MONOTRIBUTO','eltrebol@mail.test','341-4560003','Funes','Santa Fe', 150000, 7),
  ('11111111-1111-4111-8111-111111111111','DESPENSA SAN JOSE','San José','CUIT','30667788990','MONOTRIBUTO','sanjose@mail.test','341-4560004','Roldán','Santa Fe', 120000, 7),
  ('11111111-1111-4111-8111-111111111111','FUNDACION EDUCAR','Fundación Educar','CUIT','23123456709','EXENTO','admin@educar.test','341-4560005','Rosario','Santa Fe', 300000, 30),
  ('11111111-1111-4111-8111-111111111111','DISTRIBUIDORA NORTE S.R.L.','Distri Norte','CUIT','20398765436','RESPONSABLE_INSCRIPTO','ventas@distrinorte.test','341-4560006','Rosario','Santa Fe', 1800000, 30),
  ('11111111-1111-4111-8111-111111111111','AUTOSERVICIO PRIMAVERA','Primavera','CUIT','30712345671','RESPONSABLE_INSCRIPTO','primavera@mail.test','341-4560007','Villa Gdor. Gálvez','Santa Fe', 600000, 15),
  ('11111111-1111-4111-8111-111111111111','PANADERIA LA FLOR','La Flor','CUIT','20445566773','MONOTRIBUTO','laflor@mail.test','341-4560008','Rosario','Santa Fe', 90000, 7),
  ('11111111-1111-4111-8111-111111111111','HOTEL RIVERA S.A.','Hotel Rivera','CUIT','27556677889','RESPONSABLE_INSCRIPTO','compras@hotelrivera.test','341-4560009','Rosario','Santa Fe', 1200000, 30),
  ('11111111-1111-4111-8111-111111111111','Martín Alonso','Martín Alonso','DNI','28456789','CONSUMIDOR_FINAL','malonso@mail.test','341-4560010','Rosario','Santa Fe', 0, 0),
  ('11111111-1111-4111-8111-111111111111','Lucía Ferreyra','Lucía Ferreyra','DNI','32567890','CONSUMIDOR_FINAL','lferreyra@mail.test','341-4560011','Rosario','Santa Fe', 0, 0),
  ('11111111-1111-4111-8111-111111111111','Rodrigo Sosa','Rodrigo Sosa','DNI','25678901','CONSUMIDOR_FINAL',null,'341-4560012','Pérez','Santa Fe', 0, 0),
  ('11111111-1111-4111-8111-111111111111','Valeria Costa','Valeria Costa','DNI','35789012','CONSUMIDOR_FINAL',null,null,'Rosario','Santa Fe', 0, 0),
  ('11111111-1111-4111-8111-111111111111','Consumidor Final','Mostrador','SIN_IDENTIFICAR',null,'CONSUMIDOR_FINAL',null,null,null,null, 0, 0),
  ('11111111-1111-4111-8111-111111111111','COOPERATIVA AGRICOLA LTDA.','Coop. Agrícola','CUIT','20223344551','EXENTO','coop@agricola.test','341-4560014','Casilda','Santa Fe', 400000, 30)
) as v(empresa_id, razon_social, nombre_fantasia, tipo_doc, cuit_dni, condicion_iva,
       email, telefono, localidad, provincia, limite_credito, dias_credito)
where not exists (
  select 1 from clientes c
  where c.empresa_id = v.empresa_id::uuid and c.razon_social = v.razon_social
);

-- Un cliente de la empresa ajena, para el test de aislamiento.
insert into clientes (empresa_id, razon_social, tipo_doc, cuit_dni, condicion_iva)
select '22222222-2222-4222-8222-222222222222','CLIENTE RESERVADO DEL LITORAL S.A.','CUIT','30776655445','RESPONSABLE_INSCRIPTO'
where not exists (
  select 1 from clientes c
  where c.empresa_id = '22222222-2222-4222-8222-222222222222'
    and c.razon_social = 'CLIENTE RESERVADO DEL LITORAL S.A.'
);

-- ---------------------------------------------------------------------
-- Productos (25) con su alícuota y costo
-- ---------------------------------------------------------------------
insert into productos (empresa_id, codigo, codigo_barras, nombre, categoria_id,
                       unidad_medida, alicuota_iva, precio_costo, stock_minimo)
select
  '11111111-1111-4111-8111-111111111111',
  p.codigo, p.codigo_barras, p.nombre,
  (select c.id from categorias c
    where c.empresa_id = '11111111-1111-4111-8111-111111111111' and c.nombre = p.categoria),
  p.unidad, p.alicuota, p.costo, p.minimo
from (values
  ('BEB-001','7790001000015','Gaseosa cola 2.25 L',          'Bebidas',    'UNIDAD', 21,  1250.00, 24),
  ('BEB-002','7790001000022','Gaseosa lima limón 2.25 L',    'Bebidas',    'UNIDAD', 21,  1180.00, 24),
  ('BEB-003','7790001000039','Agua mineral sin gas 1.5 L',   'Bebidas',    'UNIDAD', 21,   620.00, 36),
  ('BEB-004','7790001000046','Cerveza rubia 1 L',            'Bebidas',    'UNIDAD', 21,  1690.00, 48),
  ('BEB-005','7790001000053','Vino tinto malbec 750 ml',     'Bebidas',    'UNIDAD', 21,  3450.00, 12),
  ('BEB-006','7790001000060','Jugo de naranja 1 L',          'Bebidas',    'UNIDAD', 21,   980.00, 18),
  ('ALM-001','7790002000014','Leche entera larga vida 1 L',  'Almacén',    'UNIDAD', 21,   890.00, 30),
  ('ALM-002','7790002000021','Yerba mate 1 kg',              'Almacén',    'UNIDAD', 21,  3200.00, 20),
  ('ALM-003','7790002000038','Azúcar 1 kg',                  'Almacén',    'UNIDAD', 21,   740.00, 25),
  ('ALM-004','7790002000045','Harina 000 1 kg',              'Almacén',    'UNIDAD', 21,   560.00, 25),
  ('ALM-005','7790002000052','Aceite de girasol 900 ml',     'Almacén',    'UNIDAD', 21,  1850.00, 20),
  ('ALM-006','7790002000069','Fideos guiseros 500 g',        'Almacén',    'UNIDAD', 21,   690.00, 30),
  ('ALM-007','7790002000076','Arroz largo fino 1 kg',        'Almacén',    'UNIDAD', 21,   980.00, 25),
  ('ALM-008','7790002000083','Pan lactal 500 g',             'Almacén',    'UNIDAD', 21,  1420.00, 12),
  ('LIM-001','7790003000013','Lavandina 1 L',                'Limpieza',   'UNIDAD', 21,   520.00, 20),
  ('LIM-002','7790003000020','Detergente 750 ml',            'Limpieza',   'UNIDAD', 21,  1180.00, 18),
  ('LIM-003','7790003000037','Jabón en polvo 800 g',         'Limpieza',   'UNIDAD', 21,  2450.00, 15),
  ('LIM-004','7790003000044','Limpiador de pisos 900 ml',    'Limpieza',   'UNIDAD', 21,  1320.00, 15),
  ('LIM-005','7790003000051','Rollo de cocina x3',           'Limpieza',   'UNIDAD', 21,  1780.00, 12),
  ('PER-001','7790004000012','Shampoo 400 ml',               'Perfumería', 'UNIDAD', 21,  2980.00, 10),
  ('PER-002','7790004000029','Jabón de tocador 90 g',        'Perfumería', 'UNIDAD', 21,   480.00, 24),
  ('PER-003','7790004000036','Pasta dental 90 g',            'Perfumería', 'UNIDAD', 21,  1650.00, 15),
  ('KIO-001','7790005000011','Alfajor triple 70 g',          'Kiosco',     'UNIDAD', 21,   680.00, 40),
  ('KIO-002','7790005000028','Chicles pack x10',             'Kiosco',     'UNIDAD', 21,   950.00, 30),
  ('KIO-003','7790005000035','Caramelos surtidos 500 g',     'Kiosco',     'UNIDAD', 21,  2100.00, 10)
) as p(codigo, codigo_barras, nombre, categoria, unidad, alicuota, costo, minimo)
on conflict (empresa_id, codigo) do nothing;

-- ---------------------------------------------------------------------
-- Precios: Lista General con 45% de markup; Mayorista 12% por debajo.
-- ---------------------------------------------------------------------
insert into precios (empresa_id, producto_id, lista_precio_id, precio_neto)
select pr.empresa_id, pr.id, lp.id,
       round(
         pr.precio_costo * 1.45 * case when lp.nombre = 'Lista Mayorista' then 0.88 else 1 end,
         2)
from productos pr
join listas_precios lp
  on lp.empresa_id = pr.empresa_id
where pr.empresa_id = '11111111-1111-4111-8111-111111111111'
on conflict (producto_id, lista_precio_id) do nothing;

-- Los clientes sin lista asignada van a la lista por defecto.
update clientes c
   set lista_precio_id = lp.id
from listas_precios lp
where lp.empresa_id = c.empresa_id
  and lp.es_default
  and c.lista_precio_id is null;

-- ---------------------------------------------------------------------
-- Stock inicial en el depósito central
-- ---------------------------------------------------------------------
insert into stock_movimientos (empresa_id, producto_id, deposito_id, tipo, cantidad,
                               costo_unitario, motivo, usuario_id)
select pr.empresa_id, pr.id, d.id, 'INICIAL', 120, pr.precio_costo,
       'Carga inicial de demostración', 'a1111111-1111-4111-8111-111111111111'
from productos pr
join depositos d
  on d.empresa_id = pr.empresa_id and d.es_default
where pr.empresa_id = '11111111-1111-4111-8111-111111111111'
  -- Append-only: sólo se carga si todavía no hay movimiento inicial.
  and not exists (
    select 1 from stock_movimientos sm
    where sm.producto_id = pr.id and sm.tipo = 'INICIAL'
  );

commit;
