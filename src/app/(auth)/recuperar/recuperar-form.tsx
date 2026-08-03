'use client';

import Link from 'next/link';
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
import { recuperarSchema, type RecuperarInput } from '@/lib/domain/auth/schema';
import { zodResolver } from '@/lib/forms/resolver';

import { recuperarPassword } from '../actions';

export function RecuperarForm() {
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<RecuperarInput>({
    resolver: zodResolver(recuperarSchema),
    defaultValues: { email: '' },
  });

  function onSubmit(values: RecuperarInput) {
    setError(null);
    startTransition(async () => {
      const res = await recuperarPassword(values);
      if (res && 'error' in res) setError(res.error);
      else setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Revisá tu correo</h2>
        <p className="text-sm text-muted-foreground">
          Si hay una cuenta con ese email, te enviamos un enlace para restablecer la contraseña.
        </p>
        <Link href="/login" className="text-sm font-medium text-foreground hover:underline">
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Recuperar acceso</h2>
          <p className="text-sm text-muted-foreground">Te mandamos un enlace por email.</p>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="vos@empresa.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Enviando…' : 'Enviar enlace'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Volver a ingresar
          </Link>
        </p>
      </form>
    </Form>
  );
}
