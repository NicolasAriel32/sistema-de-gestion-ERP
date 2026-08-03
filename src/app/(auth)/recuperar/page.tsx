import type { Metadata } from 'next';

import { RecuperarForm } from './recuperar-form';

export const metadata: Metadata = { title: 'Recuperar acceso' };

export default function RecuperarPage() {
  return <RecuperarForm />;
}
