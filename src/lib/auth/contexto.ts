import 'server-only';

import { cache } from 'react';

import { getEmpresaActualId } from '@/lib/empresa/actual';
import { createClient } from '@/lib/supabase/server';
import type { RolUsuario } from '@/lib/supabase/database.types';

export type Membresia = {
  empresaId: string;
  rol: RolUsuario;
  razonSocial: string;
  activa: boolean;
};

export type Contexto = {
  usuarioId: string;
  email: string;
  membresias: Membresia[];
  /** Empresa activa resuelta (cookie validada contra membresías, o la primera). */
  empresa: Membresia | null;
};

/**
 * Contexto del request: usuario, sus empresas y la empresa activa.
 *
 * Cacheado por request (React `cache`) para no repetir el ida y vuelta a
 * Supabase entre el layout, el topbar y cada página.
 */
export const getContexto = cache(async (): Promise<Contexto | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: filas } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id, rol')
    .eq('activo', true);

  const membresiasBrutas = filas ?? [];
  const ids = membresiasBrutas.map((f) => f.empresa_id);

  let membresias: Membresia[] = [];
  if (ids.length > 0) {
    const { data: empresas } = await supabase
      .from('empresas')
      .select('id, razon_social, activa')
      .in('id', ids);

    const porId = new Map((empresas ?? []).map((e) => [e.id, e]));
    membresias = membresiasBrutas
      .map((f) => {
        const empresa = porId.get(f.empresa_id);
        if (!empresa) return null;
        return {
          empresaId: f.empresa_id,
          rol: f.rol,
          razonSocial: empresa.razon_social,
          activa: empresa.activa,
        } satisfies Membresia;
      })
      .filter((m): m is Membresia => m !== null)
      .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'));
  }

  const cookieId = await getEmpresaActualId();
  const empresa =
    membresias.find((m) => m.empresaId === cookieId) ?? membresias[0] ?? null;

  return {
    usuarioId: user.id,
    email: user.email ?? '',
    membresias,
    empresa,
  };
});

/**
 * Exige contexto con empresa activa. Para usar al tope de cada página o
 * Server Action de catálogo. Devuelve el contexto ya garantizado.
 */
export async function requireEmpresa(): Promise<Contexto & { empresa: Membresia }> {
  const contexto = await getContexto();
  if (!contexto) {
    throw new Error('Sesión no encontrada.');
  }
  if (!contexto.empresa) {
    throw new Error('El usuario no tiene ninguna empresa asignada.');
  }
  return { ...contexto, empresa: contexto.empresa };
}
