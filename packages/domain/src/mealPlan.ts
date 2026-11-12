/**
 * Comidas, etapa 2 (docs/comidas.md): pure helpers for the adviser. Day targets that follow the week's
 * training and events, the meals of a day, and what to eat around a workout or a ride.
 * Estimates are labelled as such wherever they are shown.
 */

export type DayKind = 'fuerza' | 'descanso' | 'evento';
export type MealSlotKey = 'breakfast' | 'lunch' | 'afternoon_snack' | 'dinner' | 'snack';

export interface DayTarget {
  date: string;
  kind: DayKind;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  note: string | null;
}

export interface WeekTargetInput {
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  /** A normal day's target (the saved plan, or today's dynamic target without workouts). */
  baseKcal: number;
  proteinG: number;
  fatG: number;
  /** ISO weekdays (1 = Monday … 7 = Sunday) with a routine scheduled. */
  trainingDays: number[];
  /** Extra kcal on a strength day (the strength part of the daily target for ~1 h). */
  trainingKcal: number;
  /** Days with an event («asado», «salida»…). */
  events: Array<{ date: string; kind: string }>;
  /** Never plan a day below this (the energy floor for the person's sex). */
  floorKcal: number;
}

/** Extra kcal an event usually brings (an asado with bread and a drink, a dinner out). An estimate. */
export const EVENT_KCAL: Record<string, number> = { asado: 900, salida: 700, cumple: 700, otro: 500 };
/** At most this share of a normal day is moved to pay for an event, so no day gets too low. */
export const MAX_DAY_CUT = 0.1;

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The seven day targets. Strength days get their training kcal (as carbs); event days get the event's
 * usual extra, paid for by the other days of the week (up to 10 % each, never under the floor). The week
 * total stays the same as a plain week with the same training: the goal holds on a weekly basis.
 */
export function weekTargets(i: WeekTargetInput): DayTarget[] {
  const days = Array.from({ length: 7 }, (_, k) => {
    const date = addDaysIso(i.weekStart, k);
    const event = i.events.find((e) => e.date === date);
    const training = i.trainingDays.includes(k + 1);
    return { date, event, training, kcal: i.baseKcal + (training ? i.trainingKcal : 0) };
  });
  const extra = days.reduce((a, d) => a + (d.event ? EVENT_KCAL[d.event.kind] ?? EVENT_KCAL.otro! : 0), 0);
  const payers = days.filter((d) => !d.event);
  const room = payers.reduce((a, d) => a + Math.max(0, Math.min(d.kcal * MAX_DAY_CUT, d.kcal - i.floorKcal)), 0);
  const share = room > 0 ? Math.min(1, extra / room) : 0;
  return days.map((d) => {
    let kcal = d.kcal;
    let note: string | null = null;
    if (d.event) {
      kcal += EVENT_KCAL[d.event.kind] ?? EVENT_KCAL.otro!;
      note = 'Día de ' + d.event.kind + ': el resto de la semana lo compensa un poco.';
    } else if (share > 0) {
      kcal -= Math.max(0, Math.min(d.kcal * MAX_DAY_CUT, d.kcal - i.floorKcal)) * share;
    }
    kcal = Math.round(kcal / 10) * 10;
    const carbsG = Math.max(0, Math.round((kcal - i.proteinG * 4 - i.fatG * 9) / 4));
    return { date: d.date, kind: d.event ? 'evento' : d.training ? 'fuerza' : 'descanso', kcal, proteinG: i.proteinG, carbsG, fatG: i.fatG, note };
  });
}

/** The meals of a day for 3, 4 or 5 meals. */
export function slotsFor(mealsPerDay: number): MealSlotKey[] {
  if (mealsPerDay <= 3) return ['breakfast', 'lunch', 'dinner'];
  if (mealsPerDay === 4) return ['breakfast', 'lunch', 'afternoon_snack', 'dinner'];
  return ['breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack'];
}

/** Monday of the week that contains `iso` (YYYY-MM-DD). */
export function weekStartOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -wd);
}

// ── Around a ride ────────────────────────────────────────────────────────────

export interface RideFuel {
  kcal: number;
  /** Carbohydrate to eat during the ride, total grams (0 for rides under an hour). */
  carbsG: number;
  /** Water to drink during the ride, ml. */
  waterMl: number;
  /** «2 bananas» / «1 banana y 1 gel», or null when nothing is needed. */
  suggestion: string | null;
}

/**
 * Energy of a ride and what to take. Cycling METs by average speed (Compendium of Physical Activities:
 * ~6.8 up to 19 km/h, 8 up to 22, 10 above); net of resting. Carbs: nothing under 60 min, ~30 g per hour
 * up to 90 min, ~60 g per hour beyond. Water ~500 ml per hour. Estimates, said as such in the app.
 */
export function rideFuel(distanceM: number, durationS: number, weightKg: number): RideFuel {
  const h = Math.max(0, durationS) / 3600;
  const kmh = h > 0 ? distanceM / 1000 / h : 0;
  const met = kmh <= 19 ? 6.8 : kmh <= 22 ? 8 : 10;
  const kcal = Math.round(((met - 1) * weightKg * h) / 10) * 10;
  const perHour = h < 1 ? 0 : h <= 1.5 ? 30 : 60;
  const carbsG = Math.round(perHour * h / 5) * 5;
  const waterMl = Math.round((500 * h) / 50) * 50;
  let suggestion: string | null = null;
  if (carbsG > 0) {
    // A banana ≈ 27 g of carbs, a gel ≈ 25 g.
    const bananas = Math.min(3, Math.ceil(carbsG / 27));
    const rest = carbsG - bananas * 27;
    suggestion = bananas + (bananas === 1 ? ' banana' : ' bananas') + (rest > 10 ? ' y ' + Math.ceil(rest / 25) + ' gel' + (Math.ceil(rest / 25) > 1 ? 'es' : '') : '');
  }
  return { kcal, carbsG, waterMl, suggestion };
}

