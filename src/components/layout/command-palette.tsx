'use client';

import { Package, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { buscarGlobal, type ResultadoBusqueda } from '@/app/(app)/actions';
import { NAV } from '@/components/layout/nav';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

const SIN_RESULTADOS: ResultadoBusqueda = { clientes: [], productos: [] };

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [termino, setTermino] = useState('');
  const [resultado, setResultado] = useState<ResultadoBusqueda>(SIN_RESULTADOS);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = termino.trim();
    if (t.length < 2) {
      setResultado(SIN_RESULTADOS);
      return;
    }
    const id = setTimeout(() => {
      startTransition(async () => {
        setResultado(await buscarGlobal(t));
      });
    }, 200);
    return () => clearTimeout(id);
  }, [termino]);

  function ir(href: string) {
    onOpenChange(false);
    setTermino('');
    setResultado(SIN_RESULTADOS);
    router.push(href);
  }

  const navDisponible = NAV.flatMap((s) => s.items).filter((i) => i.disponible);
  const t = termino.trim().toLowerCase();
  const navFiltrado =
    t.length === 0 ? navDisponible : navDisponible.filter((i) => i.label.toLowerCase().includes(t));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Buscar clientes, productos, o ir a un módulo…"
        value={termino}
        onValueChange={setTermino}
      />
      <CommandList>
        <CommandEmpty>{pending ? 'Buscando…' : 'Sin resultados.'}</CommandEmpty>

        {resultado.clientes.length > 0 ? (
          <CommandGroup heading="Clientes">
            {resultado.clientes.map((c) => (
              <CommandItem
                key={c.id}
                value={`cliente-${c.id}`}
                onSelect={() => ir(`/clientes?q=${encodeURIComponent(c.razonSocial)}`)}
              >
                <Users />
                <span className="truncate">{c.razonSocial}</span>
                {c.detalle ? (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.detalle}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {resultado.productos.length > 0 ? (
          <CommandGroup heading="Productos">
            {resultado.productos.map((p) => (
              <CommandItem
                key={p.id}
                value={`producto-${p.id}`}
                onSelect={() => ir(`/productos?q=${encodeURIComponent(p.codigo)}`)}
              >
                <Package />
                <span className="truncate">{p.nombre}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.codigo}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {navFiltrado.length > 0 ? (
          <CommandGroup heading="Ir a">
            {navFiltrado.map((item) => (
              <CommandItem key={item.href} value={`nav-${item.label}`} onSelect={() => ir(item.href)}>
                <item.icon />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
