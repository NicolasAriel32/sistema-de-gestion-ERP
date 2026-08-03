import type {
  CondicionIva,
  TipoAjusteLista,
  TipoDocumento,
  TipoEmision,
} from '@/lib/supabase/database.types';

export const TIPOS_DOC = [
  'CUIT',
  'CUIL',
  'DNI',
  'PASAPORTE',
  'SIN_IDENTIFICAR',
] as const satisfies readonly TipoDocumento[];

export const CONDICIONES_IVA = [
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTO',
  'EXENTO',
  'CONSUMIDOR_FINAL',
  'NO_ALCANZADO',
] as const satisfies readonly CondicionIva[];

/** Condiciones que exigen identificación fiscal (espejo del CHECK en clientes). */
export const CONDICIONES_SIN_IDENTIFICACION: readonly CondicionIva[] = [
  'CONSUMIDOR_FINAL',
  'NO_ALCANZADO',
];

export const ETIQUETA_CONDICION_IVA: Record<CondicionIva, string> = {
  RESPONSABLE_INSCRIPTO: 'Resp. Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
  NO_ALCANZADO: 'No Alcanzado',
};

export const ETIQUETA_TIPO_DOC: Record<TipoDocumento, string> = {
  CUIT: 'CUIT',
  CUIL: 'CUIL',
  DNI: 'DNI',
  PASAPORTE: 'Pasaporte',
  SIN_IDENTIFICAR: 'Sin identificar',
};

export const ALICUOTAS_IVA = [0, 10.5, 21, 27] as const;

// Condiciones de IVA válidas para un emisor (empresa/proveedor con factura).
export const CONDICIONES_IVA_EMISOR = [
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTO',
  'EXENTO',
] as const satisfies readonly CondicionIva[];

export const TIPOS_EMISION = [
  'ELECTRONICA',
  'CONTROLADOR_FISCAL',
  'MANUAL',
  'NO_FISCAL',
] as const satisfies readonly TipoEmision[];

export const ETIQUETA_TIPO_EMISION: Record<TipoEmision, string> = {
  ELECTRONICA: 'Electrónica',
  CONTROLADOR_FISCAL: 'Controlador fiscal',
  MANUAL: 'Manual',
  NO_FISCAL: 'No fiscal',
};

export const TIPOS_AJUSTE_LISTA = [
  'MANUAL',
  'MARKUP_SOBRE_COSTO',
  'PORCENTAJE_SOBRE_LISTA',
] as const satisfies readonly TipoAjusteLista[];

export const ETIQUETA_TIPO_AJUSTE: Record<TipoAjusteLista, string> = {
  MANUAL: 'Manual',
  MARKUP_SOBRE_COSTO: 'Markup sobre costo',
  PORCENTAJE_SOBRE_LISTA: 'Porcentaje sobre lista',
};

export const UNIDADES_MEDIDA = [
  'UNIDAD',
  'KG',
  'GR',
  'LT',
  'ML',
  'MT',
  'CM',
  'M2',
  'M3',
  'CAJA',
  'PACK',
  'DOCENA',
  'HORA',
  'SERVICIO',
] as const;
