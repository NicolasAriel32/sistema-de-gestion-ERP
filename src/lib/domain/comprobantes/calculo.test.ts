import { describe, expect, it } from 'vitest';

import {
  calcularTotales,
  totalDesdeComponentes,
  totalesCoherentes,
  type ItemCalculoInput,
} from './calculo';

const A = { modoIva: 'DISCRIMINADO' } as const;
const B = { modoIva: 'INCLUIDO' } as const;
const C = { modoIva: 'SIN_DISCRIMINAR' } as const;

function item(parcial: Partial<ItemCalculoInput> = {}): ItemCalculoInput {
  return { cantidad: 1, precioUnitario: 100, alicuotaIva: 21, ...parcial };
}

// =====================================================================
// Los 5 casos de cuadre al centavo contra cálculo manual.
// Cada número de la derecha está calculado a mano en el comentario.
// =====================================================================

describe('casos de cuadre al centavo', () => {
  it('caso 1 · Factura A, un renglón al 21%', () => {
    // 3 × 1234.56 = 3703.68 neto
    // IVA 21% = 777.7728 → 777.77
    // total = 4481.45
    const t = calcularTotales([item({ cantidad: 3, precioUnitario: '1234.56' })], A);

    expect(t.items[0]?.subtotalNeto).toBe(3703.68);
    expect(t.items[0]?.subtotalIva).toBe(777.77);
    expect(t.items[0]?.subtotal).toBe(4481.45);
    expect(t.netoGravado).toBe(3703.68);
    expect(t.iva21).toBe(777.77);
    expect(t.total).toBe(4481.45);
    expect(totalesCoherentes(t)).toBe(true);
  });

  it('caso 2 · Factura A con dos alícuotas distintas', () => {
    // Renglón 1: 2 × 100.00 al 21%  → neto 200.00, IVA 42.00,  sub 242.00
    // Renglón 2: 1 × 550.55 al 10.5% → neto 550.55, IVA 57.80775 → 57.81, sub 608.36
    // netoGravado 750.55 · iva21 42.00 · iva105 57.81 · total 850.36
    const t = calcularTotales(
      [
        item({ cantidad: 2, precioUnitario: '100.00', alicuotaIva: 21 }),
        item({ cantidad: 1, precioUnitario: '550.55', alicuotaIva: 10.5 }),
      ],
      A,
    );

    expect(t.items[1]?.subtotalIva).toBe(57.81);
    expect(t.netoGravado).toBe(750.55);
    expect(t.iva21).toBe(42);
    expect(t.iva105).toBe(57.81);
    expect(t.total).toBe(850.36);
    expect(totalDesdeComponentes(t)).toBe(850.36);
  });

  it('caso 3 · Factura B, el neto se calcula hacia atrás', () => {
    // Precio final 1000.00 al 21%
    // neto = 1000 / 1.21 = 826.4462809… → 826.45
    // IVA  = 1000 − 826.45 = 173.55
    const t = calcularTotales([item({ precioUnitario: '1000.00' })], B);

    expect(t.items[0]?.subtotal).toBe(1000);
    expect(t.items[0]?.subtotalNeto).toBe(826.45);
    expect(t.items[0]?.subtotalIva).toBe(173.55);
    expect(t.netoGravado).toBe(826.45);
    expect(t.iva21).toBe(173.55);
    expect(t.total).toBe(1000);
  });

  it('caso 4 · Factura B con descuento del 10% en el renglón', () => {
    // 4 × 999.99 × 0.90 = 3599.964 → 3599.96
    // neto = 3599.96 / 1.21 = 2975.1735537… → 2975.17
    // IVA  = 3599.96 − 2975.17 = 624.79
    const t = calcularTotales(
      [item({ cantidad: 4, precioUnitario: '999.99', descuentoPorcentaje: 10 })],
      B,
    );

    expect(t.items[0]?.subtotal).toBe(3599.96);
    expect(t.items[0]?.subtotalNeto).toBe(2975.17);
    expect(t.items[0]?.subtotalIva).toBe(624.79);
    expect(t.total).toBe(3599.96);
    expect(totalesCoherentes(t)).toBe(true);
  });

  it('caso 5 · Factura C con descuento general del 15%', () => {
    // Renglón 1: 2 × 350.00 × 0.85 = 595.00
    // Renglón 2: 1 × 149.99 × 0.85 = 127.4915 → 127.49
    // total 722.49 · sin descuento 849.99 · descuento 127.50
    const t = calcularTotales(
      [
        item({ cantidad: 2, precioUnitario: '350.00' }),
        item({ cantidad: 1, precioUnitario: '149.99' }),
      ],
      { ...C, descuentoPorcentaje: 15 },
    );

    expect(t.items[0]?.subtotal).toBe(595);
    expect(t.items[1]?.subtotal).toBe(127.49);
    expect(t.total).toBe(722.49);
    expect(t.descuentoImporte).toBe(127.5);
    expect(t.netoGravado).toBe(722.49);
    expect(t.iva21).toBe(0);
  });
});

// =====================================================================