/**
 * The same for a run or a walk: net energy ≈ 1 kcal per kg and km running, ≈ 0.5 walking (independent
 * of pace, a well-known rule of thumb). Carbs only past ~75 min running; water ~500 ml/h running, 300 walking.
 */
export function footFuel(distanceM: number, durationS: number, weightKg: number, sport: 'run' | 'walk'): RideFuel {
  const h = Math.max(0, durationS) / 3600, km = Math.max(0, distanceM) / 1000;
  const kcal = Math.round((weightKg * km * (sport === 'run' ? 1 : 0.5)) / 10) * 10;
  const carbsG = sport === 'run' && h > 1.25 ? Math.round((30 * h) / 5) * 5 : 0;
  const waterMl = Math.round(((sport === 'run' ? 500 : 300) * h) / 50) * 50;
  const gels = Math.ceil(carbsG / 25);
  return { kcal, carbsG, waterMl, suggestion: carbsG > 0 ? (gels === 1 ? 'un gel o una banana' : gels + ' geles') : null };
}

// ── Around a workout ──────────────────────────────────────────────────────────

/** Protein after strength training: ~0.3 g per kg, between 20 and 40 g. */
export const postWorkoutProtein = (weightKg: number) => Math.max(20, Math.min(40, Math.round((weightKg * 0.3) / 5) * 5));

/** What to say before and after today's routine, with the protein still missing today. */
export function workoutFuelTips(p: { routineName: string; weightKg: number | null; proteinLeftG: number | null }): { before: string; after: string } {
  const post = p.weightKg ? postWorkoutProtein(p.weightKg) : 25;
  const left = p.proteinLeftG != null && p.proteinLeftG > 0 ? ' Hoy te faltan ' + Math.round(p.proteinLeftG) + ' g de proteína.' : '';
  return {
    before: 'Antes de ' + p.routineName + ' (2–3 h antes): algo con carbohidratos y un poco de proteína, como un sándwich de pollo o yogur con avena.',
    after: 'Después: unos ' + post + ' g de proteína en la próxima comida.' + left,
  };
}

// ── Water ─────────────────────────────────────────────────────────────────────

/**
 * A day's water goal: ~35 ml per kg (70 kg if unknown), +500 ml on a strength day, +500 ml per hour of
 * cycling. An estimate; food also brings water. Rounded to 50 ml.
 */
export function waterGoalMl(weightKg: number | null, strengthDay: boolean, rideMinutes = 0): number {
  const base = 35 * (weightKg ?? 70) + (strengthDay ? 500 : 0) + (500 * Math.max(0, rideMinutes)) / 60;
  return Math.round(base / 50) * 50;
}

/** Share of the day's calories of each meal (the same split the week plan uses). */
export const DAY_SHARE: Record<MealSlotKey, number> = { breakfast: 0.22, lunch: 0.33, afternoon_snack: 0.13, dinner: 0.32, snack: 0.08 };

export interface Left { kcal: number; proteinG: number; carbsG: number | null; fatG: number | null }
export interface MealLeft { slot: MealSlotKey; kcal: number; proteinG: number; carbsG: number | null; fatG: number | null }

/** Hour from which each meal is «now or later» (a meal whose time passed and was skipped is not asked for). */
const SLOT_FROM: Record<MealSlotKey, number> = { breakfast: 0, lunch: 11, afternoon_snack: 15, dinner: 19, snack: 22 };

/**
 * «¿Qué como ahora?»: the meals still to eat today and what each one should bring so the day closes on
 * target. The meals you skipped give their part to the ones left; the meals already logged count as done.
 * Empty when what is left is less than a snack (≈ 120 kcal). No meal goes over 40 % of the day's goal
 * (`goalKcal`): a whole day is not made up in one sitting; the rest is simply not eaten.
 */
export const MAX_MEAL_SHARE = 0.4;
export function mealsLeft(p: { mealsPerDay: number; logged: string[]; left: Left; hour: number; goalKcal?: number }): MealLeft[] {
  if (p.left.kcal < 120) return [];
  const slots = slotsFor(p.mealsPerDay);
  const open = slots.filter((s) => !p.logged.includes(s));
  const now = open.filter((s, i) => SLOT_FROM[s] <= p.hour && (open[i + 1] === undefined || SLOT_FROM[open[i + 1]!] > p.hour));
  const ahead = open.filter((s) => SLOT_FROM[s] > p.hour);
  // The meal of this time (or the last one that was skipped, late at night) and the ones still ahead.
  const pending = [...now, ...ahead];
  if (!pending.length) pending.push(open[open.length - 1] ?? slots[slots.length - 1]!);
  const total = pending.reduce((a, s) => a + DAY_SHARE[s], 0);
  const part = (v: number | null, s: MealSlotKey) => (v == null ? null : Math.max(0, Math.round((v * DAY_SHARE[s]) / total)));
  const cap = p.goalKcal ? p.goalKcal * MAX_MEAL_SHARE : Infinity;
  return pending.map((s) => {
    const kcal = part(p.left.kcal, s)!;
    const k = kcal > cap ? cap / kcal : 1;
    const scaled = (v: number | null) => (v == null ? null : Math.round(v * k));
    return { slot: s, kcal: Math.round(kcal * k), proteinG: scaled(part(p.left.proteinG, s))!, carbsG: scaled(part(p.left.carbsG, s)), fatG: scaled(part(p.left.fatG, s)) };
  });
}
