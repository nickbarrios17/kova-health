/**
 * Exercise detail: how-to copy, images and the link from a user's own exercise (typed or imported,
 * name only) to the catalog entry that has that content.
 */
import { normalize } from './routineImport.js';

/** `exercises.instructions`: catalog copy uses `steps`; the original 5 also have coaching cues. */
export interface ExerciseInstructions {
  steps?: string[];
  tempo?: string;
  cues?: Array<{ title: string; body: string }>;
  errors?: Array<{ title: string; fix: string }>;
  breath?: string[];
}

/** `exercises.media`: references only; images live in the public `exercise-media` bucket. */
export interface ExerciseMedia {
  kind: 'image' | 'animation' | 'video';
  ref: string;
  license?: string;
  source?: string;
}

/** Public URLs of an exercise's images, in order (start and end position for catalog entries). */
export function exerciseImages(media: unknown, supabaseUrl: string): string[] {
  if (!Array.isArray(media) || !supabaseUrl) return [];
  const base = supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/';
  return (media as ExerciseMedia[])
    .filter((m) => m && m.kind === 'image' && typeof m.ref === 'string' && /^[a-z0-9-]+\/[a-z0-9/_.-]+$/i.test(m.ref))
    .map((m) => base + m.ref);
}

export function hasHowTo(instructions: unknown, media: unknown): boolean {
  const i = (instructions ?? {}) as ExerciseInstructions;
  return Boolean(i.steps?.length || i.cues?.length || (Array.isArray(media) && media.some((m) => m?.kind === 'image')));
}

export const MUSCLE_LABEL: Record<string, string> = {
  quads: 'Cuádriceps', hamstrings: 'Isquiotibiales', glutes: 'Glúteos', calves: 'Gemelos', adductors: 'Aductores',
  abductors: 'Abductores', abs: 'Abdomen', lower_back: 'Espalda baja', lats: 'Dorsales', upper_back: 'Espalda alta',
  traps: 'Trapecio', chest: 'Pecho', delts: 'Hombros', front_delts: 'Hombro anterior', biceps: 'Bíceps',
  triceps: 'Tríceps', forearms: 'Antebrazo', cardio: 'Cardio',
};

export const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: 'Barra', dumbbell: 'Mancuerna', cable: 'Polea', machine: 'Máquina', bodyweight: 'Peso corporal',
  kettlebell: 'Kettlebell', band: 'Banda', ez_bar: 'Barra EZ', smith: 'Smith', lever: 'Palanca', bench: 'Banco',
  rack: 'Rack', plates: 'Discos', other: 'Otro',
};

