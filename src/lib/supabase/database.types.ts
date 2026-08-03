/**
 * Tipos del schema `public`: catálogos y tenencia (Fase 1) más
 * comprobantes, stock y cuentas corrientes (Fase 2).
 *
 * Escrito a mano a partir de las migraciones (no generado). Las fases
 * siguientes amplían este archivo con tesorería y compras. Mantener en
 * sincronía con las migraciones de `supabase/migrations/`.
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
    };
    Views: {
      stock_saldos: {
        Row: {
          empresa_id: string;
          producto_id: string;
          deposito_id: string;
          saldo: number;
          ultimo_movimiento: Timestamp;
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
    };
    CompositeTypes: Record<string, never>;
  };
};

/** Atajo: fila de una tabla del schema public. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
