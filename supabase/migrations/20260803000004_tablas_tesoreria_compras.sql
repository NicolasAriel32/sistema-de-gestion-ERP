-- =====================================================================
-- GestiónPyme · FASE 0 — Tesorería, cuentas corrientes, compras,
-- auditoría y cola de webhooks
--
-- Nota de alcance: no hay cartera de cheques. Los medios de pago del
-- MVP son efectivo, transferencia y tarjeta.
-- =====================================================================

create table medios_pago (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  nombre              text not null check (length(btrim(nombre)) > 0),
  tipo                tipo_medio_pago not null,
  cuenta_destino      text,
  recargo_porcentaje  numeric(7,4) not null default 0 check (recargo_porcentaje >= 0),
  activo              boolean not null default true,
  creado_en           timestamptz not null default now(),
  unique (empresa_id, nombre)
);

create table cajas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  nombre      text not null check (length(btrim(nombre)) > 0),
  activa      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (empresa_id, nombre)
);

create table caja_sesiones (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  caja_id          uuid not null references cajas(id) on delete restrict,
  usuario_apertura uuid references auth.users(id) on delete set null,
  fecha_apertura   timestamptz not null default now(),
  saldo_inicial    numeric(15,2) not null default 0,
  usuario_cierre   uuid references auth.users(id) on delete set null,
  fecha_cierre     timestamptz,
  saldo_declarado  numeric(15,2),
  saldo_sistema    numeric(15,2),
  diferencia       numeric(15,2),
  estado           estado_caja_sesion not null default 'ABIERTA',
  creado_en        timestamptz not null default now(),
  constraint caja_sesion_cierre_completo
    check (estado = 'ABIERTA' or (fecha_cierre is not null and saldo_declarado is not null))
);
-- Una sola sesión abierta por caja.
create unique index caja_sesiones_una_abierta
  on caja_sesiones (caja_id) where estado = 'ABIERTA';
create index on caja_sesiones (empresa_id, fecha_apertura);

create table movimientos_caja (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  caja_sesion_id   uuid not null references caja_sesiones(id) on delete restrict,
  fecha            timestamptz not null default now(),
  tipo             tipo_movimiento_caja not null,
  concepto         text not null check (length(btrim(concepto)) > 0),
  medio_pago_id    uuid not null references medios_pago(id) on delete restrict,
  importe          numeric(15,2) not null check (importe > 0),
  comprobante_id   uuid references comprobantes(id) on delete restrict,
  usuario_id       uuid references auth.users(id) on delete set null,
  creado_en        timestamptz not null default now()
);
create index on movimientos_caja (caja_sesion_id);
create index on movimientos_caja (empresa_id, fecha);

-- ---------------------------------------------------------------------
-- CUENTAS CORRIENTES (append-only). Saldo = SUM(debe) - SUM(haber).
-- ---------------------------------------------------------------------
create table cta_cte_movimientos (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresas(id) on delete cascade,
  entidad_tipo      entidad_tipo not null,
  entidad_id        uuid not null,
  fecha             date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  fecha_vencimiento date,
  concepto          text not null check (length(btrim(concepto)) > 0),
  comprobante_id    uuid references comprobantes(id) on delete restrict,
  debe              numeric(15,2) not null default 0 check (debe >= 0),
  haber             numeric(15,2) not null default 0 check (haber >= 0),
  usuario_id        uuid references auth.users(id) on delete set null,
  creado_en         timestamptz not null default now(),
  -- Un movimiento es débito o crédito, nunca las dos cosas ni ninguna.
  constraint cta_cte_debe_o_haber
    check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0))
);
create index on cta_cte_movimientos (empresa_id, entidad_tipo, entidad_id, fecha);
create index on cta_cte_movimientos (comprobante_id);

