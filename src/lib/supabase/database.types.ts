/**
 * Tipos del schema `public`: catálogos y tenencia (Fase 1), comprobantes
 * y cuentas corrientes (Fase 2), stock y compras (Fase 3).
 *
 * Escrito a mano a partir de las migraciones (no generado). Las fases
 * siguientes amplían este archivo con tesorería. Mantener en sincronía
 * con las migraciones de `supabase/migrations/`.
 *
 * Convención: `Update: never` marca las tablas append-only, donde el
 * trigger de Postgres rechaza cualquier UPDATE.
 *
 * Las tablas de compras y órdenes de compra sí declaran Insert y Update,
 * pero NO deben escribirse con `.insert()`: su alta pasa por
 * `registrar_compra` y `crear_orden_compra_borrador`, que son las que
 * mueven stock, actualizan el costo, imputan contra la orden y tocan la
 * cuenta corriente. Un insert directo dejaría todos esos efectos sin
 * hacer y la base quedaría formalmente consistente pero contablemente
 * mal.
 */

export type CondicionIva =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTO'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL'
  | 'NO_ALCANZADO';

export type CondicionIvaEmisor = 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';

export type RolUsuario = 'ADMIN' | 'VENDEDOR' | 'DEPOSITO' | 'CONTABLE';

export type TipoDocumento = 'CUIT' | 'CUIL' | 'DNI' | 'PASAPORTE' | 'SIN_IDENTIFICAR';

export type TipoEmision = 'ELECTRONICA' | 'CONTROLADOR_FISCAL' | 'MANUAL' | 'NO_FISCAL';

export type TipoAjusteLista = 'MANUAL' | 'MARKUP_SOBRE_COSTO' | 'PORCENTAJE_SOBRE_LISTA';

// --- Fase 2 -----------------------------------------------------------

export type LetraComprobante = 'A' | 'B' | 'C' | 'M' | 'E' | 'X';

export type TipoComprobante =
  | 'PRESUPUESTO'
  | 'PEDIDO'
  | 'REMITO'
  | 'FACTURA_A'
  | 'FACTURA_B'
  | 'FACTURA_C'
  | 'NC_A'
  | 'NC_B'
  | 'NC_C'
  | 'ND_A'
  | 'ND_B'
  | 'ND_C';

export type EstadoComprobante = 'BORRADOR' | 'EMITIDO' | 'ANULADO' | 'PAGADO' | 'PARCIAL';

export type CondicionVenta = 'CONTADO' | 'CUENTA_CORRIENTE';

export type TipoMovimientoStock =
  | 'INICIAL'
  | 'VENTA'
  | 'DEVOLUCION_CLIENTE'
  | 'COMPRA'
  | 'DEVOLUCION_PROVEEDOR'
  | 'AJUSTE'
  | 'TRANSFERENCIA_SALIDA'
  | 'TRANSFERENCIA_ENTRADA';

export type EntidadTipo = 'CLIENTE' | 'PROVEEDOR';

// --- Fase 3 -----------------------------------------------------------

export type EstadoOrdenCompra =
  | 'BORRADOR'
  | 'EMITIDA'
  | 'RECIBIDA_PARCIAL'
  | 'RECIBIDA'
  | 'ANULADA';

export type EstadoCompra = 'BORRADOR' | 'REGISTRADA' | 'PARCIAL' | 'PAGADA' | 'ANULADA';

export type TipoPercepcion = 'IVA' | 'GANANCIAS' | 'IIBB' | 'OTRO';

/** Fila que devuelve `kardex_producto`. */
export type RenglonKardexDb = {
  movimiento_id: string;
  fecha: string;
  tipo: TipoMovimientoStock;
  deposito_id: string;
  deposito_nombre: string;
  cantidad: number;
  entrada: number;
  salida: number;
  saldo: number;
  costo_unitario: number;
  comprobante_id: string | null;
  comprobante: string | null;
  motivo: string | null;
};

