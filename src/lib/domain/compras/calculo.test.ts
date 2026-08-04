import { describe, expect, it } from 'vitest';

import {
  calcularTotalesCompra,
  daCreditoFiscal,
  modoIvaDeLetra,
  totalesCompraCoherentes,
} from './calculo';

describe('modoIvaDeLetra', () => {
  it('A y M discriminan IVA', () => {
    expect(modoIvaDeLetra('A')).toBe('DISCRIMINADO');
    expect(modoIvaDeLetra('M')).toBe('DISCRIMINADO');
  });

  it('B, C y el resto no discriminan', () => {
    expect(modoIvaDeLetra('B')).toBe('INCLUIDO');
    expect(modoIvaDeLetra('C')).toBe('INCLUIDO');
    expect(modoIvaDeLetra('X')).toBe('INCLUIDO');
  });
});

describe('daCreditoFiscal', () => {
  it('sólo A y M', () => {
    expect(daCreditoFiscal('A')).toBe(true);
    expect(daCreditoFiscal('M')).toBe(true);
    expect(daCreditoFiscal('B')).toBe(false);
    expect(daCreditoFiscal('C')).toBe(false);
  });
});

describe('factura A: IVA discriminado', () => {
  it('suma el IVA sobre el neto', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: 10, precioUnitario: 1000, alicuotaIva: 21 }],
      { modoIva: 'DISCRIMINADO' },
    );

    expect(t.netoGravado).toBe(10000);
    expect(t.iva21).toBe(2100);
    expect(t.total).toBe(12100);
    expect(totalesCompraCoherentes(t)).toBe(true);
  });

  it('el costo unitario es el neto, porque el IVA es crédito fiscal', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: 5, precioUnitario: 850.5, alicuotaIva: 21 }],
      { modoIva: 'DISCRIMINADO' },
    );

    expect(t.items[0]!.costoUnitario).toBe(850.5);
  });

  it('separa las alícuotas en sus columnas', () => {
    const t = calcularTotalesCompra(
      [
        { cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 },
        { cantidad: 1, precioUnitario: 2000, alicuotaIva: 10.5 },
        { cantidad: 1, precioUnitario: 3000, alicuotaIva: 27 },
        { cantidad: 1, precioUnitario: 500, alicuotaIva: 0 },
      ],
      { modoIva: 'DISCRIMINADO' },
    );

    expect(t.iva21).toBe(210);
    expect(t.iva105).toBe(210);
    expect(t.iva27).toBe(810);
    expect(t.netoGravado).toBe(6500);
    expect(t.total).toBe(7730);
    expect(totalesCompraCoherentes(t)).toBe(true);
  });

  it('redondea por renglón y recién después suma', () => {
    // 3 renglones de 33.335 × 21%: si se sumara antes de redondear, el
    // total diferiría en un centavo del que se imprime por renglón.
    const t = calcularTotalesCompra(
      [
        { cantidad: 1, precioUnitario: 33.335, alicuotaIva: 21 },
        { cantidad: 1, precioUnitario: 33.335, alicuotaIva: 21 },
        { cantidad: 1, precioUnitario: 33.335, alicuotaIva: 21 },
      ],
      { modoIva: 'DISCRIMINADO' },
    );

    // 33.335 → 33.34 neto; IVA 33.34 × 0.21 = 7.0014 → 7.00
    expect(t.items[0]!.subtotalNeto).toBe(33.34);
    expect(t.items[0]!.subtotalIva).toBe(7);
    expect(t.netoGravado).toBe(100.02);
    expect(t.iva21).toBe(21);
    expect(t.total).toBe(121.02);
    expect(totalesCompraCoherentes(t)).toBe(true);
  });
});

