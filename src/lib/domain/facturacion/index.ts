import 'server-only';

import { getServerEnv } from '@/lib/env';

import { ArcaFacturacionProvider } from './arca';
import { MockFacturacionProvider } from './mock';
import type { FacturacionProvider } from './provider';

export type {
  AutorizacionError,
  AutorizacionOk,
  AutorizacionResult,
  ComprobanteInput as ComprobanteAfipInput,
  FacturacionProvider,
  ServidorStatus,
} from './provider';
export { MockFacturacionProvider } from './mock';
export { ArcaFacturacionProvider } from './arca';

let instancia: FacturacionProvider | null = null;

/**
 * Proveedor de facturación en uso, resuelto por `FACTURACION_PROVIDER`.
 *
 * Se cachea en el módulo: el mock no tiene estado y el de ARCA va a
 * cachear el token de WSAA, que dura 12 horas y no conviene renovar en
 * cada request.
 */
export function getFacturacionProvider(): FacturacionProvider {
  if (instancia) return instancia;

  const { FACTURACION_PROVIDER } = getServerEnv();
  instancia =
    FACTURACION_PROVIDER === 'arca'
      ? new ArcaFacturacionProvider()
      : new MockFacturacionProvider();

  return instancia;
}

/** Sólo para tests: descarta la instancia cacheada. */
export function resetFacturacionProvider(): void {
  instancia = null;
}
