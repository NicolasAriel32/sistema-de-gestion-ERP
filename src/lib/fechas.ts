/**
 * Fechas del dominio comercial.
 *
 * Un comprobante se fecha por el día calendario en Buenos Aires, no por el
 * día del servidor. Una factura emitida a las 22:30 de Buenos Aires es del
 * día siguiente en UTC, y AFIP la rechazaría por fecha fuera de rango.
 *
 * Convención: las fechas de comprobante viajan como `YYYY-MM-DD` (que es
 * el tipo `date` de Postgres, sin hora ni zona). Los `timestamptz` sí se
 * guardan en UTC y se formatean al mostrarlos.
 */

import { TZDate } from '@date-fns/tz';
import { addDays, format, parseISO } from 'date-fns';

export const ZONA_AR = 'America/Argentina/Buenos_Aires';

/** Día calendario actual en Buenos Aires, como YYYY-MM-DD. */
export function hoyIso(ahora: Date = new Date()): string {
  return format(new TZDate(ahora, ZONA_AR), 'yyyy-MM-dd');
}

/**
 * Suma días calendario a una fecha YYYY-MM-DD.
 *
 * Se ancla al mediodía a propósito: así un cambio de horario de verano no
 * puede correr el resultado un día para atrás o para adelante.
 */
export function sumarDiasIso(iso: string, dias: number): string {
  return format(addDays(parseISO(`${iso}T12:00:00`), dias), 'yyyy-MM-dd');
}

/** YYYY-MM-DD → dd/MM/yyyy, que es como se lee una fecha en Argentina. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const soloFecha = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) return '—';
  const [anio, mes, dia] = soloFecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Un `timestamptz` de Postgres formateado en hora de Buenos Aires. */
export function formatearFechaHora(valor: string | null | undefined): string {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return format(new TZDate(fecha, ZONA_AR), 'dd/MM/yyyy HH:mm');
}

/** Días transcurridos entre dos fechas YYYY-MM-DD (b - a). */
export function diasEntre(desdeIso: string, hastaIso: string): number {
  const a = parseISO(`${desdeIso}T12:00:00`).getTime();
  const b = parseISO(`${hastaIso}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}
