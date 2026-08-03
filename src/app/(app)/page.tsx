import { Package, Truck, Users, Warehouse } from 'lucide-react';
import Link from 'next/link';

import { requireEmpresa } from '@/lib/auth/contexto';
import { ETIQUETA_ROL } from '@/lib/auth/permisos';
import { createClient } from '@/lib/supabase/server';

export default async function InicioPage() {
  const { empresa } = await requireEmpresa();
  const supabase = await createClient();
  const id = empresa.empresaId;

  const [clientes, productos, proveedores, depositos] = await Promise.all([
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('empresa_id', id),
    supabase.from('productos').select('*', { count: 'exact', head: true }).eq('empresa_id', id),
    supabase.from('proveedores').select('*', { count: 'exact', head: true }).eq('empresa_id', id),
    supabase.from('depositos').select('*', { count: 'exact', head: true }).eq('empresa_id', id),
  ]);

  const tarjetas = [
    { label: 'Clientes', valor: clientes.count ?? 0, icon: Users, href: '/clientes' },
    { label: 'Productos', valor: productos.count ?? 0, icon: Package, href: '/productos' },
    { label: 'Proveedores', valor: proveedores.count ?? 0, icon: Truck, href: null },
    { label: 'Depósitos', valor: depositos.count ?? 0, icon: Warehouse, href: null },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {empresa.razonSocial} · {ETIQUETA_ROL[empresa.rol]}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Inicio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen de tu operación. El tablero con ventas, deuda y alertas llega en la Fase 5.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((t) => {
          const Icon = t.icon;
          const contenido = (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4 transition-colors hover:border-foreground/20">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wide">{t.label}</span>
                <Icon className="size-4" />
              </div>
              <span className="text-2xl font-semibold tabular-nums">{t.valor}</span>
            </div>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {contenido}
            </Link>
          ) : (
            <div key={t.label}>{contenido}</div>
          );
        })}
      </div>
    </div>
  );
}
