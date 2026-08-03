'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { clienteFormDefaults, clienteSchema, type ClienteInput } from '@/lib/domain/clientes/schema';
import {
  CONDICIONES_IVA,
  ETIQUETA_CONDICION_IVA,
  ETIQUETA_TIPO_DOC,
  TIPOS_DOC,
} from '@/lib/domain/opciones';
import { esError } from '@/lib/forms/resultado';
import { zodResolver } from '@/lib/forms/resolver';
import type { Row } from '@/lib/supabase/database.types';

import { actualizarCliente, crearCliente } from './actions';

const SIN_LISTA = '__none__';

function aInput(c: Row<'clientes'>): ClienteInput {
  return {
    razonSocial: c.razon_social,
    nombreFantasia: c.nombre_fantasia ?? '',
    tipoDoc: c.tipo_doc,
    cuitDni: c.cuit_dni ?? '',
    condicionIva: c.condicion_iva,
    email: c.email ?? '',
    telefono: c.telefono ?? '',
    domicilio: c.domicilio ?? '',
    localidad: c.localidad ?? '',
    provincia: c.provincia ?? '',
    listaPrecioId: c.lista_precio_id,
    limiteCredito: c.limite_credito,
    diasCredito: c.dias_credito,
    observaciones: c.observaciones ?? '',
  };
}

export function ClienteFormDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  cliente,
  listasPrecios,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  cliente?: Row<'clientes'>;
  listasPrecios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setOpen(v: boolean) {
    if (!controlado) setInternalOpen(v);
    onOpenChangeProp?.(v);
  }

  const form = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: cliente ? aInput(cliente) : clienteFormDefaults,
  });

  function onSubmit(values: ClienteInput) {
    setError(null);
    startTransition(async () => {
      const res = cliente
        ? await actualizarCliente(cliente.id, values)
        : await crearCliente(values);
      if (esError(res)) {
        setError(res.error);
        return;
      }
      toast.success(cliente ? 'Cliente actualizado' : 'Cliente creado');
      setOpen(false);
      if (!cliente) form.reset(clienteFormDefaults);
      router.refresh();
    });
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setError(null);
      form.reset(cliente ? aInput(cliente) : clienteFormDefaults);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          <DialogDescription>
            Los campos de identificación se validan según la condición de IVA.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="razonSocial"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Razón social</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nombreFantasia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de fantasía</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="condicionIva"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condición IVA</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONDICIONES_IVA.map((c) => (
                        <SelectItem key={c} value={c}>
                          {ETIQUETA_CONDICION_IVA[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipoDoc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de documento</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_DOC.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ETIQUETA_TIPO_DOC[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cuitDni"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de documento</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" placeholder="20-12345678-6" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefono"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="domicilio"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Domicilio</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="localidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localidad</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provincia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provincia</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="listaPrecioId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lista de precios</FormLabel>
                  <Select
                    value={field.value ?? SIN_LISTA}
                    onValueChange={(v) => field.onChange(v === SIN_LISTA ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SIN_LISTA}>— Ninguna —</SelectItem>
                      {listasPrecios.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="limiteCredito"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Límite de crédito</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="diasCredito"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Días de crédito</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="observaciones"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
