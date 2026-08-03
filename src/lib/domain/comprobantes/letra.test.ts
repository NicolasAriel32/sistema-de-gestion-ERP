import { describe, expect, it } from 'vitest';

import {
  determinarLetra,
  esFactura,
  esNoFiscal,
  esNotaCredito,
  esNotaDebito,
  letraDeTipo,
  modoIvaDeLetra,
  modoIvaDeTipo,
  tipoComprobanteDe,
} from './letra';

describe('determinarLetra', () => {
  it('emisor Responsable Inscripto a receptor Responsable Inscripto → A', () => {
    expect(determinarLetra('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO')).toBe('A');
  });

  it('emisor Responsable Inscripto al resto de las condiciones → B', () => {
    expect(determinarLetra('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO')).toBe('B');
    expect(determinarLetra('RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL')).toBe('B');
    expect(determinarLetra('RESPONSABLE_INSCRIPTO', 'EXENTO')).toBe('B');
    expect(determinarLetra('RESPONSABLE_INSCRIPTO', 'NO_ALCANZADO')).toBe('B');
  });

  it('emisor Monotributo emite C contra cualquier receptor', () => {
    expect(determinarLetra('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO')).toBe('C');
    expect(determinarLetra('MONOTRIBUTO', 'MONOTRIBUTO')).toBe('C');
    expect(determinarLetra('MONOTRIBUTO', 'CONSUMIDOR_FINAL')).toBe('C');
    expect(determinarLetra('MONOTRIBUTO', 'EXENTO')).toBe('C');
    expect(determinarLetra('MONOTRIBUTO', 'NO_ALCANZADO')).toBe('C');
  });

  it('emisor Exento emite C contra cualquier receptor', () => {
    expect(determinarLetra('EXENTO', 'RESPONSABLE_INSCRIPTO')).toBe('C');
    expect(determinarLetra('EXENTO', 'CONSUMIDOR_FINAL')).toBe('C');
  });

  it('un Responsable Inscripto nunca emite C', () => {
    const receptores = [
      'RESPONSABLE_INSCRIPTO',
      'MONOTRIBUTO',
      'EXENTO',
      'CONSUMIDOR_FINAL',
      'NO_ALCANZADO',
    ] as const;
    for (const receptor of receptores) {
      expect(determinarLetra('RESPONSABLE_INSCRIPTO', receptor)).not.toBe('C');
    }
  });
});

describe('tipoComprobanteDe', () => {
  it('arma el tipo combinando familia y letra', () => {
    expect(tipoComprobanteDe('FACTURA', 'A')).toBe('FACTURA_A');
    expect(tipoComprobanteDe('FACTURA', 'B')).toBe('FACTURA_B');
    expect(tipoComprobanteDe('FACTURA', 'C')).toBe('FACTURA_C');
    expect(tipoComprobanteDe('NOTA_CREDITO', 'A')).toBe('NC_A');
    expect(tipoComprobanteDe('NOTA_CREDITO', 'C')).toBe('NC_C');
    expect(tipoComprobanteDe('NOTA_DEBITO', 'B')).toBe('ND_B');
  });
});

describe('letraDeTipo', () => {
  it('devuelve la letra de cada tipo fiscal', () => {
    expect(letraDeTipo('FACTURA_A')).toBe('A');
    expect(letraDeTipo('NC_A')).toBe('A');
    expect(letraDeTipo('ND_A')).toBe('A');
    expect(letraDeTipo('FACTURA_B')).toBe('B');
    expect(letraDeTipo('NC_B')).toBe('B');
    expect(letraDeTipo('FACTURA_C')).toBe('C');
    expect(letraDeTipo('ND_C')).toBe('C');
  });

  it('los comprobantes internos no llevan letra fiscal', () => {
    expect(letraDeTipo('PRESUPUESTO')).toBe('X');
    expect(letraDeTipo('PEDIDO')).toBe('X');
    expect(letraDeTipo('REMITO')).toBe('X');
  });
});

describe('clasificación de tipos', () => {
  it('reconoce los comprobantes internos', () => {
    expect(esNoFiscal('PRESUPUESTO')).toBe(true);
    expect(esNoFiscal('PEDIDO')).toBe(true);
    expect(esNoFiscal('REMITO')).toBe(true);
    expect(esNoFiscal('FACTURA_A')).toBe(false);
    expect(esNoFiscal('NC_B')).toBe(false);
  });

  it('reconoce notas de crédito y de débito', () => {
    expect(esNotaCredito('NC_A')).toBe(true);
    expect(esNotaCredito('NC_C')).toBe(true);
    expect(esNotaCredito('ND_A')).toBe(false);
    expect(esNotaDebito('ND_B')).toBe(true);
    expect(esNotaDebito('NC_B')).toBe(false);
  });

  it('reconoce facturas', () => {
    expect(esFactura('FACTURA_A')).toBe(true);
    expect(esFactura('FACTURA_C')).toBe(true);
    expect(esFactura('NC_A')).toBe(false);
    expect(esFactura('REMITO')).toBe(false);
  });
});

describe('modo de IVA', () => {
  it('A discrimina, B lo lleva incluido, C no lo liquida', () => {
    expect(modoIvaDeLetra('A')).toBe('DISCRIMINADO');
    expect(modoIvaDeLetra('B')).toBe('INCLUIDO');
    expect(modoIvaDeLetra('C')).toBe('SIN_DISCRIMINAR');
  });

  it('lo deriva del tipo de comprobante', () => {
    expect(modoIvaDeTipo('FACTURA_A')).toBe('DISCRIMINADO');
    expect(modoIvaDeTipo('NC_A')).toBe('DISCRIMINADO');
    expect(modoIvaDeTipo('FACTURA_B')).toBe('INCLUIDO');
    expect(modoIvaDeTipo('FACTURA_C')).toBe('SIN_DISCRIMINAR');
  });

  it('un presupuesto muestra el precio final que va a pagar el cliente', () => {
    expect(modoIvaDeTipo('PRESUPUESTO')).toBe('INCLUIDO');
    expect(modoIvaDeTipo('PEDIDO')).toBe('INCLUIDO');
    expect(modoIvaDeTipo('REMITO')).toBe('INCLUIDO');
  });
});
