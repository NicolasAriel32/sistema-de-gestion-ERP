'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  actualizarPasswordSchema,
  type ActualizarPasswordInput,
} from '@/lib/domain/auth/schema';
import { zodResolver } from '@/lib/forms/resolver';

import { actualizarPassword } from '../actions';

export function ActualizarForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<ActualizarPasswordInput>({
    resolver: zodResolver(actualizarPasswordSchema),
    defaultValues: { password: '', confirmar: '' },
  });

  function onSubmit(values: ActualizarPasswordInput) {
    setError(null);
    startTransition(async () => {
      const res = await actualizarPassword(values);
      if (res && 'error' in res) setError(res.error);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Nueva contraseña</h2>
          <p className="text-sm text-muted-foreground">Elegí una contraseña nueva para tu cuenta.</p>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nueva contraseña</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repetir contraseña</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </Form>
  );
}
