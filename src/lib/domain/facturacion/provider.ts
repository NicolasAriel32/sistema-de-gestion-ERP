/**
 * Adaptador de facturación electrónica.
 *
 * Toda la aplicación habla contra esta interfaz y nunca contra AFIP/ARCA
 * directamente. El MVP corre con `MockFacturacionProvider`; el día que
 * haya certificado digital y WSAA se implementa `ArcaFacturacionProvider`
 * y no cambia una línea del resto del sistema.
 */

import type {
  CondicionIva,
  LetraComprobante,
  TipoComprobante,
  TipoDocumento,
} from '@/lib/supabase/database.types';

export type ComprobanteInput = {
  /** Datos del emisor. */
  cuitEmisor: string;
  puntoVenta: number;
  tipoComprobante: TipoComprobante;
  letra: LetraComprobante;
  /**
   * Número tentativo para el que se pide la autorización. Si otra emisión
   * concurrente se queda con él, la operación se reintenta con el
   * siguiente y se vuelve a pedir autorización.
   */
  numero: number;

  /** Datos del receptor. */
  tipoDocReceptor: TipoDocumento;
  documentoReceptor: string | null;
  condicionIvaReceptor: CondicionIva;

  fechaEmision: string; // YYYY-MM-DD
  fechaVencimientoPago: string | null;

  moneda: string;
  cotizacion: number;

  netoGravado: number;
  netoNoGravado: number;
  exento: number;
  iva105: number;
  iva21: number;
  iva27: number;
  otrosImpuestos: number;
  total: number;

  /** Comprobante asociado, obligatorio en notas de crédito y débito. */
  comprobanteAsociado: {
    tipoComprobante: TipoComprobante;
    puntoVenta: number;
    numero: number;
  } | null;
};

export type AutorizacionOk = {
  ok: true;
  cae: string;
  /** YYYY-MM-DD */
  caeVencimiento: string;
  estado: 'A';
  observaciones: string | null;
};

export type AutorizacionError = {
  ok: false;
  /** Código del proveedor, útil para soporte. */
  codigo: string;
  /** Mensaje en castellano, apto para mostrarle al usuario tal cual. */
  mensaje: string;
  /** ¿Tiene sentido reintentar sin cambiar los datos? */
  reintentable: boolean;
};

export type AutorizacionResult = AutorizacionOk | AutorizacionError;

export type ServidorStatus = {
  disponible: boolean;
  /** Detalle por servicio, tal como lo devuelve el dummy de AFIP. */
  detalle: { appServer: string; dbServer: string; authServer: string };
};

export interface FacturacionProvider {
  /** Nombre corto para logs y para mostrar en la UI. */
  readonly nombre: string;

  autorizar(comprobante: ComprobanteInput): Promise<AutorizacionResult>;

  /**
   * Último número autorizado por el organismo para ese talonario. Es la
   * fuente de verdad de la numeración: el contador local se sincroniza
   * contra este valor antes de emitir.
   */
  consultarUltimoNumero(ptoVenta: number, tipoCbte: TipoComprobante): Promise<number>;

  consultarEstadoServidor(): Promise<ServidorStatus>;
}
