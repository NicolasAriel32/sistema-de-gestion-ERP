-- =====================================================================
-- GestiónPyme · FASE 0 — Comprobantes de venta y stock
-- =====================================================================

create table comprobantes (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresas(id) on delete restrict,
  tipo_comprobante      tipo_comprobante not null,
  punto_venta_id        uuid not null references puntos_venta(id) on delete restrict,
  numero                bigint not null check (numero > 0),
  letra                 letra_comprobante not null,

  fecha_emision         date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  fecha_vencimiento     date,

  cliente_id            uuid not null references clientes(id) on delete restrict,
  vendedor_id           uuid references auth.users(id) on delete set null,
  deposito_id           uuid references depositos(id) on delete restrict,
  lista_precio_id       uuid references listas_precios(id) on delete set null,
  condicion_venta       condicion_venta not null default 'CONTADO',

  -- Multi-moneda previsto; el MVP opera sólo en ARS.
  moneda                char(3) not null default 'ARS' check (moneda = upper(moneda)),
  cotizacion            numeric(15,6) not null default 1 check (cotizacion > 0),

  neto_gravado          numeric(15,2) not null default 0,
  neto_no_gravado       numeric(15,2) not null default 0,
  exento                numeric(15,2) not null default 0,
  iva_105               numeric(15,2) not null default 0,
  iva_21                numeric(15,2) not null default 0,
  iva_27                numeric(15,2) not null default 0,
  otros_impuestos       numeric(15,2) not null default 0,
  descuento_porcentaje  numeric(7,4) not null default 0 check (descuento_porcentaje between 0 and 100),
  descuento_importe     numeric(15,2) not null default 0,
  total                 numeric(15,2) not null default 0,

  estado                estado_comprobante not null default 'BORRADOR',

  cae                   text check (cae is null or cae ~ '^[0-9]{14}$'),
  cae_vencimiento       date,
  afip_estado           text,
  afip_observaciones    text,

  comprobante_origen_id uuid references comprobantes(id) on delete restrict,
  observaciones         text,
  creado_por            uuid references auth.users(id) on delete set null,
  creado_en             timestamptz not null default now(),

  -- Restricción NO NEGOCIABLE: numeración única por talonario.
  constraint comprobantes_numeracion_unica
    unique (empresa_id, punto_venta_id, tipo_comprobante, numero),
  -- Toda nota de crédito o débito referencia su comprobante de origen.
  constraint comprobantes_nc_nd_requiere_origen
    check (tipo_comprobante not in ('NC_A','NC_B','NC_C','ND_A','ND_B','ND_C')
           or comprobante_origen_id is not null),
  -- La letra no puede contradecir al tipo.
  constraint comprobantes_letra_coherente
    check (letra = letra_de_tipo(tipo_comprobante))
);
create index on comprobantes (empresa_id, fecha_emision);
create index on comprobantes (empresa_id, cliente_id);
create index on comprobantes (empresa_id, estado);
create index on comprobantes (comprobante_origen_id);

create table comprobante_items (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresas(id) on delete cascade,
  comprobante_id        uuid not null references comprobantes(id) on delete cascade,
  orden                 integer not null check (orden > 0),
  producto_id           uuid references productos(id) on delete restrict,
  descripcion           text not null check (length(btrim(descripcion)) > 0),
  cantidad              numeric(15,4) not null check (cantidad <> 0),
  precio_unitario       numeric(15,2) not null check (precio_unitario >= 0),
  descuento_porcentaje  numeric(7,4) not null default 0 check (descuento_porcentaje between 0 and 100),
  alicuota_iva          numeric(5,2) not null check (alicuota_iva in (0, 10.5, 21, 27)),
  subtotal_neto         numeric(15,2) not null,
  subtotal_iva          numeric(15,2) not null,
  subtotal              numeric(15,2) not null,
  unique (comprobante_id, orden)
);
create index on comprobante_items (comprobante_id);
create index on comprobante_items (empresa_id, producto_id);

-- Contador de numeración. Prohibido MAX(numero)+1 desde la aplicación.
create table comprobante_contadores (
  empresa_id        uuid not null references empresas(id) on delete cascade,
  punto_venta_id    uuid not null references puntos_venta(id) on delete cascade,
  tipo_comprobante  tipo_comprobante not null,
  ultimo_numero     bigint not null default 0 check (ultimo_numero >= 0),
  actualizado_en    timestamptz not null default now(),
  primary key (empresa_id, punto_venta_id, tipo_comprobante)
);

-- ---------------------------------------------------------------------
-- STOCK (append-only)
-- ---------------------------------------------------------------------
create table stock_movimientos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete restrict,
  deposito_id     uuid not null references depositos(id) on delete restrict,
  fecha           timestamptz not null default now(),
  tipo            tipo_movimiento_stock not null,
  cantidad        numeric(15,4) not null check (cantidad <> 0),   -- + entrada / - salida
  costo_unitario  numeric(15,2) not null default 0 check (costo_unitario >= 0),
  comprobante_id  uuid references comprobantes(id) on delete restrict,
  motivo          text,
  usuario_id      uuid references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  -- Un ajuste manual sin motivo es un agujero de auditoría.
  constraint stock_ajuste_requiere_motivo
    check (tipo <> 'AJUSTE' or length(btrim(coalesce(motivo,''))) > 0)
);
create index on stock_movimientos (producto_id, deposito_id);
create index on stock_movimientos (empresa_id, fecha);
create index on stock_movimientos (comprobante_id);