// Common gym names (English and Spanish variants) -> catalog name, normalized.
const SYNONYMS: Array<[RegExp, string]> = [
  // Order matters: the specific variant before the generic name.
  [/\bfront squats?\b/, 'sentadilla frontal'],
  [/\bbulgarian|\bbulgara\b/, 'sentadilla bulgara con mancuernas'],
  [/\b(back )?squats?\b|^sentadillas?$|\bsentadilla (trasera|libre con barra)\b/, 'sentadilla con barra'],
  [/\bleg press\b|\bprensa\b/, 'prensa de piernas'],
  [/\bleg extensions?\b|\bsillon de cuadriceps\b|\bextension(es)? de (piernas|cuadriceps)\b/, 'extension de cuadriceps'],
  [/\b(lying )?leg curls?\b|\bcurl (de )?femoral\b|\bisquios?\b/, 'curl femoral acostado'],
  [/\bromanian\b|\brdl\b|\brumano\b/, 'peso muerto rumano'],
  [/\bdeadlifts?\b|\bpeso muerto( convencional)?$/, 'peso muerto'],
  [/\bhip thrusts?\b|\bempuje de cadera\b/, 'hip thrust con barra'],
  [/\bcalf raises?\b|\bgemelos?\b|\bpantorrillas?\b/, 'elevacion de gemelos de pie'],
  [/\blunges?\b|\bestocadas?\b|\bzancadas?\b/, 'estocadas con mancuernas'],
  [/\bincline (bench|press)\b|\bpress inclinado\b/, 'press inclinado con barra'],
  [/\bdumbbell (bench|press)\b|\bpress (plano )?con mancuernas\b/, 'press de banca con mancuernas'],
  [/\bbench( press)?\b|\bpress plano\b|\bbanco plano\b|\bpress de pecho con barra\b/, 'press de banca'],
  [/\bflyes?\b|\baperturas?\b/, 'aperturas con mancuernas'],
  [/\bpec ?deck\b|\bmariposa\b/, 'pec deck (mariposa)'],
  [/\bcrossovers?\b|\bcruces? de poleas?\b/, 'cruce de poleas'],
  [/\bpush ?ups?\b|\bflexiones\b|\blagartijas\b/, 'flexiones de brazos'],
  [/\bdips?\b|\bfondos\b/, 'fondos en paralelas (triceps)'],
  [/\bpull ?ups?\b|\bdominadas?$/, 'dominadas'],
  [/\bchin ?ups?\b/, 'dominadas supinas'],
  [/\blat pull[ -]?downs?\b|\bjalon\b|\bpolea al pecho\b/, 'jalon al pecho'],
  [/\bt[ -]?bar\b|\bbarra t\b|\bremo (en )?t\b/, 'remo en t'],
  [/\b(one arm )?dumbbell rows?\b|\bremo (con )?mancuerna\b|\bserrucho\b/, 'remo con mancuerna a un brazo'],
  [/\bseated (cable )?rows?\b|\bremo (en )?(polea|sentado|gironda)\b/, 'remo sentado en polea'],
  [/\b(barbell |bent over )?rows?\b|\bremo con barra\b/, 'remo con barra'],
  [/\bshrugs?\b|\bencogimientos?\b/, 'encogimientos con mancuernas'],
  [/\b(overhead|military|shoulder) press\b|\bpress (de )?hombros?\b|\bpress militar\b/, 'press militar'],
  [/\barnold\b/, 'press arnold'],
  [/\blateral raises?\b|\belevaciones? laterales?\b|\bvuelos? laterales?\b/, 'elevaciones laterales'],
  [/\bfront raises?\b|\belevaciones? frontales?\b|\bvuelos? frontales?\b/, 'elevaciones frontales'],
  [/\brear delts?\b|\bpajaros?\b|\bvuelos? posteriores?\b/, 'pajaros (deltoides posterior)'],
  [/\bface ?pulls?\b/, 'face pull'],
  [/\bupright rows?\b|\bremo al menton\b/, 'remo al menton'],
  [/\bhammer curls?\b|\bcurl (de )?martillo\b/, 'curl martillo'],
  [/\bpreacher\b|\bcurl (en )?(banco )?scott\b|\bpredicador\b/, 'curl predicador'],
  [/\bconcentration\b|\bconcentrado\b/, 'curl concentrado'],
  [/\b(barbell |biceps? )?curls?\b|\bcurl de biceps\b/, 'curl de biceps con barra'],
  [/\bskull ?crushers?\b|\bpress frances\b/, 'press frances con barra ez'],
  [/\b(triceps? )?push[ -]?downs?\b|\bextension(es)? de triceps (en )?polea\b|\btriceps (en )?polea\b/, 'extension de triceps en polea'],
  [/\bkickbacks?\b|\bpatada de triceps\b/, 'patada de triceps'],
  [/\bplanks?\b|\bplancha\b/, 'plancha'],
  [/\bcrunch(es)?\b|\babdominales\b/, 'abdominales (crunch)'],
  [/\bleg raises?\b|\belevacion(es)? de piernas\b/, 'elevacion de piernas acostado'],
  [/\brussian twists?\b|\bgiros? rusos?\b/, 'giro ruso'],
  [/\bab (wheel|roller)\b|\brueda\b/, 'rueda abdominal'],
  [/\bswings?\b/, 'swing con kettlebell'],
  [/\bbox jumps?\b|\bsalto al cajon\b/, 'salto al cajon'],
  [/\btreadmill\b|\bcinta\b/, 'correr en cinta'],
  [/\bbike\b|\bbicicleta\b|\bspinning\b/, 'bicicleta fija'],
  [/\browing machine\b|\bergometro\b/, 'remo ergometro'],
  [/\bjump rope\b|\bsoga\b|\bcomba\b/, 'saltar la soga'],
];

const STOP = new Set(['de', 'del', 'con', 'en', 'la', 'el', 'los', 'las', 'a', 'al', 'y', 'o', 'para', 'the', 'with', 'on']);
// Words, without stop words and with a crude plural strip ("mancuernas" = "mancuerna").
const tokens = (s: string) =>
  new Set(normalize(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t)).map((t) => (t.length > 4 ? t.replace(/e?s$/, '') : t)));

/**
 * The catalog entry that best describes an exercise known only by its name, or null when unsure.
 * Exact name first, then the closest by shared words (it must clearly win), then common synonyms.
 */
export function findCatalogMatch<T extends { name: string; short_name?: string | null }>(raw: string, catalog: T[]): T | null {
  const n = normalize(raw).replace(/\s+/g, ' ').trim();
  if (!n) return null;
  const byName = new Map<string, T>();
  for (const e of catalog) {
    byName.set(normalize(e.name), e);
    if (e.short_name) byName.set(normalize(e.short_name), byName.get(normalize(e.short_name)) ?? e);
  }
  const exact = byName.get(n);
  if (exact) return exact;

  const want = tokens(n);
  let best: T | null = null, bestScore = 0, second = 0;
  for (const e of want.size ? catalog : []) {
    const have = tokens(e.name);
    let shared = 0;
    for (const t of want) if (have.has(t)) shared++;
    const score = shared / (want.size + have.size - shared); // Jaccard
    if (score > bestScore) [second, bestScore, best] = [bestScore, score, e];
    else if (score > second) second = score;
  }
  if (best && bestScore >= 0.6 && bestScore - second >= 0.15) return best;
  // Every typed word appears in exactly one catalog name ("Sentadilla" in a catalog with one squat).
  const containing = want.size ? catalog.filter((e) => { const have = tokens(e.name); return [...want].every((t) => have.has(t)); }) : [];
  if (containing.length === 1) return containing[0]!;

  const syn = SYNONYMS.find(([re]) => re.test(n));
  return (syn && byName.get(normalize(syn[1]))) || null;
}
