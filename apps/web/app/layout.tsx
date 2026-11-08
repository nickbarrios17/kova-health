import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';
import '@phosphor-icons/web/bold';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './nocturne.css';
import './kova.css';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Kova Health',
  description: 'Tu salud y tu entrenamiento, en un solo lugar.',
};

// Phones get the phone app built for the browser (/m/, docs/web-celular.md); the desktop web stays
// for wide screens. Runs before anything renders. ?escritorio (or «Ver la versión de escritorio» in
// the phone app) keeps this browser on the desktop web; password-reset links always stay here.
const PHONE_REDIRECT = `(function(){try{
var p=location.pathname,q=new URLSearchParams(location.search),k='kova:prefer-desktop';
// Never from /m itself: if the phone build is missing, its 404 page must not loop.
if(p==='/m'||p.indexOf('/m/')===0||p.indexOf('/reset-password')===0)return;
if(q.has('escritorio')){localStorage.setItem(k,'1');return;}
if(localStorage.getItem(k)||innerWidth>=768)return;
var s=p.split('/'),c=s[1]==='invitar'&&s[2];
location.replace('/m'+(c?'?invitar='+encodeURIComponent(c):''));
}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: PHONE_REDIRECT }} />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
