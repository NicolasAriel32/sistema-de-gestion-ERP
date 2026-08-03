'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV } from '@/components/layout/nav';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function Sidebar({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
      {NAV.map((section) => (
        <div key={section.titulo}>
          {!collapsed ? (
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {section.titulo}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const activo =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

              const cuerpo = (
                <span
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                    collapsed && 'justify-center',
                    !item.disponible
                      ? 'cursor-not-allowed text-muted-foreground/50'
                      : activo
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {!collapsed && !item.disponible ? (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/60">
                      pronto
                    </span>
                  ) : null}
                </span>
              );

              if (!item.disponible) {
                return (
                  <li key={item.href} aria-disabled>
                    {cuerpo}
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href={item.href} onClick={onNavigate} aria-label={item.label}>
                          {cuerpo}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link href={item.href} onClick={onNavigate}>
                      {cuerpo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
