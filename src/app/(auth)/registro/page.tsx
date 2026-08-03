import type { Metadata } from 'next';

import { RegistroForm } from './registro-form';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegistroPage() {
  return <RegistroForm />;
}
