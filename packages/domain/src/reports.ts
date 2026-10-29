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
