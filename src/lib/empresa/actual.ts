import 'server-only';

import { cookies } from 'next/headers';

/**
 * Empresa activa del usuario, persistida en una cookie httpOnly.
 *
 * La cookie es sólo una preferencia de UI: NO otorga acceso. Quien decide
 * qué filas ve el usuario es RLS (membresía en usuarios_empresa). Antes de
 * usar este id siempre se valida contra las membresías reales.
 */
const COOKIE_EMPRESA = 'empresa_actual';

export async function getEmpresaActualId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_EMPRESA)?.value ?? null;
}

/** Sólo invocable desde Server Actions o Route Handlers. */
export async function setEmpresaActualId(empresaId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_EMPRESA, empresaId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearEmpresaActual(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_EMPRESA);
}
