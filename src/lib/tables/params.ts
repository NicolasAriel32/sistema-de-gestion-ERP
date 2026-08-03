export type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

export type TablaParams = {
  page: number;
  size: number;
  q: string;
  sort: string;
  dir: 'asc' | 'desc';
  estado: EstadoFiltro;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function primero(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? '';
  return valor ?? '';
}

function entero(valor: string | string[] | undefined, porDefecto: number): number {
  const n = Number(primero(valor));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto;
}

/** Traduce los searchParams de la URL a parámetros de consulta validados. */
export function parseTablaParams(
  searchParams: RawSearchParams,
  opciones: { defaultSort: string; defaultSize?: number },
): TablaParams {
  const dir = primero(searchParams.dir) === 'desc' ? 'desc' : 'asc';
  const estadoRaw = primero(searchParams.estado);
  const estado: EstadoFiltro =
    estadoRaw === 'activos' || estadoRaw === 'inactivos' ? estadoRaw : 'todos';

  return {
    page: entero(searchParams.page, 1),
    size: Math.min(entero(searchParams.size, opciones.defaultSize ?? 20), 100),
    q: primero(searchParams.q).trim(),
    sort: primero(searchParams.sort) || opciones.defaultSort,
    dir,
    estado,
  };
}

/** Rango [desde, hasta] para `.range()` de Supabase a partir de page/size. */
export function rangoPagina(page: number, size: number): [number, number] {
  const desde = (page - 1) * size;
  return [desde, desde + size - 1];
}

export function totalPaginas(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}
