'use client';
/**
 * Novedades (docs/novedades.md): the days from @kova/domain NEWS this browser has not seen, shown once
 * on open after an update; the sidebar's «Novedades» shows them all. Same list as the phone
 * (apps/mobile/src/NewsSheet.tsx). What was seen is a per-browser convenience in localStorage.
 */
import { NEWS, newsDate, newsFor, newsId, unseenNews, type NewsDay } from '@kova/domain';
import { useEffect, useState } from 'react';

const SEEN_KEY = 'kova:news-seen';
/** The test web (Vercel preview) and local dev also show what is not in the official app yet. */
export const newsDays = () => newsFor(process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development', NEWS);

export function NewsDialog({ days, onClose, title = 'Novedades' }: { days: NewsDay[]; onClose: () => void; title?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(520px, 100%)', maxHeight: '85vh', overflowY: 'auto', gap: 16 }}>
        <span className="dialog-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ph-fill ph-sparkle" style={{ color: 'var(--color-accent)', fontSize: 22 }} />{title}
        </span>
        {days.map((d) => (
          <section key={d.date} style={{ display: 'grid', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-neutral-400)' }}>{newsDate(d.date)}</span>
            {d.items.map((i) => (
              <div key={i.title} style={{ display: 'grid', gap: 2, paddingLeft: 12, borderLeft: '2px solid var(--color-accent)' }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{i.title}</span>
                {i.body && <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-300)' }}>{i.body}</span>}
              </div>
            ))}
          </section>
        ))}
        <div className="dialog-actions"><button className="btn btn-primary" onClick={onClose}>Entendido</button></div>
      </div>
    </div>
  );
}

/** Shows the unseen days once, when `ready` (signed in and onboarded). */
export function NewsOnOpen({ ready }: { ready: boolean }) {
  const [days, setDays] = useState<NewsDay[]>([]);
  useEffect(() => {
    if (!ready) return;
    let seen: string[] | null = null;
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      seen = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      seen = null;
    }
    setDays(unseenNews(newsDays(), seen, new Date().toISOString().slice(0, 10)));
  }, [ready]);
  if (days.length === 0) return null;
  const close = () => {
    setDays([]);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(newsDays().map(newsId))); } catch { /* per-browser convenience only */ }
  };
  return <NewsDialog days={days} onClose={close} title="¿Qué hay de nuevo?" />;
}