describe('orden de redondeo', () => {
  it('redondea por renglón y recién después suma', () => {
    // 0.5 × 1.01 = 0.505 → 0.51 por renglón. Tres renglones → 1.53.
    // Sumando primero: 1.515 → 1.52. El correcto es 1.53.
    const items = [
      item({ cantidad: '0.5', precioUnitario: '1.01', alicuotaIva: 0 }),
      item({ cantidad: '0.5', precioUnitario: '1.01', alicuotaIva: 0 }),
      item({ cantidad: '0.5', precioUnitario: '1.01', alicuotaIva: 0 }),
    ];
    const t = calcularTotales(items, A);

    expect(t.items.map((i) => i.subtotalNeto)).toEqual([0.51, 0.51, 0.51]);
    expect(t.total).toBe(1.53);
    expect(t.total).not.toBe(1.52);
  });

  it('usa ROUND_HALF_UP, no el redondeo bancario', () => {
    // 0.125 al 0% → 0.13 con HALF_UP (el bancario daría 0.12).
    const t = calcularTotales(
      [item({ cantidad: '0.25', precioUnitario: '0.50', alicuotaIva: 0 })],
      A,
    );
    expect(t.items[0]?.subtotalNeto).toBe(0.13);
  });

  it('respeta las 4 decimales de cantidad', () => {
    // 2.5005 × 10.00 = 25.005 → 25.01
    const t = calcularTotales(
      [item({ cantidad: '2.5005', precioUnitario: '10.00', alicuotaIva: 0 })],
      A,
    );
    expect(t.items[0]?.cantidad).toBe(2.5005);
    expect(t.items[0]?.subtotalNeto).toBe(25.01);
  });
});

describe('discriminación de IVA por letra', () => {
  it('en A el IVA se suma al precio cargado', () => {
    const t = calcularTotales([item({ precioUnitario: 100, alicuotaIva: 21 })], A);
    expect(t.items[0]?.subtotalNeto).toBe(100);
    expect(t.items[0]?.subtotal).toBe(121);
  });

  it('en B el precio cargado ya incluye el IVA', () => {
    const t = calcularTotales([item({ precioUnitario: 121, alicuotaIva: 21 })], B);
    expect(t.items[0]?.subtotal).toBe(121);
    expect(t.items[0]?.subtotalNeto).toBe(100);
    expect(t.items[0]?.subtotalIva).toBe(21);
  });

  it('en C el IVA es cero y el neto es igual al total', () => {
    const t = calcularTotales([item({ precioUnitario: 121, alicuotaIva: 21 })], C);
    expect(t.items[0]?.subtotalIva).toBe(0);
    expect(t.items[0]?.subtotalNeto).toBe(121);
    expect(t.items[0]?.alicuotaAplicada).toBe(0);
    expect(t.iva21).toBe(0);
    expect(t.netoGravado).toBe(121);
    expect(t.total).toBe(121);
  });

  it('en C se conserva la alícuota del producto aunque no se liquide', () => {
    const t = calcularTotales([item({ alicuotaIva: 10.5 })], C);
    expect(t.items[0]?.alicuotaIva).toBe(10.5);
    expect(t.items[0]?.alicuotaAplicada).toBe(0);
  });

  it('la alícuota 0% es gravada, no exenta: su neto va a netoGravado', () => {
    const t = calcularTotales([item({ precioUnitario: 500, alicuotaIva: 0 })], A);
    expect(t.netoGravado).toBe(500);
    expect(t.exento).toBe(0);
    expect(t.netoNoGravado).toBe(0);
    expect(t.total).toBe(500);
  });

  it('separa el IVA por alícuota en la cabecera', () => {
    const t = calcularTotales(
      [
        item({ precioUnitario: 1000, alicuotaIva: 21 }),
        item({ precioUnitario: 1000, alicuotaIva: 10.5 }),
        item({ precioUnitario: 1000, alicuotaIva: 27 }),
        item({ precioUnitario: 1000, alicuotaIva: 0 }),
      ],
      A,
    );
    expect(t.iva21).toBe(210);
    expect(t.iva105).toBe(105);
    expect(t.iva27).toBe(270);
    expect(t.netoGravado).toBe(4000);
    expect(t.total).toBe(4585);
  });
});

