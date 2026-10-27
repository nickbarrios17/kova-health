import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';
import '@phosphor-icons/web/bold';
import './nocturne.css';
import './vida.css';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: 'VIDA',
  description: 'Tu salud y tu entrenamiento, en un solo lugar.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
