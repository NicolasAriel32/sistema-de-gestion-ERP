/**
 * Permisos de escritura por rol para los catálogos.
 *
 * IMPORTANTE: esto es un ESPEJO en TypeScript de las políticas RLS
 * (migración 20260803000006_rls.sql). RLS es la barrera real que corre
 * en Postgres; este mapa sólo sirve para mostrar/ocultar botones en la
 * UI. Si cambia RLS, hay que cambiar esto — y al revés.
 */

export type Rol = 'ADMIN' | 'VENDEDOR' | 'DEPOSITO' | 'CONTABLE';

export type RecursoCatalogo =
  | 'clientes'
  | 'proveedores'
  | 'categorias'
  | 'productos'
  | 'listas_precios'
  | 'precios'
  | 'depositos'
  | 'puntos_venta'
  | 'medios_pago';

const ESCRITURA: Record<RecursoCatalogo, readonly Rol[]> = {
  clientes: ['ADMIN', 'VENDEDOR'],
  proveedores: ['ADMIN', 'CONTABLE'],
  categorias: ['ADMIN', 'DEPOSITO'],
  productos: ['ADMIN', 'DEPOSITO'],
  listas_precios: ['ADMIN'],
  precios: ['ADMIN'],
  depositos: ['ADMIN'],
  puntos_venta: ['ADMIN'],
  medios_pago: ['ADMIN'],
};

/** ¿El rol puede crear/editar/dar de baja este recurso? */
export function puedeEscribir(rol: Rol, recurso: RecursoCatalogo): boolean {
  return ESCRITURA[recurso].includes(rol);
}

export const ROLES: readonly Rol[] = ['ADMIN', 'VENDEDOR', 'DEPOSITO', 'CONTABLE'];

export const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  VENDEDOR: 'Vendedor',
  DEPOSITO: 'Depósito',
  CONTABLE: 'Contable',
};
