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

/**
 * Marcadores de un mensaje generado por Postgres (siempre en inglés). Si
 * aparecen, el texto crudo no sirve para mostrarle al usuario.
 */
const MARCAS_POSTGRES = [
  'violates',
  'duplicate key',
  'row-level security',
  'invalid input',
  'null value in column',
  'permission denied',
  'does not exist',
];

/**
 * Mensaje para el usuario a partir de un error de una función de negocio.
 *
 * Las funciones de `/supabase/migrations` levantan excepciones con textos
 * ya redactados en castellano y accionables ("No se pudo emitir: el
 * cliente supera su límite de crédito de $450.000"). Esos hay que
 * mostrarlos tal cual; perderlos detrás de un mensaje genérico sería
 * arruinar el trabajo hecho en la base.
 *
 * Para distinguirlos de los que genera Postgres se usa la forma del
 * mensaje: los de Postgres son en inglés y contienen marcas fijas. Es una
 * heurística, no una garantía; si en algún momento hace falta más
 * precisión, el camino es levantar las excepciones de negocio con un
 * SQLSTATE propio (clase `GP`) y filtrar por código.
 */
export function mensajeDeErrorNegocio(error: DbError | null): string {
  const crudo = (error?.message ?? '').trim();
  if (!crudo) return traducirErrorDb(error);

  const minuscula = crudo.toLowerCase();
  if (MARCAS_POSTGRES.some((marca) => minuscula.includes(marca))) {
    return traducirErrorDb(error);
  }

  return crudo;
}
