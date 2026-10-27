'use client';
/** Coach — VIDA Intelligence v1: deterministic insights over your last 60 days (no AI). */
import { EVIDENCE_LABEL, KIND_LABEL, localDate } from '@vida/domain';
import { EmptyState, ErrorNotice, Loading } from '@/components/EmptyState';
import { InsightCard } from '@/components/InsightCard';
import { vida } from '@/lib/client';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';

export default function CoachPage() {
  const { prefs } = useSession();
  const today = localDate(new Date(), prefs!.time_zone);
  const q = useAsync(() => vida().insights.today(today, 10), [today]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  const list = q.data!;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.length === 0 ? (
          <EmptyState icon="ph ph-lightbulb-filament" title="Todavía no hay nada que contarte">
            VIDA busca hechos y patrones en tus últimos 60 días de entrenamiento, comida, sueño, hábitos y peso. Aparecerán aquí cuando haya datos suficientes; no mostramos ejemplos inventados.
          </EmptyState>
        ) : (
          list.map((i) => (
            <InsightCard key={i.key} insight={i} onFeedback={(v) => vida().insights.feedback(i.key, today, v).catch(() => undefined)} />
          ))
        )}
      </div>
      <aside style={{ flex: '1 1 260px', padding: '16px 18px', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Cómo leer el Coach</span>
        {(['fact', 'pattern', 'prediction', 'hypothesis'] as const).map((k) => (
          <span key={k} style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--color-neutral-300)' }}>
            <strong style={{ fontWeight: 500, color: 'var(--color-text)' }}>{KIND_LABEL[k]}.</strong>{' '}
            {{
              fact: 'Cuentas y sumas de tus datos. Siempre ciertas.',
              pattern: 'Algo que se repite en tus datos. Es una asociación, no una causa.',
              prediction: 'Qué pasaría si sigues igual. Siempre dice su supuesto.',
              hypothesis: 'Una posible relación con poca evidencia todavía.',
            }[k]}
          </span>
        ))}
        <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
          Niveles de evidencia: {Object.values(EVIDENCE_LABEL).slice(0, 3).join(' · ')}. Nada de esto es consejo médico.
        </span>
      </aside>
    </div>
  );
}
