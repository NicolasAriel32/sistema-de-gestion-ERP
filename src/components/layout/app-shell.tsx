'use client';

import { PackageOpen } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { CommandPalette } from '@/components/layout/command-palette';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import type { MembresiaCliente, UsuarioCliente } from '@/components/layout/tipos';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function AppShell({
  usuario,
  membresias,
  empresaActivaId,
  children,
}: {
  usuario: UsuarioCliente;
  membresias: MembresiaCliente[];
  empresaActivaId: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const marca = (
    <Link href="/" className="flex h-12 items-center gap-2 border-b border-border px-3">
      <PackageOpen className="size-5 text-primary" />
      {!collapsed ? <span className="text-sm font-semibold tracking-tight">GestiónPyme</span> : null}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-background md:flex',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        {marca}
        <Sidebar collapsed={collapsed} />
      </aside>

      {/* Sidebar mobile (sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0">
          {marca}
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          usuario={usuario}
          membresias={membresias}
          empresaActivaId={empresaActivaId}
          onToggleSidebar={() => setCollapsed((v) => !v)}
          onOpenMobile={() => setMobileOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
