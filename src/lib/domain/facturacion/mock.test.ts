import { describe, expect, it } from 'vitest';

import { MockFacturacionProvider } from './mock';
import type { ComprobanteInput } from './provider';

function comprobante(parcial: Partial<ComprobanteInput> = {}): ComprobanteInput {
  return {
    cuitEmisor: '30500000003',
    puntoVenta: 1,
    tipoComprobante: 'FACTURA_A',
    letra: 'A',
    numero: 1,
    tipoDocReceptor: 'CUIT',
    documentoReceptor: '20123456786',
    condicionIvaReceptor: 'RESPONSABLE_INSCRIPTO',
    fechaEmision: '2026-08-03',
    fechaVencimientoPago: null,
    moneda: 'ARS',
    cotizacion: 1,
    netoGravado: 1000,
    netoNoGravado: 0,
    exento: 0,
    iva105: 0,
    iva21: 210,
    iva27: 0,
    otrosImpuestos: 0,
    total: 1210,
    comprobanteAsociado: null,
    ...parcial,
  };
}

/** Provider determinista: sin latencia y con un random fijo. */
function provider(random: number) {
  return new MockFacturacionProvider({ latenciaMs: 0, random: () => random });
}

describe('MockFacturacionProvider · autorización exitosa', () => {
  it('devuelve un CAE de 14 dígitos', async () => {
    const res = await provider(0.5).autorizar(comprobante());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cae).toMatch(/^[0-9]{14}$/);
  });

  it('el CAE nunca arranca en cero', async () => {
    // Con random 0 todos los dígitos salen 0: el primero tiene que corregirse.
    const todoCeros = new MockFacturacionProvider({
      latenciaMs: 0,
      tasaFalla: 0,
      random: () => 0,
    });
    const res = await todoCeros.autorizar(comprobante());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cae).toMatch(/^[1-9][0-9]{13}$/);
  });

  it('el CAE vence a los 10 días de la emisión', async () => {
    const res = await provider(0.5).autorizar(comprobante({ fechaEmision: '2026-08-03' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.caeVencimiento).toBe('2026-08-13');
  });

  it('calcula bien el vencimiento cruzando fin de mes', async () => {
    const res = await provider(0.5).autorizar(comprobante({ fechaEmision: '2026-12-28' }));
    if (res.ok) expect(res.caeVencimiento).toBe('2027-01-07');
  });

  it('informa el comprobante como aprobado', async () => {
    const res = await provider(0.5).autorizar(comprobante());
    if (res.ok) {
      expect(res.estado).toBe('A');
      expect(res.observaciones).toBeNull();
    }
  });
});

describe('MockFacturacionProvider · fallas simuladas', () => {
  it('falla cuando el azar cae dentro de la tasa configurada', async () => {
    const res = await provider(0.01).autorizar(comprobante());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reintentable).toBe(true);
    expect(res.mensaje).toMatch(/borrador|reintent/i);
  });

  it('la tasa de falla es configurable y puede anularse en los tests', async () => {
    const nuncaFalla = new MockFacturacionProvider({ latenciaMs: 0, tasaFalla: 0 });
    const res = await nuncaFalla.autorizar(comprobante());
    expect(res.ok).toBe(true);

    const siempreFalla = new MockFacturacionProvider({ latenciaMs: 0, tasaFalla: 1 });
    const res2 = await siempreFalla.autorizar(comprobante());
    expect(res2.ok).toBe(false);
  });

  it('rechaza una factura A sin CUIT del receptor y no invita a reintentar', async () => {
    const res = await provider(0.5).autorizar(comprobante({ documentoReceptor: null }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reintentable).toBe(false);
    expect(res.mensaje).toMatch(/CUIT/);
  });

  it('rechaza una nota de crédito sin comprobante asociado', async () => {
    const res = await provider(0.5).autorizar(
      comprobante({ tipoComprobante: 'NC_A', comprobanteAsociado: null }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reintentable).toBe(false);
  });

  it('acepta una nota de crédito que sí informa su origen', async () => {
    const res = await provider(0.5).autorizar(
      comprobante({
        tipoComprobante: 'NC_A',
        comprobanteAsociado: { tipoComprobante: 'FACTURA_A', puntoVenta: 1, numero: 42 },
      }),
    );
    expect(res.ok).toBe(true);
  });

  it('rechaza un número de comprobante inválido', async () => {
    const res = await provider(0.5).autorizar(comprobante({ numero: 0 }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reintentable).toBe(false);
  });

  it('las validaciones corren antes que el azar: el rechazo es siempre el mismo', async () => {
    for (const semilla of [0.001, 0.3, 0.99]) {
      const res = await provider(semilla).autorizar(comprobante({ numero: -5 }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.codigo).toBe('10013');
    }
  });
});

describe('MockFacturacionProvider · numeración y estado', () => {
  it('no lleva numeración propia: manda el contador local', async () => {
    const ultimo = await provider(0.5).consultarUltimoNumero();
    expect(ultimo).toBe(0);
  });

  it('reporta el servidor disponible', async () => {
    const estado = await provider(0.5).consultarEstadoServidor();
    expect(estado.disponible).toBe(true);
    expect(estado.detalle.appServer).toBe('OK');
  });

  it('se identifica como mock', () => {
    expect(new MockFacturacionProvider().nombre).toBe('mock');
  });
});