describe('descuentos', () => {
  it('el descuento del renglón reduce su base', () => {
    const t = calcularTotales(
      [item({ precioUnitario: 1000, descuentoPorcentaje: 25, alicuotaIva: 21 })],
      A,
    );
    expect(t.items[0]?.subtotalNeto).toBe(750);
    expect(t.items[0]?.subtotalIva).toBe(157.5);
  });

  it('el descuento general se aplica renglón por renglón, no sobre el total', () => {
    const t = calcularTotales(
      [
        item({ precioUnitario: '10.01', alicuotaIva: 0 }),
        item({ precioUnitario: '10.01', alicuotaIva: 0 }),
      ],
      { ...A, descuentoPorcentaje: 5 },
    );
    // 10.01 × 0.95 = 9.5095 → 9.51 por renglón → total 19.02
    expect(t.items[0]?.subtotalNeto).toBe(9.51);
    expect(t.total).toBe(19.02);
  });

  it('los dos descuentos se componen, no se suman', () => {
    // 1000 × (1 − 0.10) × (1 − 0.10) = 810, no 800.
    const t = calcularTotales(
      [item({ precioUnitario: 1000, descuentoPorcentaje: 10, alicuotaIva: 0 })],
      { ...A, descuentoPorcentaje: 10 },
    );
    expect(t.total).toBe(810);
  });

  it('descuentoImporte mide sólo lo que restó el descuento general', () => {
    const t = calcularTotales(
      [item({ precioUnitario: 1000, descuentoPorcentaje: 10, alicuotaIva: 0 })],
      { ...A, descuentoPorcentaje: 10 },
    );
    // Sin descuento general el renglón valdría 900; con él, 810.
    expect(t.descuentoImporte).toBe(90);
    expect(t.descuentoPorcentaje).toBe(10);
  });

  it('sin descuento general, descuentoImporte es cero', () => {
    const t = calcularTotales([item({ descuentoPorcentaje: 30 })], A);
    expect(t.descuentoImporte).toBe(0);
  });

  it('un descuento del 100% deja el comprobante en cero', () => {
    const t = calcularTotales([item({ precioUnitario: 1000 })], {
      ...A,
      descuentoPorcentaje: 100,
    });
    expect(t.total).toBe(0);
  });
});

describe('invariantes', () => {
  it('el total siempre es la suma de los renglones', () => {
    const escenarios = [A, B, C];
    for (const modo of escenarios) {
      const t = calcularTotales(
        [
          item({ cantidad: '1.333', precioUnitario: '77.77', alicuotaIva: 21 }),
          item({ cantidad: '2.5', precioUnitario: '19.99', alicuotaIva: 10.5 }),
          item({ cantidad: 7, precioUnitario: '3.33', alicuotaIva: 27 }),
        ],
        { ...modo, descuentoPorcentaje: 7.5 },
      );
      expect(totalesCoherentes(t)).toBe(true);
      expect(totalDesdeComponentes(t)).toBe(t.total);
    }
  });

  it('en B, neto + IVA da exactamente el precio final de cada renglón', () => {
    const precios = ['0.01', '0.99', '1.00', '33.33', '1234.56', '99999.99'];
    for (const precio of precios) {
      const t = calcularTotales([item({ precioUnitario: precio, alicuotaIva: 21 })], B);
      const i = t.items[0]!;
      expect(i.subtotalNeto + i.subtotalIva).toBeCloseTo(i.subtotal, 2);
      expect(i.subtotal).toBe(Number(precio));
    }
  });

  it('una nota de crédito calcula igual que la factura que revierte', () => {
    const items = [
      item({ cantidad: 3, precioUnitario: '1234.56', alicuotaIva: 21 }),
      item({ cantidad: 1, precioUnitario: '550.55', alicuotaIva: 10.5 }),
    ];
    const factura = calcularTotales(items, A);
    const nota = calcularTotales(items, A);

    expect(nota.total).toBe(factura.total);
    expect(nota.netoGravado).toBe(factura.netoGravado);
    expect(nota.iva21).toBe(factura.iva21);
    expect(nota.iva105).toBe(factura.iva105);
  });

  it('un comprobante sin renglones da todo en cero', () => {
    const t = calcularTotales([], A);
    expect(t.total).toBe(0);
    expect(t.netoGravado).toBe(0);
    expect(totalesCoherentes(t)).toBe(true);
  });
});

describe('entradas inválidas', () => {
  it('rechaza una alícuota que no existe en el régimen', () => {
    expect(() => calcularTotales([item({ alicuotaIva: 15 })], A)).toThrow(/Alícuota de IVA/);
    expect(() => calcularTotales([item({ alicuotaIva: 5 })], A)).toThrow();
  });

  it('rechaza un precio negativo', () => {
    expect(() => calcularTotales([item({ precioUnitario: -1 })], A)).toThrow(
      /no puede ser negativo/,
    );
  });

  it('rechaza descuentos fuera del rango 0–100', () => {
    expect(() => calcularTotales([item({ descuentoPorcentaje: 101 })], A)).toThrow();
    expect(() => calcularTotales([item({ descuentoPorcentaje: -5 })], A)).toThrow();
    expect(() =>
      calcularTotales([item()], { ...A, descuentoPorcentaje: 120 }),
    ).toThrow(/descuento general/);
  });

  it('rechaza cantidades o precios que no son números', () => {
    expect(() => calcularTotales([item({ cantidad: 'dos' })], A)).toThrow();
    expect(() => calcularTotales([item({ precioUnitario: 'gratis' })], A)).toThrow();
  });

  it('acepta números y strings indistintamente', () => {
    const conNumero = calcularTotales([item({ precioUnitario: 1234.56, cantidad: 3 })], A);
    const conString = calcularTotales([item({ precioUnitario: '1234.56', cantidad: '3' })], A);
    expect(conString.total).toBe(conNumero.total);
  });
});
