'use client';
import { EVIDENCE_LABEL, KIND_LABEL, type Insight } from '@kova/domain';
import { useState } from 'react';

const KIND_ICON: Record<Insight['kind'], string> = {
  fact: 'ph ph-check-circle',
  pattern: 'ph ph-chart-line',
  prediction: 'ph ph-trend-up',
  hypothesis: 'ph ph-question',
};
const DOMAIN_LABEL: Record<string, string> = {
  training: 'Entrenamiento', nutrition: 'Comida', sleep: 'Sueño', habits: 'Hábitos', body: 'Cuerpo', mood: 'Ánimo', activity: 'Actividad',
};

/**
 * One insight. Facts and hypotheses never look the same (Intelligence doc §04): the kind and the
 * evidence level are always shown, with icon + text, never colour alone.
 */
export function InsightCard({ insight, compact, onFeedback }: {
  insight: Insight;
  compact?: boolean;
  onFeedback?: (v: 'useful' | 'not_useful') => void;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<'useful' | 'not_useful' | null>(null);
  const tentative = insight.kind === 'hypothesis';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', border: tentative ? '1px dashed var(--color-neutral-700)' : '1px solid transparent', background: compact ? 'transparent' : 'var(--color-surface)' }}>
      <i className={KIND_ICON[insight.kind]} style={{ fontSize: 18, color: tentative ? 'var(--color-neutral-400)' : 'var(--color-accent-300)', marginTop: 1 }} aria-hidden />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
          {KIND_LABEL[insight.kind]}{insight.kind !== 'fact' ? ' · ' + EVIDENCE_LABEL[insight.evidence] : ''} · {insight.domains.map((d) => DOMAIN_LABEL[d] ?? d).join(', ')}
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.4, textWrap: 'pretty' }}>{insight.title}</span>
        {!compact && (
          <>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={() => setOpen(!open)} aria-expanded={open}>
              <i className={open ? 'ph ph-caret-up' : 'ph ph-caret-down'} />¿Por qué?
            </button>
            {open && (
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-300)' }}>
                {insight.detail}
                <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--color-neutral-400)', fontVariantNumeric: 'tabular-nums' }}>
                  Datos: {Object.entries(insight.support).map(([k, v]) => `${k} ${v}`).join(' · ')}
                </span>
              </span>
            )}
            {onFeedback && (
              sent ? (
                <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', display: 'flex', gap: 5, alignItems: 'center' }}><i className="ph ph-check" />Gracias, lo tendremos en cuenta.</span>
              ) : (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setSent('useful'); onFeedback('useful'); }}><i className="ph ph-thumbs-up" />Útil</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setSent('not_useful'); onFeedback('not_useful'); }}><i className="ph ph-thumbs-down" />No útil</button>
                </span>
              )
            )}
          </>
        )}
      </span>
    </div>
  );
}
