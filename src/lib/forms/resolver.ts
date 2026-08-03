import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * Resolver de react-hook-form basado en Zod v4, sin la dependencia
 * `@hookform/resolvers` (que aún arrastra el runtime de Zod v3).
 *
 * El MISMO schema Zod valida en el cliente (aquí) y en el servidor
 * (en la Server Action), como pide el stack: "Zod en TODA entrada".
 */
function setNested(target: Record<string, unknown>, path: PropertyKey[], value: unknown): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = String(path[i]);
    const current = node[key];
    if (typeof current !== 'object' || current === null) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  const last = String(path[path.length - 1]);
  if (node[last] === undefined) {
    node[last] = value;
  }
}

export function zodResolver<T extends FieldValues>(schema: ZodType<T>): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values);

    if (result.success) {
      return { values: result.data, errors: {} };
    }

    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      if (issue.path.length === 0) continue;
      setNested(errors, issue.path as PropertyKey[], {
        type: String(issue.code ?? 'validation'),
        message: issue.message,
      });
    }

    return { values: {}, errors: errors as FieldErrors<T> };
  };
}
