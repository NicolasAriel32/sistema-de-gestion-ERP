import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { getPublicEnv, getServerEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Cliente con service role: EVADE RLS por completo.
 *
 * Reservado para tareas de administración que no pueden expresarse bajo
 * las políticas: alta de usuarios, procesamiento de la cola de webhooks,
 * mantenimiento. Nunca se usa para servir una petición de usuario, y
 * `server-only` garantiza que un import desde el browser rompa el build
 * en vez de filtrar la clave.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createSupabaseClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