-- ---------------------------------------------------------------------
-- COMPRAS — circuito propio: el número lo trae el proveedor, no lo
-- genera el sistema, y admite huecos por definición.
-- ---------------------------------------------------------------------
create table ordenes_compra (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  numero         bigint not null check (numero > 0),
  proveedor_id   uuid not null references proveedores(id) on delete restrict,
  deposito_id    uuid references depositos(id) on delete restrict,
  fecha          date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  fecha_entrega  date,
  estado         estado_orden_compra not null default 'BORRADOR',
  moneda         char(3) not null default 'ARS',
  cotizacion     numeric(15,6) not null default 1 check (cotizacion > 0),
  neto           numeric(15,2) not null default 0,
  iva            numeric(15,2) not null default 0,
  total          numeric(15,2) not null default 0,
  observaciones  text,
  creado_por     uuid references auth.users(id) on delete set null,
  creado_en      timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index on ordenes_compra (empresa_id, proveedor_id, fecha);

create table orden_compra_items (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references empresas(id) on delete cascade,
  orden_compra_id    uuid not null references ordenes_compra(id) on delete cascade,
  orden              integer not null check (orden > 0),
  producto_id        uuid references productos(id) on delete restrict,
  descripcion        text not null,
  cantidad           numeric(15,4) not null check (cantidad > 0),
  cantidad_recibida  numeric(15,4) not null default 0 check (cantidad_recibida >= 0),
  precio_unitario    numeric(15,2) not null check (precio_unitario >= 0),
  alicuota_iva       numeric(5,2) not null default 21 check (alicuota_iva in (0, 10.5, 21, 27)),
  subtotal_neto      numeric(15,2) not null,
  subtotal_iva       numeric(15,2) not null,
  subtotal           numeric(15,2) not null,
  unique (orden_compra_id, orden)
);
create index on orden_compra_items (orden_compra_id);

create table compras (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  proveedor_id        uuid not null references proveedores(id) on delete restrict,
  orden_compra_id     uuid references ordenes_compra(id) on delete set null,
  -- Identificación del comprobante TAL COMO VIENE del proveedor.
  tipo_comprobante    tipo_comprobante not null,
  letra               letra_comprobante not null,
  punto_venta_numero  integer not null check (punto_venta_numero between 0 and 99999),
  numero              bigint not null check (numero > 0),
  cae_proveedor       text,
  fecha_emision       date not null,
  fecha_vencimiento   date,
  fecha_registracion  date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  deposito_id         uuid references depositos(id) on delete restrict,
  condicion_venta     condicion_venta not null default 'CONTADO',
  moneda              char(3) not null default 'ARS',
  cotizacion          numeric(15,6) not null default 1 check (cotizacion > 0),
  neto_gravado        numeric(15,2) not null default 0,
  neto_no_gravado     numeric(15,2) not null default 0,
  exento              numeric(15,2) not null default 0,
  iva_105             numeric(15,2) not null default 0,
  iva_21              numeric(15,2) not null default 0,
  iva_27              numeric(15,2) not null default 0,
  total_percepciones  numeric(15,2) not null default 0,
  total               numeric(15,2) not null default 0,
  -- Sólo A y M dan crédito fiscal a un responsable inscripto. B y C no.
  da_credito_fiscal   boolean not null generated always as (letra in ('A','M')) stored,
  estado              estado_compra not null default 'BORRADOR',
  observaciones       text,
  creado_por          uuid references auth.users(id) on delete set null,
  creado_en           timestamptz not null default now(),
  -- Antiduplicado de carga: el mismo comprobante del mismo proveedor
  -- no puede registrarse dos veces.
  constraint compras_identificacion_unica
    unique (empresa_id, proveedor_id, tipo_comprobante, punto_venta_numero, numero)
);
create index on compras (empresa_id, fecha_emision);
create index on compras (empresa_id, proveedor_id);

create table compra_items (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  compra_id        uuid not null references compras(id) on delete cascade,
  orden            integer not null check (orden > 0),
  producto_id      uuid references productos(id) on delete restrict,
  descripcion      text not null,
  cantidad         numeric(15,4) not null check (cantidad <> 0),
  precio_unitario  numeric(15,2) not null check (precio_unitario >= 0),
  alicuota_iva     numeric(5,2) not null default 21 check (alicuota_iva in (0, 10.5, 21, 27)),
  subtotal_neto    numeric(15,2) not null,
  subtotal_iva     numeric(15,2) not null,
  subtotal         numeric(15,2) not null,
  unique (compra_id, orden)
);
create index on compra_items (compra_id);

-- El Libro IVA Digital exige las percepciones itemizadas por tipo y
-- jurisdicción: no alcanza con una columna de "otros impuestos".
create table compra_percepciones (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  compra_id      uuid not null references compras(id) on delete cascade,
  tipo           tipo_percepcion not null,
  jurisdiccion   text,
  base_imponible numeric(15,2) not null default 0 check (base_imponible >= 0),
  alicuota       numeric(7,4) not null default 0 check (alicuota >= 0),
  importe        numeric(15,2) not null check (importe >= 0)
);
create index on compra_percepciones (compra_id);

-- ---------------------------------------------------------------------
-- AUDITORÍA (append-only)
-- ---------------------------------------------------------------------
create table audit_log (
  id             bigserial primary key,
  empresa_id     uuid references empresas(id) on delete set null,
  usuario_id     uuid references auth.users(id) on delete set null,
  tabla          text not null,
  registro_id    text not null,
  accion         accion_audit not null,
  datos_previos  jsonb,
  datos_nuevos   jsonb,
  ip             inet,
  user_agent     text,
  creado_en      timestamptz not null default now()
);
create index on audit_log (empresa_id, creado_en desc);
create index on audit_log (tabla, registro_id);

-- ---------------------------------------------------------------------
-- COLA DE WEBHOOKS A n8n (fire-and-forget con reintentos).
-- Una venta nunca se bloquea por una automatización.
-- ---------------------------------------------------------------------
create table webhook_eventos (
  id              bigserial primary key,
  empresa_id      uuid not null references empresas(id) on delete cascade,
  evento          text not null,
  payload         jsonb not null,
  estado          estado_webhook not null default 'PENDIENTE',
  intentos        integer not null default 0 check (intentos >= 0),
  ultimo_error    text,
  proximo_intento timestamptz not null default now(),
  enviado_en      timestamptz,
  creado_en       timestamptz not null default now()
);
create index on webhook_eventos (estado, proximo_intento);
create index on webhook_eventos (empresa_id, creado_en desc);
