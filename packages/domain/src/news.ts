import { addDays } from './format.js';

/**
 * Novedades (docs/novedades.md): what changed, day by day, shown once when the app or the web opens
 * after an update, and kept in Ajustes → Novedades. Newest day first. Add a day with every change
 * people will notice; write it for them, not for developers.
 *
 * `preview: true` marks an item that is only in the test app and the test web so far: drop the flag
 * when it reaches the official app.
 */
export interface NewsItem {
  title: string;
  body?: string;
  preview?: true;
}
export interface NewsDay {
  date: string; // YYYY-MM-DD, also the day's id
  items: NewsItem[];
}

export const NEWS: NewsDay[] = [
  {
    date: '2026-10-30',
    items: [
      { title: 'Novedades', body: 'Cuando la app se actualiza, te contamos acá qué hay de nuevo. Las anteriores quedan en Ajustes → Novedades.' },
      { title: 'Reportar un problema', body: 'Tocá el ⚠️ que está en cada pantalla para contarnos si algo falla, se ve mal o se te ocurre una idea. Te da opciones según dónde estés y podés agregar un comentario.' },
      { title: 'Coach y amigos', body: 'Invitá a tu coach, a tus alumnos o a tus amigos con un código. Tu coach puede armarte rutinas y ver tus entrenamientos; vos elegís qué más compartir.', preview: true },
    ],
  },
  {
    date: '2026-10-29',
    items: [
      { title: 'Ejercicios con modelo 3D', body: 'Cada ejercicio del catálogo muestra un modelo 3D haciendo el movimiento. Arrastrá para girarlo.' },
      { title: 'Progreso con gráficos', body: 'Progreso muestra solo tus datos reales, con gráficos. Tocá una tarjeta de Hoy para ver su desglose.' },
      { title: 'El botón atrás vuelve atrás', body: 'En Android, atrás te lleva a la pantalla anterior y después a Hoy, en vez de cerrar la app.' },
      { title: 'Ajustes', body: 'Health Connect, la versión de la app y tu cuenta ahora están en Ajustes.' },
      { title: 'Logo nuevo' },
    ],
  },
];

/** The days (and items) this build shows: preview items only in the test app / test web. */
export function newsFor(preview: boolean, news: NewsDay[] = NEWS): NewsDay[] {
  return news
    .map((d) => ({ ...d, items: d.items.filter((i) => preview || !i.preview) }))
    .filter((d) => d.items.length > 0);
}

/**
 * Days to show on open. `seen` is null the first time on a device: then only the last week is shown,
 * so a new account is not greeted with the whole history. The id of a day includes its item count,
 * so a day that gains items later counts as new again.
 */
export function unseenNews(days: NewsDay[], seen: string[] | null, today: string): NewsDay[] {
  if (seen == null) {
    const from = addDays(today, -7);
    return days.filter((d) => d.date > from);
  }
  return days.filter((d) => !seen.includes(newsId(d)));
}

export const newsId = (d: NewsDay) => d.date + '#' + d.items.length;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Jueves 30 de octubre" (no Intl: Hermes may lack the locale data). */
export function newsDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
  return wd[0]!.toUpperCase() + wd.slice(1) + ' ' + d + ' de ' + MESES[m - 1];
}
