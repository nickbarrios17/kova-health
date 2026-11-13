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
    date: '2026-11-13',
    items: [
      { title: 'Tus entrenos de Samsung Health', body: 'Los entrenos que grabás con el reloj (pesas, correr, bici…) ahora cuentan como entreno y suman sus calorías a tu meta del día. Si también lo hiciste con Kova, cuenta una sola vez.' },
      { title: 'Todo lo de tu reloj', body: 'En Hoy, «Del reloj» muestra lo que midió: calorías, distancia, pisos, pulso, presión, oxígeno, agua corporal y más. Para traerlo, tocá «Traer todo lo del reloj» en Hoy.' },
      { title: '¿Qué como ahora?', body: 'En Comida, contale qué tenés y te armo las comidas que te faltan hoy para llegar a tu meta: todo el día si recién arrancás, o solo la cena. Cada plato te dice sus calorías y macros, y qué te faltaría comprar. Sin atracones: ninguna comida se pasa de lo razonable.' },
    ],
  },
  {
    date: '2026-11-12',
    items: [
      { title: 'Tu semana desde lo que tenés', body: 'Antes de armar la semana, Kova te pregunta qué hay en casa y lo usa primero. La compra solo completa lo que falta.' },
      { title: 'Revisar el ticket', body: 'En Compras, sacale una foto al ticket del súper: ves qué compraste de la lista, qué te faltó y qué quedó fuera del plan.' },
      { title: 'Correr y caminar', body: 'En Entrenar, armá circuitos a pie como los de Ciclismo: por tiempo o hasta un lugar, con tu ritmo en min/km y navegación con voz.' },
      { title: 'El teclado ya no tapa', body: 'Cuando escribís, lo que estás escribiendo queda siempre a la vista, y un solo toque alcanza para los botones.' },
    ],
  },
  {
    date: '2026-11-11',
    items: [
      { title: 'Tu semana de comidas', body: 'En Comida, Kova te arma las comidas de la semana con platos caseros, alrededor de tus entrenamientos: más carbohidratos los días de fuerza. Tocá «Lo comí» para registrarla o «Cambiar» si no te tienta.' },
      { title: 'Modo asado', body: '¿Tenés un asado o una salida? Marcalo en «Tu semana»: ese día suma lo que suele traer y el resto de la semana lo compensa un poco, sin pasarse.' },
      { title: 'Comida para entrenar y para la bici', body: 'En Hoy te decimos qué comer antes y después de tu rutina. En Ciclismo, cuánto gasta la vuelta, qué llevar y cuánta agua.' },
    ],
  },
  {
    date: '2026-11-10',
    items: [
      { title: 'Contame qué comiste', body: 'En Comida, escribí o dictá lo que comiste («2 empanadas y una ensalada») o sacale una foto al plato, y te lo cargamos. Revisás cada cosa antes de guardar; lo que es estimado queda marcado así.' },
      { title: 'Código de barras', body: 'Escaneá un producto y te mostramos sus calorías, los sellos de exceso y, si conocemos uno, una opción con menos sellos de la misma góndola. Si nadie lo cargó, sacale una foto a la etiqueta.' },
      { title: 'Comidas argentinas', body: 'El buscador ya tiene más de 180 alimentos y platos típicos con porciones caseras, y te entiende aunque no pongas tildes.' },
    ],
  },
  {
    date: '2026-11-09',
    items: [
      { title: 'Ciclismo', body: 'En Entrenar → Ciclismo: decí cuánto querés andar y te armamos recorridos, o buscá a dónde vas. Te mostramos cuánto va por bicisenda, calles o avenidas, qué parques cruzás y el tiempo estimado. Mirala en 3D, tocá Navegar para que te guíe con voz, y mirá qué zonas tienen más robos o choques.' },
      { title: 'Nuevo diseño', body: 'Kova Health se ve distinto: botones más claros, Hoy ordenado en tu preparación, tu plan y tu progreso, y un aviso de cuántas series quedan por enviar cuando no tenés conexión.' },
    ],
  },
  {
    date: '2026-11-07',
    items: [
      { title: 'Kova en iPhone', body: 'Abrí la web de Kova desde el celular y vas a ver la app, igual que en Android. En iPhone, desde Safari: Compartir → Agregar a la pantalla de inicio. Los pasos y el sueño no llegan en el navegador.' },
      { title: 'Coach y amigos', body: 'Invitá a tu coach, a tus alumnos o a tus amigos con un código. Tu coach puede armarte rutinas y ver tus entrenamientos; vos elegís qué más compartir.' },
    ],
  },
  {
    date: '2026-10-30',
    items: [
      { title: 'Novedades', body: 'Cuando la app se actualiza, te contamos acá qué hay de nuevo. Las anteriores quedan en Ajustes → Novedades.' },
      { title: 'Reportar un problema', body: 'Tocá el ⚠️ que está en cada pantalla para contarnos si algo falla, se ve mal o se te ocurre una idea. Te da opciones según dónde estés y podés agregar un comentario.' },
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
