import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { cerrarSesion } from '@/app/(auth)/actions';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { getContexto } from '@/lib/auth/contexto';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const contexto = await getContexto();
  if (!contexto) redirect('/login');

  if (!contexto.empresa) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-border bg-background p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold">Sin empresa asignada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu usuario no está asociado a ninguna empresa. Pedile a un administrador que te agregue,
            o registrá una cuenta nueva.
          </p>
          <form action={cerrarSesion} className="mt-4">
            <Button type="submit" variant="outline" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      usuario={{ email: contexto.email }}
      membresias={contexto.membresias.map((m) => ({
        empresaId: m.empresaId,
        razonSocial: m.razonSocial,
        rol: m.rol,
      }))}
      empresaActivaId={contexto.empresa.empresaId}
    >
      {children}
    </AppShell>
  );
}
