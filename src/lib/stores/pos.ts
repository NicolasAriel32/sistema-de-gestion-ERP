import { create } from 'zustand';

/**
 * Carrito del mostrador.
 *
 * Es el único lugar del sistema con estado de cliente global: el POS
 * necesita que el carrito sobreviva a los remontajes del buscador y del
 * lector de código de barras, y pasarlo por props volvería el árbol
 * ingobernable. El resto de la aplicación sigue con Server Components.
 *
 * Ojo: acá NO se calculan importes. El carrito sólo guarda cantidades y
 * precios; los totales los produce `calcularTotales` y, en la emisión,
 * se recalculan de nuevo en el servidor.
 */

export type LineaPos = {
  productoId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje: number;
  alicuotaIva: number;
  saldo: number | null;
  manejaStock: boolean;
  permiteVentaSinStock: boolean;
};

type EstadoPos = {
  lineas: LineaPos[];
  clienteId: string | null;
  clienteNombre: string | null;
  descuentoGlobal: number;

  agregar: (linea: Omit<LineaPos, 'cantidad' | 'descuentoPorcentaje'> & { cantidad?: number }) => void;
  cambiarCantidad: (productoId: string, cantidad: number) => void;
  cambiarPrecio: (productoId: string, precio: number) => void;
  cambiarDescuentoLinea: (productoId: string, porcentaje: number) => void;
  quitar: (productoId: string) => void;
  setCliente: (id: string | null, nombre: string | null) => void;
  setDescuentoGlobal: (porcentaje: number) => void;
  vaciar: () => void;
};

export const usePos = create<EstadoPos>((set) => ({
  lineas: [],
  clienteId: null,
  clienteNombre: null,
  descuentoGlobal: 0,

  agregar: (linea) =>
    set((estado) => {
      const cantidad = linea.cantidad ?? 1;
      const existente = estado.lineas.find((l) => l.productoId === linea.productoId);

      // Escanear dos veces el mismo producto suma, no duplica el renglón.
      if (existente) {
        return {
          lineas: estado.lineas.map((l) =>
            l.productoId === linea.productoId ? { ...l, cantidad: l.cantidad + cantidad } : l,
          ),
        };
      }

      return {
        lineas: [...estado.lineas, { ...linea, cantidad, descuentoPorcentaje: 0 }],
      };
    }),

  cambiarCantidad: (productoId, cantidad) =>
    set((estado) => ({
      lineas:
        cantidad <= 0
          ? estado.lineas.filter((l) => l.productoId !== productoId)
          : estado.lineas.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l)),
    })),

  cambiarPrecio: (productoId, precio) =>
    set((estado) => ({
      lineas: estado.lineas.map((l) =>
        l.productoId === productoId ? { ...l, precioUnitario: Math.max(0, precio) } : l,
      ),
    })),

  cambiarDescuentoLinea: (productoId, porcentaje) =>
    set((estado) => ({
      lineas: estado.lineas.map((l) =>
        l.productoId === productoId
          ? { ...l, descuentoPorcentaje: Math.min(100, Math.max(0, porcentaje)) }
          : l,
      ),
    })),

  quitar: (productoId) =>
    set((estado) => ({ lineas: estado.lineas.filter((l) => l.productoId !== productoId) })),

  setCliente: (clienteId, clienteNombre) => set({ clienteId, clienteNombre }),

  setDescuentoGlobal: (descuentoGlobal) =>
    set({ descuentoGlobal: Math.min(100, Math.max(0, descuentoGlobal)) }),

  vaciar: () => set({ lineas: [], descuentoGlobal: 0 }),
}));
