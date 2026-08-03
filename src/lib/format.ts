const MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

const NUMERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 });

export function formatearMoneda(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0);
  return MONEDA.format(Number.isFinite(n) ? n : 0);
}

export function formatearNumero(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : (valor ?? 0);
  return NUMERO.format(Number.isFinite(n) ? n : 0);
}
