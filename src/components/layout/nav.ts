import {
  BarChart3,
  Boxes,
  Building2,
  LayoutDashboard,
  Package,
  ReceiptText,
  ShoppingCart,
  Tag,
  Tags,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Módulos futuros se muestran en gris. Los de Fase 1 están disponibles. */
  disponible: boolean;
};

export type NavSection = { titulo: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    titulo: 'General',
    items: [{ href: '/', label: 'Inicio', icon: LayoutDashboard, disponible: true }],
  },
  {
    titulo: 'Catálogos',
    items: [
      { href: '/clientes', label: 'Clientes', icon: Users, disponible: true },
      { href: '/productos', label: 'Productos', icon: Package, disponible: true },
      { href: '/categorias', label: 'Categorías', icon: Tags, disponible: true },
      { href: '/proveedores', label: 'Proveedores', icon: Truck, disponible: true },
      { href: '/depositos', label: 'Depósitos', icon: Warehouse, disponible: true },
      { href: '/puntos-venta', label: 'Puntos de venta', icon: ReceiptText, disponible: true },
      { href: '/listas-precios', label: 'Listas de precios', icon: Tag, disponible: true },
    ],
  },
  {
    titulo: 'Operación',
    items: [
      { href: '/ventas', label: 'Ventas', icon: ShoppingCart, disponible: false },
      { href: '/stock', label: 'Stock', icon: Boxes, disponible: false },
      { href: '/tesoreria', label: 'Tesorería', icon: Wallet, disponible: false },
      { href: '/reportes', label: 'Reportes', icon: BarChart3, disponible: false },
    ],
  },
];

export const ICONO_EMPRESA = Building2;
