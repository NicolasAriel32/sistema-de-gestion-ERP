import { z } from 'zod';

export const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, 'Ingresá el nombre de la categoría'),
  padreId: z.string().uuid().nullable().default(null),
});

export type CategoriaInput = z.infer<typeof categoriaSchema>;

export const categoriaFormDefaults: CategoriaInput = {
  nombre: '',
  padreId: null,
};
