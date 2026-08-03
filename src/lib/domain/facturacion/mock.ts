/**
 * Proveedor de facturación simulado. Única implementación del MVP.
 *
 * No es un stub complaciente: simula latencia y falla el 5% de las veces,
 * a propósito, para que el manejo de errores del sistema se ejercite en
 * desarrollo y no debute en producción. Un mock que nunca falla esconde
 * exactamente los bugs que importan.
 */

import { hoyIso, sumarDiasIso } from '@/lib/fechas';

import type {
  AutorizacionResult,
  ComprobanteInput,
  FacturacionProvider,
  ServidorStatus,
} from './provider';

const DIAS_VIGENCIA_CAE = 10;

/** Fallas simuladas, con la forma de las que devuelve AFIP de verdad. */
const FALLAS = [
  {
    codigo: '10016',
    mensaje:
      'El servicio de AFIP no respondió a tiempo. El comprobante quedó en borrador: podés reintentar la emisión.',
    reintentable: true,
  },
  {
    codigo: '10015',
    mensaje:
      'AFIP rechazó la solicitud por congestión del servicio. El número no se consumió: reintentá en unos segundos.',
    reintentable: true,
  },
  {
    codigo: '600',
    mensaje:
      'AFIP no pudo validar el CUIT del receptor en este momento. Revisá el dato y reintentá.',
    reintentable: true,
  },
] as const;

export type MockOpciones = {
  /** Probabilidad de falla, 0 a 1. Por defecto 0.05 (5%). */
  tasaFalla?: number;
  /** Latencia simulada en milisegundos. Por defecto 300. */
  latenciaMs?: number;
  /** Inyectable para que los tests sean deterministas. */
  random?: () => number;
  /** Inyectable para congelar la fecha en los tests. */
  ahora?: () => Date;
};

export class MockFacturacionProvider implements FacturacionProvider {
  readonly nombre = 'mock';

  private readonly tasaFalla: number;
  private readonly latenciaMs: number;
  private readonly random: () => number;
  private readonly ahora: () => Date;

  constructor(opciones: MockOpciones = {}) {
    this.tasaFalla = opciones.tasaFalla ?? 0.05;
    this.latenciaMs = opciones.latenciaMs ?? 300;
    this.random = opciones.random ?? Math.random;
    this.ahora = opciones.ahora ?? (() => new Date());
  }

  private async esperar(): Promise<void> {
    if (this.latenciaMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.latenciaMs));
  }

  /**
   * CAE ficticio de 14 dígitos, con la misma forma que el real: los
   * primeros 11 son un identificador y los 3 últimos, un correlativo.
   */
  private generarCae(): string {
    let cae = '';
    while (cae.length < 14) {
      cae += Math.floor(this.random() * 10).toString();
    }
    // Un CAE nunca arranca en cero.
    return cae[0] === '0' ? `7${cae.slice(1)}` : cae;
  }

  async autorizar(comprobante: ComprobanteInput): Promise<AutorizacionResult> {
    await this.esperar();

    // Validaciones que AFIP hace de verdad y conviene ejercitar acá.
    if (comprobante.numero <= 0) {
      return {
        ok: false,
        codigo: '10013',
        mensaje: 'El número de comprobante es inválido.',
        reintentable: false,
      };
    }

    if (
      (comprobante.tipoComprobante.startsWith('NC_') ||
        comprobante.tipoComprobante.startsWith('ND_')) &&
      comprobante.comprobanteAsociado === null
    ) {
      return {
        ok: false,
        codigo: '10062',
        mensaje: 'Una nota de crédito o débito debe informar el comprobante asociado.',
        reintentable: false,
      };
    }

    if (comprobante.letra === 'A' && !comprobante.documentoReceptor) {
      return {
        ok: false,
        codigo: '10018',
        mensaje: 'Una factura A exige el CUIT del receptor.',
        reintentable: false,
      };
    }

    if (this.random() < this.tasaFalla) {
      const falla = FALLAS[Math.floor(this.random() * FALLAS.length)] ?? FALLAS[0];
      return { ok: false, ...falla };
    }

    const emision = comprobante.fechaEmision || hoyIso(this.ahora());

    return {
      ok: true,
      cae: this.generarCae(),
      caeVencimiento: sumarDiasIso(emision, DIAS_VIGENCIA_CAE),
      estado: 'A',
      observaciones: null,
    };
  }

  /**
   * El mock no lleva registro propio de numeración: devuelve 0 para que
   * mande el contador local de la base. Contra ARCA real este método sí
   * consulta FECompUltimoAutorizado y pasa a ser la fuente de verdad.
   */
  async consultarUltimoNumero(): Promise<number> {
    await this.esperar();
    return 0;
  }

  async consultarEstadoServidor(): Promise<ServidorStatus> {
    await this.esperar();
    return {
      disponible: true,
      detalle: { appServer: 'OK', dbServer: 'OK', authServer: 'OK' },
    };
  }
}