/** Tipo compuesto que devuelven las RPC de emisión. */
export type ResultadoEmision = {
  comprobante_id: string;
  numero: number;
  letra: LetraComprobante;
  estado: EstadoComprobante;
};

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string;
          razon_social: string;
          nombre_fantasia: string | null;
          cuit: string;
          condicion_iva: CondicionIvaEmisor;
          domicilio: string | null;
          localidad: string | null;
          provincia: string | null;
          ingresos_brutos: string | null;
          inicio_actividades: string | null;
          logo_url: string | null;
          activa: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          razon_social: string;
          nombre_fantasia?: string | null;
          cuit: string;
          condicion_iva: CondicionIvaEmisor;
          domicilio?: string | null;
          localidad?: string | null;
          provincia?: string | null;
          ingresos_brutos?: string | null;
          inicio_actividades?: string | null;
          logo_url?: string | null;
          activa?: boolean;
        };
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>;
        Relationships: [];
      };
      usuarios_empresa: {
        Row: {
          id: string;
          usuario_id: string;
          empresa_id: string;
          rol: RolUsuario;
          activo: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          usuario_id: string;
          empresa_id: string;
          rol: RolUsuario;
          activo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['usuarios_empresa']['Insert']>;
        Relationships: [];
      };
      categorias: {
        Row: {
          id: string;
          empresa_id: string;
          nombre: string;
          padre_id: string | null;
          activa: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          nombre: string;
          padre_id?: string | null;
          activa?: boolean;
        };
        Update: Partial<Database['public']['Tables']['categorias']['Insert']>;
        Relationships: [];
      };
      listas_precios: {
        Row: {
          id: string;
          empresa_id: string;
          nombre: string;
          tipo_ajuste: TipoAjusteLista;
          porcentaje: number;
          es_default: boolean;
          activa: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          nombre: string;
          tipo_ajuste?: TipoAjusteLista;
          porcentaje?: number;
          es_default?: boolean;
          activa?: boolean;
        };
        Update: Partial<Database['public']['Tables']['listas_precios']['Insert']>;
        Relationships: [];
      };
      depositos: {
        Row: {
          id: string;
          empresa_id: string;
          nombre: string;
          direccion: string | null;
          es_default: boolean;
          activo: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          nombre: string;
          direccion?: string | null;
          es_default?: boolean;
          activo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['depositos']['Insert']>;
        Relationships: [];
      };
      puntos_venta: {
        Row: {
          id: string;
          empresa_id: string;
          numero: number;
          descripcion: string | null;
          tipo_emision: TipoEmision;
          activo: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          numero: number;
          descripcion?: string | null;
          tipo_emision?: TipoEmision;
          activo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['puntos_venta']['Insert']>;
        Relationships: [];
      };
      clientes: {
        Row: {
          id: string;
          empresa_id: string;
          razon_social: string;
          nombre_fantasia: string | null;
          tipo_doc: TipoDocumento;
          cuit_dni: string | null;
          condicion_iva: CondicionIva;
          email: string | null;
          telefono: string | null;
          domicilio: string | null;
          localidad: string | null;
          provincia: string | null;
          lista_precio_id: string | null;
          limite_credito: number;
          dias_credito: number;
          observaciones: string | null;
          activo: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          razon_social: string;
          nombre_fantasia?: string | null;
          tipo_doc?: TipoDocumento;
          cuit_dni?: string | null;
          condicion_iva?: CondicionIva;
          email?: string | null;
          telefono?: string | null;
          domicilio?: string | null;
          localidad?: string | null;
          provincia?: string | null;
          lista_precio_id?: string | null;
          limite_credito?: number;
          dias_credito?: number;
          observaciones?: string | null;
          activo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['clientes']['Insert']>;
        Relationships: [];
      };
      proveedores: {
        Row: {
          id: string;
          empresa_id: string;
          razon_social: string;
          cuit: string | null;
          condicion_iva: CondicionIva;
          email: string | null;
          telefono: string | null;
          domicilio: string | null;
          observaciones: string | null;
          activo: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          razon_social: string;
          cuit?: string | null;
          condicion_iva?: CondicionIva;
          email?: string | null;
          telefono?: string | null;
          domicilio?: string | null;
          observaciones?: string | null;
          activo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['proveedores']['Insert']>;
        Relationships: [];
      };
      productos: {
        Row: {
          id: string;
          empresa_id: string;
          codigo: string;
          codigo_barras: string | null;
          nombre: string;
          descripcion: string | null;
          categoria_id: string | null;
          unidad_medida: string;
          alicuota_iva: number;
          precio_costo: number;
          maneja_stock: boolean;
          stock_minimo: number;
          permite_venta_sin_stock: boolean;
          activo: boolean;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          codigo: string;
          codigo_barras?: string | null;
          nombre: string;
          descripcion?: string | null;
          categoria_id?: string | null;
          unidad_medida?: string;
          alicuota_iva?: number;
          precio_costo?: number;
          maneja_stock?: boolean;
          stock_minimo?: number;
          permite_venta_sin_stock?: boolean;
          activo?: boolean;
        };
        Update: Partial<Database['public']['Tables']['productos']['Insert']>;
        Relationships: [];
      };
      precios: {
        Row: {
          id: string;
          empresa_id: string;
          producto_id: string;
          lista_precio_id: string;
          precio_neto: number;
          actualizado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          producto_id: string;
          lista_precio_id: string;
          precio_neto: number;
          actualizado_en?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['precios']['Insert']>;
        Relationships: [];
      };

      // --- Fase 2: comprobantes de venta --------------------------------

      comprobantes: {
        Row: {
          id: string;
          empresa_id: string;
          tipo_comprobante: TipoComprobante;
          punto_venta_id: string;
          /** NULL mientras el comprobante está en BORRADOR: no ocupa número. */
          numero: number | null;
          letra: LetraComprobante;
          fecha_emision: string;
          fecha_vencimiento: string | null;
          cliente_id: string;
          vendedor_id: string | null;
          deposito_id: string | null;
          lista_precio_id: string | null;
          condicion_venta: CondicionVenta;
          moneda: string;
          cotizacion: number;
          neto_gravado: number;
          neto_no_gravado: number;
          exento: number;
          iva_105: number;
          iva_21: number;
          iva_27: number;
          otros_impuestos: number;
          descuento_porcentaje: number;
          descuento_importe: number;
          total: number;
          estado: EstadoComprobante;
          cae: string | null;
          cae_vencimiento: string | null;
          afip_estado: string | null;
          afip_observaciones: string | null;
          comprobante_origen_id: string | null;
          observaciones: string | null;
          creado_por: string | null;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          tipo_comprobante: TipoComprobante;
          punto_venta_id: string;
          numero?: number | null;
          letra: LetraComprobante;
          fecha_emision?: string;
          fecha_vencimiento?: string | null;
          cliente_id: string;
          vendedor_id?: string | null;
          deposito_id?: string | null;
          lista_precio_id?: string | null;
          condicion_venta?: CondicionVenta;
          moneda?: string;
          cotizacion?: number;
          neto_gravado?: number;
          neto_no_gravado?: number;
          exento?: number;
          iva_105?: number;
          iva_21?: number;
          iva_27?: number;
          otros_impuestos?: number;
          descuento_porcentaje?: number;
          descuento_importe?: number;
          total?: number;
          estado?: EstadoComprobante;
          cae?: string | null;
          cae_vencimiento?: string | null;
          afip_estado?: string | null;
          afip_observaciones?: string | null;
          comprobante_origen_id?: string | null;
          observaciones?: string | null;
          creado_por?: string | null;
          creado_en?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['comprobantes']['Insert']>;
        Relationships: [];
      };

      comprobante_items: {
        Row: {
          id: string;
          empresa_id: string;
          comprobante_id: string;
          orden: number;
          producto_id: string | null;
          descripcion: string;
          cantidad: number;
          precio_unitario: number;
          descuento_porcentaje: number;
          alicuota_iva: number;
          subtotal_neto: number;
          subtotal_iva: number;
          subtotal: number;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          comprobante_id: string;
          orden: number;
          producto_id?: string | null;
          descripcion: string;
          cantidad: number;
          precio_unitario: number;
          descuento_porcentaje?: number;
          alicuota_iva: number;
          subtotal_neto: number;
          subtotal_iva: number;
          subtotal: number;
        };
        Update: Partial<Database['public']['Tables']['comprobante_items']['Insert']>;
        Relationships: [];
      };

      comprobante_contadores: {
        Row: {
          empresa_id: string;
          punto_venta_id: string;
          tipo_comprobante: TipoComprobante;
          ultimo_numero: number;
          actualizado_en: Timestamp;
        };
        Insert: {
          empresa_id: string;
          punto_venta_id: string;
          tipo_comprobante: TipoComprobante;
          ultimo_numero?: number;
          actualizado_en?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['comprobante_contadores']['Insert']>;
        Relationships: [];
      };

      stock_movimientos: {
        Row: {
          id: string;
          empresa_id: string;
          producto_id: string;
          deposito_id: string;
          fecha: Timestamp;
          tipo: TipoMovimientoStock;
          cantidad: number;
          costo_unitario: number;
          comprobante_id: string | null;
          motivo: string | null;
          usuario_id: string | null;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          producto_id: string;
          deposito_id: string;
          fecha?: Timestamp;
          tipo: TipoMovimientoStock;
          cantidad: number;
          costo_unitario?: number;
          comprobante_id?: string | null;
          motivo?: string | null;
          usuario_id?: string | null;
          creado_en?: Timestamp;
        };
        /** Tabla append-only: el trigger rechaza UPDATE y DELETE. */
        Update: never;
        Relationships: [];
      };

      cta_cte_movimientos: {
        Row: {
          id: string;
          empresa_id: string;
          entidad_tipo: EntidadTipo;
          entidad_id: string;
          fecha: string;
          fecha_vencimiento: string | null;
          concepto: string;
          comprobante_id: string | null;
          debe: number;
          haber: number;
          usuario_id: string | null;
          creado_en: Timestamp;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          entidad_tipo: EntidadTipo;
          entidad_id: string;
          fecha?: string;
          fecha_vencimiento?: string | null;
          concepto: string;
          comprobante_id?: string | null;
          debe?: number;
          haber?: number;
          usuario_id?: string | null;
          creado_en?: Timestamp;
        };
        /** Tabla append-only: el trigger rechaza UPDATE y DELETE. */
        Update: never;
        Relationships: [];
      };

      // --- Fase 3: compras ---------------------------------------------

      ordenes_compra: {
        Row: {
          id: string;
          empresa_id: string;
          numero: number;
          proveedor_id: string;
          deposito_id: string | null;
          fecha: string;
          fecha_entrega: string | null;
          estado: EstadoOrdenCompra;
          moneda: string;
          cotizacion: number;
          neto: number;
          iva: number;
          total: number;
          observaciones: string | null;
          creado_por: string | null;
          creado_en: Timestamp;
        };
        /**
         * El alta real va por `crear_orden_compra_borrador`, que asigna el
         * número con lock de fila. Escribir por `.insert()` se saltearía
         * el contador.
         */
        Insert: Omit<
          Database['public']['Tables']['ordenes_compra']['Row'],
          'id' | 'creado_en'
        >;
        Update: Partial<Database['public']['Tables']['ordenes_compra']['Insert']>;
        Relationships: [];
      };

      orden_compra_items: {
        Row: {
          id: string;
          empresa_id: string;
          orden_compra_id: string;
          orden: number;
          producto_id: string | null;
          descripcion: string;
          cantidad: number;
          cantidad_recibida: number;
          precio_unitario: number;
          alicuota_iva: number;
          subtotal_neto: number;
          subtotal_iva: number;
          subtotal: number;
        };
        Insert: Omit<Database['public']['Tables']['orden_compra_items']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['orden_compra_items']['Insert']>;
        Relationships: [];
      };

      compras: {
        Row: {
          id: string;
          empresa_id: string;
          proveedor_id: string;
          orden_compra_id: string | null;
          tipo_comprobante: TipoComprobante;
          letra: LetraComprobante;
          punto_venta_numero: number;
          numero: number;
          cae_proveedor: string | null;
          fecha_emision: string;
          fecha_vencimiento: string | null;
          fecha_registracion: string;
          deposito_id: string | null;
          condicion_venta: CondicionVenta;
          moneda: string;
          cotizacion: number;
          neto_gravado: number;
          neto_no_gravado: number;
          exento: number;
          iva_105: number;
          iva_21: number;
          iva_27: number;
          total_percepciones: number;
          total: number;
          /** Columna generada: sólo A y M dan crédito fiscal. */
          da_credito_fiscal: boolean;
          estado: EstadoCompra;
          observaciones: string | null;
          creado_por: string | null;
          creado_en: Timestamp;
        };
        /**
         * El alta real va por `registrar_compra`, que además ingresa la
         * mercadería, actualiza el costo y toca la cuenta corriente.
         * Escribir por `.insert()` dejaría esos efectos sin hacer.
         */
        Insert: Omit<
          Database['public']['Tables']['compras']['Row'],
          'id' | 'creado_en' | 'da_credito_fiscal' | 'fecha_registracion'
        >;
        Update: Partial<Database['public']['Tables']['compras']['Insert']>;
        Relationships: [];
      };

      compra_items: {
        Row: {
          id: string;
          empresa_id: string;
          compra_id: string;
          orden: number;
          producto_id: string | null;
          descripcion: string;
          cantidad: number;
          precio_unitario: number;
          alicuota_iva: number;
          subtotal_neto: number;
          subtotal_iva: number;
          subtotal: number;
        };
        Insert: Omit<Database['public']['Tables']['compra_items']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['compra_items']['Insert']>;
        Relationships: [];
      };

      compra_percepciones: {
        Row: {
          id: string;
          empresa_id: string;
          compra_id: string;
          tipo: TipoPercepcion;
          jurisdiccion: string | null;
          base_imponible: number;
          alicuota: number;
          importe: number;
        };
        Insert: Omit<Database['public']['Tables']['compra_percepciones']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['compra_percepciones']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      /**
       * Una fila por (producto que maneja stock × depósito activo),
       * incluidos los que están en cero.
       */
      stock_saldos: {
        Row: {
          empresa_id: string;
          producto_id: string;
          deposito_id: string;
          saldo: number;
          ultimo_movimiento: Timestamp | null;
          codigo: string;
          nombre: string;
          unidad_medida: string;
          stock_minimo: number;
          precio_costo: number;
          activo: boolean;
          deposito_nombre: string;
          valorizado: number;
          bajo_minimo: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      confirmar_emision_comprobante: {
        Args: {
          p_comprobante_id: string;
          p_numero: number;
          p_cae?: string | null;
          p_cae_vencimiento?: string | null;
          p_afip_estado?: string | null;
          p_forzar_credito?: boolean;
        };
        Returns: ResultadoEmision;
      };
      emitir_comprobante_no_fiscal: {
        Args: { p_comprobante_id: string };
        Returns: ResultadoEmision;
      };
      registrar_fallo_autorizacion: {
        Args: {
          p_comprobante_id: string;
          p_estado: string | null;
          p_observaciones: string | null;
        };
        Returns: undefined;
      };
      crear_nota_credito_borrador: {
        Args: { p_comprobante_origen_id: string; p_motivo: string };
        Returns: string;
      };
      crear_comprobante_borrador: {
        Args: { p_datos: Record<string, unknown> };
        Returns: string;
      };
      actualizar_comprobante_borrador: {
        Args: { p_comprobante_id: string; p_datos: Record<string, unknown> };
        Returns: string;
      };
      saldos_de_productos: {
        Args: {
          p_empresa_id: string;
          p_producto_ids: string[];
          p_deposito_id?: string | null;
        };
        Returns: { producto_id: string; deposito_id: string; saldo: number }[];
      };
      proximo_numero_tentativo: {
        Args: {
          p_empresa_id: string;
          p_punto_venta_id: string;
          p_tipo: TipoComprobante;
        };
        Returns: number;
      };
      sincronizar_contador_comprobante: {
        Args: {
          p_empresa_id: string;
          p_punto_venta_id: string;
          p_tipo: TipoComprobante;
          p_ultimo_numero: number;
        };
        Returns: number;
      };
      saldo_cta_cte: {
        Args: { p_entidad_tipo: EntidadTipo; p_entidad_id: string };
        Returns: number;
      };
      saldo_stock: {
        Args: { p_producto_id: string; p_deposito_id?: string | null };
        Returns: number;
      };

      // --- Fase 3: stock ------------------------------------------------

      ajustar_stock: {
        Args: {
          p_empresa_id: string;
          p_producto_id: string;
          p_deposito_id: string;
          p_cantidad: number;
          p_motivo: string;
          p_costo_unitario?: number | null;
        };
        Returns: string;
      };
      transferir_stock: {
        Args: {
          p_empresa_id: string;
          p_producto_id: string;
          p_origen_id: string;
          p_destino_id: string;
          p_cantidad: number;
          p_motivo?: string | null;
        };
        /** [movimiento de salida, movimiento de entrada] */
        Returns: [string, string];
      };
      kardex_producto: {
        Args: {
          p_empresa_id: string;
          p_producto_id: string;
          p_deposito_id?: string | null;
          p_desde?: string | null;
          p_hasta?: string | null;
        };
        Returns: RenglonKardexDb[];
      };
      productos_bajo_minimo: {
        Args: { p_empresa_id: string };
        Returns: {
          producto_id: string;
          codigo: string;
          nombre: string;
          stock_minimo: number;
          saldo_total: number;
          faltante: number;
        }[];
      };
      stock_valorizado: {
        Args: { p_empresa_id: string; p_deposito_id?: string | null };
        Returns: {
          producto_id: string;
          codigo: string;
          nombre: string;
          saldo: number;
          precio_costo: number;
          valorizado: number;
        }[];
      };

      // --- Fase 3: compras ----------------------------------------------

      crear_orden_compra_borrador: {
        Args: { p_datos: Record<string, unknown> };
        Returns: string;
      };
      actualizar_orden_compra_borrador: {
        Args: { p_orden_compra_id: string; p_datos: Record<string, unknown> };
        Returns: string;
      };
      emitir_orden_compra: {
        Args: { p_orden_compra_id: string };
        Returns: string;
      };
      anular_orden_compra: {
        Args: { p_orden_compra_id: string; p_motivo: string };
        Returns: string;
      };
      registrar_compra: {
        Args: { p_datos: Record<string, unknown> };
        Returns: string;
      };
      anular_compra: {
        Args: { p_compra_id: string; p_motivo: string };
        Returns: string;
      };
      pendiente_orden_compra: {
        Args: { p_orden_compra_id: string };
        Returns: {
          producto_id: string | null;
          descripcion: string;
          cantidad: number;
          cantidad_recibida: number;
          pendiente: number;
          precio_unitario: number;
          alicuota_iva: number;
        }[];
      };
    };
    Enums: {
      condicion_iva: CondicionIva;
      rol_usuario: RolUsuario;
      tipo_documento: TipoDocumento;
      tipo_emision: TipoEmision;
      tipo_ajuste_lista: TipoAjusteLista;
      letra_comprobante: LetraComprobante;
      tipo_comprobante: TipoComprobante;
      estado_comprobante: EstadoComprobante;
      condicion_venta: CondicionVenta;
      tipo_movimiento_stock: TipoMovimientoStock;
      entidad_tipo: EntidadTipo;
      estado_orden_compra: EstadoOrdenCompra;
      estado_compra: EstadoCompra;
      tipo_percepcion: TipoPercepcion;
    };
    CompositeTypes: Record<string, never>;
  };
};

/** Atajo: fila de una tabla del schema public. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
