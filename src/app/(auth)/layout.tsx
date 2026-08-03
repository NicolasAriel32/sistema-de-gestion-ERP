import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Sistema de gestión comercial
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">GestiónPyme</h1>
        </div>
        <div className="rounded-lg border border-border bg-background p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
