/** Resultado estándar de una Server Action de formulario. */
export type AccionResult = { ok: true; id?: string } | { error: string };

export function esError(r: AccionResult): r is { error: string } {
  return 'error' in r;
}
