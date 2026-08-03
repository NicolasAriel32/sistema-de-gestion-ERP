import { z } from 'zod';

/**
 * Variables de entorno validadas con Zod.
 *
 * La validación es perezosa a propósito: si se ejecutara al importar el
 * módulo, `next build` fallaría en cualquier entorno sin `.env`. Acá se
 * valida en el momento de usarlas, con un mensaje que dice exactamente
 * qué falta.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url('NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY'),
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Falta SUPABASE_SERVICE_ROLE_KEY'),
  FACTURACION_PROVIDER: z.enum(['mock', 'arca']).default('mock'),
  N8N_WEBHOOK_URL: z.url().optional(),
  N8N_WEBHOOK_SECRET: z.string().min(16).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, source: unknown, scope: string): T {
  const result = schema.safeParse(source);

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuración de entorno inválida (${scope}):\n${detalle}\n\n` +
        'Copiá .env.example a .env.local y completá los valores.',
    );
  }

  return result.data;
}

/** Variables disponibles en el browser. Se leen literales para que Next las inyecte. */
export function getPublicEnv(): PublicEnv {
  return parseOrThrow(
    publicEnvSchema,
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    'cliente',
  );
}

/** Variables que sólo existen del lado del servidor. Nunca importar desde un componente cliente. */
export function getServerEnv(): ServerEnv {
  return parseOrThrow(
    serverEnvSchema,
    {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      FACTURACION_PROVIDER: process.env.FACTURACION_PROVIDER,
      N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
      N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
    },
    'servidor',
  );
}
