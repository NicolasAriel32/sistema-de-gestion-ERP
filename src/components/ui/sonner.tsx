'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * Notificaciones. Neutras, sin estridencias: es software de trabajo.
 * Los colores de éxito/error salen de las CSS vars del sistema.
 */
function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group rounded-md border border-border bg-popover text-popover-foreground shadow-md text-sm',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          error: 'border-destructive/40',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
