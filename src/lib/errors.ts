import type { ZodError } from 'zod';

type DbError = { message?: string; code?: string; details?: string };

/**
 * Traduce errores de Postgres/PostgREST a mensajes claros en español.
 * El mensaje crudo nunca se muestra al usuario final.
 */
export function traducirErrorDb(error: DbError | null): string {
  if (!error) return 'Ocurrió un error inesperado.';
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();

  if (code === '23505' || msg.includes('duplicate key')) {
    return 'Ya existe un registro con ese valor único (código, CUIT o nombre).';
  }
  if (code === '23514' || msg.includes('check constraint')) {
    return 'Algún dato no cumple las reglas del sistema (revisá CUIT, alícuota o importes).';
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return 'El registro está relacionado con otros datos y no puede completarse la operación.';
  }
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission')) {
    return 'No tenés permisos para esta operación en esta empresa.';
  }
  return 'No se pudo completar la operación. Revisá los datos e intentá de nuevo.';
}

export function primerErrorZod(error: ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos.';
}
