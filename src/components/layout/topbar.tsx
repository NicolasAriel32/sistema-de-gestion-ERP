'use client';

import {
  Building2,
  ChevronsUpDown,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  UserRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { cambiarEmpresa } from '@/app/(app)/actions';
import { cerrarSesion } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ETIQUETA_ROL } from '@/lib/auth/permisos';

import type { MembresiaCliente, UsuarioCliente } from './tipos';

export function Topbar({
  usuario,
  membresias,
  empresaActivaId,
  onToggleSidebar,
  onOpenMobile,
  onOpenSearch,
}: {
  usuario: UsuarioCliente;
  membresias: MembresiaCliente[];
  empresaActivaId: string;
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
  onOpenSearch: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activa = membresias.find((m) => m.empresaId === empresaActivaId) ?? membresias[0];
  const rol = activa?.rol;

  function seleccionar(id: string) {
    if (id === empresaActivaId) return;
    startTransition(async () => {
      await cambiarEmpresa(id);
      router.refresh();
    });
  }

  function salir() {
    startTransition(async () => {
      await cerrarSesion();
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobile} aria-label="Abrir menú">
        <Menu />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={onToggleSidebar}
        aria-label="Contraer panel"
      >
        <PanelLeft />
      </Button>

      {membresias.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending} className="max-w-[240px]">
              <Building2 className="opacity-70" />
              <span className="truncate">{activa?.razonSocial}</span>
              <ChevronsUpDown className="ml-1 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Empresa activa</DropdownMenuLabel>
            {membresias.map((m) => (
              <DropdownMenuItem key={m.empresaId} onSelect={() => seleccionar(m.empresaId)}>
                <Building2 className="opacity-70" />
                <span className="truncate">{m.razonSocial}</span>
                <span className="ml-auto text-xs text-muted-foreground">{ETIQUETA_ROL[m.rol]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="size-4 opacity-70" />
          <span className="max-w-[240px] truncate">{activa?.razonSocial}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSearch}
          className="gap-2 text-muted-foreground"
        >
          <Search className="size-4" />
          <span className="hidden sm:inline">Buscar…</span>
          <kbd className="hidden rounded border border-border bg-muted px-1 text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Cuenta">
              <UserRound />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium text-foreground">{usuario.email}</p>
              {rol ? <p className="text-xs text-muted-foreground">{ETIQUETA_ROL[rol]}</p> : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={salir} disabled={pending}>
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
