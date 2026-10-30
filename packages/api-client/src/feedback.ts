/** «Reportar un problema» (docs/reportes.md). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { KovaError, type AdminReport, type ReportCategory, type ReportContext, type ReportStatus } from '@kova/domain';

interface FeedbackDeps {
  sb: SupabaseClient;
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;
  call: <R extends { data: unknown; error: unknown }>(p: PromiseLike<R>) => Promise<NonNullable<R['data']>>;
}

export function createFeedback({ sb, rpc, call }: FeedbackDeps) {
  return {
    /** Sends a report. Idempotent on `id` (a retry after a lost response does not duplicate it). */
    report: async (r: { id: string; category: ReportCategory; message: string; context?: ReportContext }) => {
      const message = r.message.trim();
      if (message.length < 3) throw new KovaError('INVALID_INPUT', 'Cuéntanos un poco más (al menos unas palabras).');
      await call(sb.from('feedback_reports').upsert(
        { id: r.id, category: r.category, message: message.slice(0, 2000), context: r.context ?? {} },
        { onConflict: 'id', ignoreDuplicates: true },
      ));
    },
    /** My own reports, newest first. */
    mine: () => call(sb.from('feedback_reports').select('id, category, message, status, admin_note, created_at').order('created_at', { ascending: false }).limit(50)),
    /** Admins only (FORBIDDEN otherwise). */
    isAdmin: () => rpc<boolean>('am_i_admin', {}),
    all: (status?: ReportStatus) => rpc<AdminReport[]>('admin_reports', { p_status: status ?? null, p_limit: 300 }),
    setStatus: (id: string, status: ReportStatus, note?: string) => rpc<null>('admin_set_report', { p_id: id, p_status: status, p_note: note ?? null }),
  };
}
