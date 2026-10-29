/** «Reportar un problema» (docs/reportes.md): categories and statuses, in the order the UI shows them. */

export type ReportCategory = 'exercise' | 'model3d' | 'interface' | 'bug' | 'idea' | 'other';
export type ReportStatus = 'new' | 'seen' | 'done' | 'dismissed';

export const REPORT_CATEGORIES: Array<[ReportCategory, string]> = [
  ['bug', 'Algo no funciona'],
  ['exercise', 'Un ejercicio (datos, nombre, instrucciones)'],
  ['model3d', 'El modelo 3D'],
  ['interface', 'Diseño o textos'],
  ['idea', 'Una idea o mejora'],
  ['other', 'Otra cosa'],
];
export const REPORT_CATEGORY_LABEL = Object.fromEntries(REPORT_CATEGORIES) as Record<ReportCategory, string>;

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  new: 'Nuevo', seen: 'Visto', done: 'Resuelto', dismissed: 'Descartado',
};

/** Where a report was sent from; the app fills it, the person only writes the message. */
export interface ReportContext {
  symptoms?: string[];
  metric?: string;
  screen?: string;
  exercise_id?: string;
  exercise_name?: string;
  platform?: string;
  app_version?: string;
}

export interface AdminReport {
  id: string;
  category: ReportCategory;
  message: string;
  context: ReportContext;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
  reporter_name: string;
}

/** Screens the ⚠️ button knows; each offers its own quick options. */
export type ReportScreen = 'hoy' | 'entrenar' | 'session' | 'exercise' | 'comida' | 'progreso' | 'metric' | 'ajustes' | 'personas' | 'routine' | 'other';

export interface ReportOption {
  key: string;
  label: string;
  category: ReportCategory;
}

const GENERAL: ReportOption[] = [
  { key: 'crash', label: 'La app se cierra o se traba', category: 'bug' },
  { key: 'looks_wrong', label: 'Algo se ve mal o no se entiende', category: 'interface' },
  { key: 'idea', label: 'Tengo una idea para esta pantalla', category: 'idea' },
];

/** Quick options for the screen the person is on (most specific first), then the general ones. */
export const REPORT_OPTIONS: Record<ReportScreen, ReportOption[]> = {
  exercise: [
    { key: 'model_wrong', label: 'El modelo 3D no hace bien el movimiento', category: 'model3d' },
    { key: 'model_missing', label: 'El modelo 3D no carga o se ve raro', category: 'model3d' },
    { key: 'steps_wrong', label: 'Las instrucciones están mal o incompletas', category: 'exercise' },
    { key: 'name_wrong', label: 'El nombre, los músculos o el equipo están mal', category: 'exercise' },
  ],
  session: [
    { key: 'set_lost', label: 'No se guardó una serie', category: 'bug' },
    { key: 'rest_timer', label: 'El descanso o el cronómetro fallan', category: 'bug' },
    { key: 'weights_wrong', label: 'Los pesos o las repeticiones se muestran mal', category: 'bug' },
    { key: 'model_wrong', label: 'El modelo 3D de este ejercicio está mal', category: 'model3d' },
  ],
  hoy: [
    { key: 'numbers_wrong', label: 'Un número no coincide con mis datos', category: 'bug' },
    { key: 'sync_missing', label: 'No llegan los pasos o el sueño', category: 'bug' },
    { key: 'goal_weird', label: 'La meta de calorías no tiene sentido', category: 'bug' },
  ],
  comida: [
    { key: 'food_missing', label: 'No encuentro un alimento', category: 'other' },
    { key: 'macros_wrong', label: 'Las calorías o macros de un alimento están mal', category: 'bug' },
    { key: 'meal_lost', label: 'No se guardó lo que comí', category: 'bug' },
  ],
  progreso: [
    { key: 'chart_weird', label: 'Un gráfico muestra datos raros', category: 'bug' },
    { key: 'days_missing', label: 'Faltan días que sí registré', category: 'bug' },
  ],
  metric: [
    { key: 'chart_weird', label: 'El gráfico muestra datos raros', category: 'bug' },
    { key: 'days_missing', label: 'Faltan días que sí registré', category: 'bug' },
    { key: 'log_failed', label: 'No pude anotar mi peso, ánimo o hábito', category: 'bug' },
  ],
  entrenar: [
    { key: 'routine_wrong', label: 'Una rutina se ve mal o le faltan ejercicios', category: 'bug' },
    { key: 'history_wrong', label: 'El historial no muestra un entrenamiento', category: 'bug' },
  ],
  routine: [
    { key: 'cant_save', label: 'No puedo guardar la rutina', category: 'bug' },
    { key: 'exercise_missing', label: 'No encuentro un ejercicio', category: 'exercise' },
  ],
  ajustes: [
    { key: 'health_sync', label: 'Health Connect no sincroniza', category: 'bug' },
    { key: 'update_failed', label: 'La actualización no se instala', category: 'bug' },
  ],
  personas: [
    { key: 'invite_failed', label: 'Un código de invitación no funciona', category: 'bug' },
    { key: 'link_wrong', label: 'Veo (o no veo) datos que no corresponden', category: 'bug' },
  ],
  other: [],
};

export function reportOptions(screen: ReportScreen): ReportOption[] {
  return [...(REPORT_OPTIONS[screen] ?? []), ...GENERAL];
}

/**
 * The message stored for a report: the chosen options, then what the person wrote (the symptom,
 * what they were doing). Category = that of the first option, else the one picked by hand.
 */
export function composeReport(options: ReportOption[], comment: string, fallback: ReportCategory = 'bug'): { category: ReportCategory; message: string } {
  const lines = options.map((o) => '• ' + o.label);
  const text = comment.trim();
  return { category: options[0]?.category ?? fallback, message: [...lines, ...(text ? [text] : [])].join('\n').slice(0, 2000) };
}
