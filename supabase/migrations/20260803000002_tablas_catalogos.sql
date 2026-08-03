-- =====================================================================
-- GestiónPyme · FASE 0 — Empresas, membresías y catálogos
-- =====================================================================

create table empresas (
  id                  uuid primary key default gen_random_uuid(),
  razon_social        text not null check (length(btrim(razon_social)) > 0),
  nombre_fantasia     text,
  cuit                text not null unique check (es_cuit_valido(cuit)),
  -- Un emisor sólo puede ser RI, Monotributo o Exento. Un consumidor final no factura.
  condicion_iva       condicion_iva not null
                      check (condicion_iva in ('RESPONSABLE_INSCRIPTO','MONOTRIBUTO','EXENTO')),
  domicilio           text,
  localidad           text,
  provincia           text,
  ingresos_brutos     text,
  inicio_actividades  date,
  logo_url            text,
  activa              boolean not null default true,
  creado_en           timestamptz not null default now()
);

create table usuarios_empresa (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  empresa_id  uuid not null references empresas(id) on delete cascade,
  rol         rol_usuario not null,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (usuario_id, empresa_id)
);
create index on usuarios_empresa (empresa_id, activo);

create table categorias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  nombre      text not null check (length(btrim(nombre)) > 0),
  padre_id    uuid references categorias(id) on delete set null,
  activa      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (empresa_id, nombre)
);
create index on categorias (empresa_id);

create table listas_precios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  nombre       text not null check (length(btrim(nombre)) > 0),
  tipo_ajuste  tipo_ajuste_lista not null default 'MANUAL',
  porcentaje   numeric(7,4) not null default 0,
  es_default   boolean not null default false,
  activa       boolean not null default true,
  creado_en    timestamptz not null default now(),
  unique (empresa_id, nombre)
);
create unique index listas_precios_una_default
  on listas_precios (empresa_id) where es_default;

create table depositos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  nombre      text not null check (length(btrim(nombre)) > 0),
  direccion   text,
  es_default  boolean not null default false,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (empresa_id, nombre)
);
create unique index depositos_uno_default
  on depositos (empresa_id) where es_default;

create table puntos_venta (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  numero        integer not null check (numero between 1 and 99999),
  descripcion   text,
  tipo_emision  tipo_emision not null default 'ELECTRONICA',
  activo        boolean not null default true,
  creado_en     timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table clientes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  razon_social     text not null check (length(btrim(razon_social)) > 0),
  nombre_fantasia  text,
  tipo_doc         tipo_documento not null default 'CUIT',
  cuit_dni         text,
  condicion_iva    condicion_iva not null default 'CONSUMIDOR_FINAL',
  email            text,
  telefono         text,
  domicilio        text,
  localidad        text,
  provincia        text,
  lista_precio_id  uuid references listas_precios(id) on delete set null,
  limite_credito   numeric(15,2) not null default 0 check (limite_credito >= 0),
  dias_credito     integer not null default 0 check (dias_credito >= 0),
  observaciones    text,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  -- Si identifica con CUIT/CUIL, el dígito verificador tiene que cerrar.
  constraint clientes_cuit_valido
    check (tipo_doc not in ('CUIT','CUIL') or es_cuit_valido(cuit_dni)),
  -- Un RI, Monotributo o Exento no puede estar sin identificar.
  constraint clientes_identificacion_requerida
    check (condicion_iva in ('CONSUMIDOR_FINAL','NO_ALCANZADO') or cuit_dni is not null)
);
create index on clientes (empresa_id, activo);
create index on clientes (empresa_id, cuit_dni);
create index clientes_busqueda_idx on clientes
  using gin (to_tsvector('simple',
    f_unaccent(coalesce(razon_social,'') || ' ' || coalesce(nombre_fantasia,''))));

create table proveedores (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  razon_social   text not null check (length(btrim(razon_social)) > 0),
  cuit           text check (cuit is null or es_cuit_valido(cuit)),
  condicion_iva  condicion_iva not null default 'RESPONSABLE_INSCRIPTO',
  email          text,
  telefono       text,
  domicilio      text,
  observaciones  text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  unique (empresa_id, cuit)
);
create index on proveedores (empresa_id, activo);

create table productos (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references empresas(id) on delete cascade,
  codigo                   text not null check (length(btrim(codigo)) > 0),
  codigo_barras            text,
  nombre                   text not null check (length(btrim(nombre)) > 0),
  descripcion              text,
  categoria_id             uuid references categorias(id) on delete set null,
  unidad_medida            text not null default 'UNIDAD',
  alicuota_iva             numeric(5,2) not null default 21
                           check (alicuota_iva in (0, 10.5, 21, 27)),
  precio_costo             numeric(15,2) not null default 0 check (precio_costo >= 0),
  maneja_stock             boolean not null default true,
  stock_minimo             numeric(15,4) not null default 0 check (stock_minimo >= 0),
  permite_venta_sin_stock  boolean not null default false,
  activo                   boolean not null default true,
  creado_en                timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index on productos (empresa_id, activo);
create unique index productos_codigo_barras_idx
  on productos (empresa_id, codigo_barras) where codigo_barras is not null;
create index productos_busqueda_idx on productos
  using gin (to_tsvector('simple',
    f_unaccent(coalesce(codigo,'') || ' ' || coalesce(nombre,''))));

create table precios (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  producto_id      uuid not null references productos(id) on delete cascade,
  lista_precio_id  uuid not null references listas_precios(id) on delete cascade,
  precio_neto      numeric(15,2) not null check (precio_neto >= 0),
  actualizado_en   timestamptz not null default now(),
  unique (producto_id, lista_precio_id)
);
create index on precios (empresa_id, lista_precio_id);