describe('factura B/C: IVA no discriminado', () => {
  it('todo el precio es neto y no hay IVA que separar', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: 4, precioUnitario: 1210, alicuotaIva: 21 }],
      { modoIva: 'INCLUIDO' },
    );

    expect(t.netoGravado).toBe(4840);
    expect(t.iva21).toBe(0);
    expect(t.total).toBe(4840);
    expect(totalesCompraCoherentes(t)).toBe(true);
  });

  it('el costo unitario incluye el IVA, porque no se recupera', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: 1, precioUnitario: 1210, alicuotaIva: 21 }],
      { modoIva: 'INCLUIDO' },
    );

    expect(t.items[0]!.costoUnitario).toBe(1210);
  });
});

describe('percepciones', () => {
  it('se suman al total pero no al neto ni al IVA', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: 1, precioUnitario: 100000, alicuotaIva: 21 }],
      {
        modoIva: 'DISCRIMINADO',
        percepciones: [
          { tipo: 'IIBB', jurisdiccion: 'CABA', baseImponible: 100000, alicuota: 3 },
          { tipo: 'IVA', baseImponible: 100000, alicuota: 1.5 },
        ],
      },
    );

    expect(t.netoGravado).toBe(100000);
    expect(t.iva21).toBe(21000);
    expect(t.subtotal).toBe(121000);
    expect(t.totalPercepciones).toBe(4500);
    expect(t.total).toBe(125500);
    expect(totalesCompraCoherentes(t)).toBe(true);
  });

  it('el importe cargado a mano manda sobre base × alícuota', () => {
    // El organismo redondeó a 1234.56 y el papel dice eso, aunque la
    // cuenta diera 1234.5678.
    const t = calcularTotalesCompra(
      [{ cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }],
      {
        modoIva: 'DISCRIMINADO',
        percepciones: [
          { tipo: 'GANANCIAS', baseImponible: 41152.26, alicuota: 3, importe: 1234.56 },
        ],
      },
    );

    expect(t.percepciones[0]!.importe).toBe(1234.56);
    expect(t.total).toBe(2444.56);
  });

  it('normaliza la jurisdicción vacía a null', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }],
      {
        modoIva: 'DISCRIMINADO',
        percepciones: [{ tipo: 'IVA', jurisdiccion: '   ', baseImponible: 100, alicuota: 1 }],
      },
    );

    expect(t.percepciones[0]!.jurisdiccion).toBeNull();
  });

  it('sin percepciones, el total es el subtotal', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }],
      { modoIva: 'DISCRIMINADO' },
    );

    expect(t.totalPercepciones).toBe(0);
    expect(t.total).toBe(t.subtotal);
  });
});

describe('validaciones', () => {
  it('rechaza una alícuota que no existe en Argentina', () => {
    expect(() =>
      calcularTotalesCompra([{ cantidad: 1, precioUnitario: 100, alicuotaIva: 15 }], {
        modoIva: 'DISCRIMINADO',
      }),
    ).toThrow(/Alícuota de IVA inválida/);
  });

  it('rechaza un precio negativo', () => {
    expect(() =>
      calcularTotalesCompra([{ cantidad: 1, precioUnitario: -1, alicuotaIva: 21 }], {
        modoIva: 'DISCRIMINADO',
      }),
    ).toThrow(/no puede ser negativo/);
  });

  it('rechaza cantidad cero', () => {
    expect(() =>
      calcularTotalesCompra([{ cantidad: 0, precioUnitario: 100, alicuotaIva: 21 }], {
        modoIva: 'DISCRIMINADO',
      }),
    ).toThrow(/no puede ser cero/);
  });

  it('rechaza una percepción negativa', () => {
    expect(() =>
      calcularTotalesCompra([{ cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }], {
        modoIva: 'DISCRIMINADO',
        percepciones: [{ tipo: 'IVA', importe: -50 }],
      }),
    ).toThrow(/no puede ser negativo/);
  });

  it('acepta importes como string, que es como llegan del formulario', () => {
    const t = calcularTotalesCompra(
      [{ cantidad: '2', precioUnitario: '1500.50', alicuotaIva: '21' }],
      { modoIva: 'DISCRIMINADO' },
    );

    expect(t.netoGravado).toBe(3001);
    expect(t.iva21).toBe(630.21);
    expect(t.total).toBe(3631.21);
  });
});
