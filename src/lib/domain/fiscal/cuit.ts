/**
 * Validación de CUIT/CUIL por dígito verificador (módulo 11).
 *
 * Es el espejo en TypeScript de `public.es_cuit_valido(text)` en la base.
 * La base es la que MANDA (CHECK constraints); esto valida en el cliente
 * y en las Server Actions para dar un error claro antes de tocar la DB.
 * Cualquier cambio acá tiene que replicarse en la función SQL, y viceversa.
 */

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja sólo los 0-9: ignora guiones, espacios y puntos. */
export function soloDigitos(valor: string): string {
  return valor.replace(/[^0-9]/g, '');
}

export function esCuitValido(valor: string | null | undefined): boolean {
  if (!valor) return false;

  const digitos = soloDigitos(valor);
  if (digitos.length !== 11) return false;

  let suma = 0;
  for (let i = 0; i < 10; i += 1) {
    const peso = PESOS[i] ?? 0;
    suma += (digitos.charCodeAt(i) - 48) * peso;
  }

  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  else if (dv === 10) dv = 9;

  return dv === digitos.charCodeAt(10) - 48;
}

/** Formatea 11 dígitos como NN-NNNNNNNN-N. Si no son 11, devuelve el valor tal cual. */
export function formatearCuit(valor: string): string {
  const d = soloDigitos(valor);
  if (d.length !== 11) return valor;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}
