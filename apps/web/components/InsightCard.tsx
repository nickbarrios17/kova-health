'use client';
import { EVIDENCE_LABEL, type Insight } from '@kova/domain';
import { useState } from 'react';
import { ConfidenceBadge } from './ui';

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: compact ? '14px 16px' : 20, borderRadius: compact ? 'var(--kova-radius-lg)' : 'var(--kova-radius-xl)', background: 'var(--color-surface)' }}>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <ConfidenceBadge kind={insight.kind} />
        <span style={{ fontSize: 12, color: 'var(--kova-text-3)' }}>
          {insight.kind !== 'fact' ? EVIDENCE_LABEL[insight.evidence] + ' · ' : ''}{insight.domains.map((d) => DOMAIN_LABEL[d] ?? d).join(', ')}
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.45, textWrap: 'pretty' }}>{insight.title}</span>
        {!compact && (
          <>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={() => setOpen(!open)} aria-expanded={open}>
              <i className={open ? 'ph ph-caret-up' : 'ph ph-caret-down'} />¿Por qué?
            </button>
            {open && (
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--kova-text-2)' }}>
                {insight.detail}
                <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--kova-text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  Datos: {Object.entries(insight.support).map(([k, v]) => `${k} ${v}`).join(' · ')}
                </span>
              </span>
            )}
            {onFeedback && (
              sent ? (
                <span style={{ fontSize: 12, color: 'var(--kova-text-2)', display: 'flex', gap: 5, alignItems: 'center' }}><i className="ph ph-check" />Gracias, lo tendremos en cuenta.</span>
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
