/**
 * Proveedor real contra ARCA (ex-AFIP), WSFEv1.
 *
 * FUERA DEL ALCANCE DEL MVP. El archivo existe para que la forma del
 * adaptador esté fijada y conectar el servicio real no obligue a tocar
 * nada más que este archivo.
 *
 * Lo que hace falta para implementarlo:
 *   · Certificado digital X.509 y clave privada, tramitados en ARCA.
 *   · WSAA: firmar un Login Ticket Request en CMS y obtener token + sign,
 *     que valen 12 horas y hay que cachear (ARCA bloquea por pedir de más).
 *   · WSFEv1: FECAESolicitar, FECompUltimoAutorizado, FEDummy.
 *   · Homologación antes de producción: son endpoints y certificados
 *     distintos.
 *
 * NOTA sobre numeración, para quien lo implemente: contra ARCA el último
 * número autorizado lo manda el organismo, no nuestra base. Por eso
 * `consultarUltimoNumero` es parte de la interfaz y el contador local se
 * sincroniza contra él antes de cada emisión. Si una autorización falla y
 * la emisión se reintenta con el número siguiente, verificar que no quede
 * un CAE otorgado sin comprobante asociado: ARCA lo tolera, pero conviene
 * registrarlo para las auditorías.
 */

import type {
  AutorizacionResult,
  ComprobanteInput,
  FacturacionProvider,
  ServidorStatus,
} from './provider';

const NO_IMPLEMENTADO =
  'Facturación electrónica real no implementada: requiere certificado digital y WSAA. ' +
  'Configurá FACTURACION_PROVIDER=mock.';

export class ArcaFacturacionProvider implements FacturacionProvider {
  readonly nombre = 'arca';

  async autorizar(comprobante: ComprobanteInput): Promise<AutorizacionResult> {
    throw new Error(
      `${NO_IMPLEMENTADO} (comprobante ${comprobante.tipoComprobante} N° ${comprobante.numero})`,
    );
  }

  async consultarUltimoNumero(ptoVenta: number): Promise<number> {
    throw new Error(`${NO_IMPLEMENTADO} (punto de venta ${ptoVenta})`);
  }

  async consultarEstadoServidor(): Promise<ServidorStatus> {
    throw new Error(NO_IMPLEMENTADO);
  }
}
