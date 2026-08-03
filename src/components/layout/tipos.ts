import type { RolUsuario } from '@/lib/supabase/database.types';

export type MembresiaCliente = {
  empresaId: string;
  razonSocial: string;
  rol: RolUsuario;
};

export type UsuarioCliente = { email: string };
