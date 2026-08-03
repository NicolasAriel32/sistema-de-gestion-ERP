'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { clearEmpresaActual } from '@/lib/empresa/actual';
import {
  actualizarPasswordSchema,
  loginSchema,
  recuperarSchema,
  registroSchema,
  type ActualizarPasswordInput,
  type LoginInput,
  type RecuperarInput,
  type RegistroInput,
  type ResultadoAuth,
} from '@/lib/domain/auth/schema';
import { soloDigitos } from '@/lib/domain/fiscal/cuit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function rutaInternaSegura(destino: string | undefined): string {
  return destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
}

export async function iniciarSesion(input: LoginInput, redirectTo?: string): Promise<ResultadoAuth> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Email o contraseña incorrectos' };

  redirect(rutaInternaSegura(redirectTo));
}

export async function registrarse(input: RegistroInput): Promise<ResultadoAuth> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { email, password, razonSocial, cuit, condicionIva } = parsed.data;
  const admin = createAdminClient();

  // 1. Usuario ya confirmado: registro self-serve, sin paso de email en el MVP.
  const { data: creado, error: errUser } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errUser || !creado?.user) {
    const yaExiste = errUser?.message?.toLowerCase().includes('already');
    return { error: yaExiste ? 'Ya existe una cuenta con ese email.' : 'No se pudo crear la cuenta.' };
  }
  const usuarioId = creado.user.id;

  // 2. Empresa + membresía ADMIN. Va por service role: no hay policy de
  //    INSERT sobre empresas para usuarios comunes (a propósito).
  const { data: empresa, error: errEmp } = await admin
    .from('empresas')
    .insert({ razon_social: razonSocial, cuit: soloDigitos(cuit), condicion_iva: condicionIva })
    .select('id')
    .single();

  if (errEmp || !empresa) {
    await admin.auth.admin.deleteUser(usuarioId);
    const cuitDuplicado = errEmp?.message?.toLowerCase().includes('duplicate');
    return {
      error: cuitDuplicado
        ? 'Ya hay una empresa registrada con ese CUIT.'
        : 'No se pudo crear la empresa.',
    };
  }

  const { error: errMem } = await admin
    .from('usuarios_empresa')
    .insert({ usuario_id: usuarioId, empresa_id: empresa.id, rol: 'ADMIN' });

  if (errMem) {
    await admin.from('empresas').delete().eq('id', empresa.id);
    await admin.auth.admin.deleteUser(usuarioId);
    return { error: 'No se pudo asignar el usuario a la empresa.' };
  }

  // 3. Iniciar sesión (setea las cookies) y adentro.
  const supabase = await createClient();
  const { error: errLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errLogin) {
    // La cuenta quedó creada; que entre por el login.
    return { error: 'Cuenta creada. Iniciá sesión para continuar.' };
  }

  redirect('/');
}

export async function recuperarPassword(input: RecuperarInput): Promise<ResultadoAuth> {
  const parsed = recuperarSchema.safeParse(input);
  if (!parsed.success) return { error: 'Email inválido' };

  const supabase = await createClient();
  const cabeceras = await headers();
  const origin = cabeceras.get('origin') ?? '';

  // No se revela si el email existe o no: siempre "ok".
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/actualizar-password`,
  });

  return { ok: true };
}

export async function actualizarPassword(input: ActualizarPasswordInput): Promise<ResultadoAuth> {
  const parsed = actualizarPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: 'No se pudo actualizar la contraseña. Volvé a pedir el enlace de recuperación.' };
  }

  redirect('/');
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearEmpresaActual();
  redirect('/login');
}
