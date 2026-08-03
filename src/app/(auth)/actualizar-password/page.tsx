import type { Metadata } from 'next';

import { ActualizarForm } from './actualizar-form';

export const metadata: Metadata = { title: 'Nueva contraseña' };

export default function ActualizarPasswordPage() {
  return <ActualizarForm />;
}
