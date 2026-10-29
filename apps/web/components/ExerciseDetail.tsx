'use client';
/**
 * "Cómo se hace" dialog: images (start and end position, alternating), steps, coaching cues, common
 * errors, breathing and muscles. Same rules as the phone (apps/mobile/src/screens/ExerciseDetail.tsx):
 * an exercise of the user's own borrows the content of the catalog entry it matches by name.
 */
import { EQUIPMENT_LABEL, exerciseAnimation, exerciseImages, findCatalogMatch, hasHowTo, MUSCLE_LABEL, type ExerciseInstructions } from '@kova/domain';
import { useEffect, useState } from 'react';
import { kova } from '@/lib/client';
import { useAsync } from '@/lib/useAsync';

interface ExerciseFull {
  id: string;
  name: string;
  instructions: ExerciseInstructions;
  media: unknown;
  exercise_muscles: Array<{ muscle_code: string; role: 'primary' | 'secondary' }>;
  exercise_equipment: Array<{ equipment_code: string }>;
}

function Frames({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (urls.length < 2) return;
    const iv = setInterval(() => setI((x) => (x + 1) % urls.length), 1100);
    return () => clearInterval(iv);
  }, [urls.length]);
  return (
    <div className="kova-frames">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {urls.map((u, n) => <img key={u} src={u} alt={n === 0 ? 'Posición inicial' : 'Posición final'} style={{ opacity: n === i ? 1 : 0 }} />)}
    </div>
  );
}

/** Loads Kova Health's 3D mannequin (public/mannequin.js) once; it registers <gym-mannequin>. */
function useMannequinScript() {
  useEffect(() => {
    if (document.querySelector('script[data-kova-mannequin]')) return;
    const s = document.createElement('script');
    s.src = '/mannequin.js';
    s.dataset.kovaMannequin = '';
    document.head.appendChild(s);
  }, []);
}

const h = { fontSize: 15, fontWeight: 500, marginTop: 4 } as const;
const muted = { fontSize: 13, color: 'var(--color-neutral-300)' } as const;

export function ExerciseDetail({ exerciseId, name, catalog, onClose }: {
  exerciseId: string;
  name: string;
  catalog: Array<{ id: string; name: string; owner_id?: string | null }>;
  onClose: () => void;
}) {
  const q = useAsync(async () => {
    const c = kova();
    const own = (await c.exercises.get(exerciseId)) as ExerciseFull;
    if (hasHowTo(own.instructions, own.media)) return { ex: own, borrowed: false };
    const match = findCatalogMatch(own.name, catalog.filter((e) => e.owner_id == null && e.id !== own.id));
    return match ? { ex: (await c.exercises.get(match.id)) as ExerciseFull, borrowed: true } : { ex: own, borrowed: false };
  }, [exerciseId]);

  useMannequinScript();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ex = q.data?.ex;
  const ins = ex?.instructions ?? {};
  const anim = ex ? exerciseAnimation(ex.media) : null;
  const urls = ex ? exerciseImages(ex.media, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') : [];
  const label = (role: string) => ex?.exercise_muscles.filter((m) => m.role === role).map((m) => MUSCLE_LABEL[m.muscle_code] ?? m.muscle_code) ?? [];

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={'Cómo se hace: ' + name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(560px, 100%)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="dialog-title" style={{ flex: 1 }}>{name}</span>
          <button className="btn btn-icon btn-secondary" aria-label="Cerrar" style={{ border: 0 }} onClick={onClose}><i className="ph ph-x" /></button>
        </div>
        {q.loading && !q.data ? <span style={muted}>Cargando…</span> : q.error ? (
          <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{q.error}</span></div>
        ) : ex ? (
          <>
            {anim && (
              <div style={{ display: 'grid', gap: 4 }}>
                <gym-mannequin slug={anim.slug} muscle={anim.muscle} equipment={anim.equipment} category={anim.category} layer="muscles" view="34"
                  style={{ display: 'block', height: 280, borderRadius: 'var(--radius-lg)', background: '#0f1019' }} />
                <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>Arrastra para girar el modelo. Los músculos que trabajan se iluminan.</span>
              </div>
            )}
            {urls.length > 0 && !anim && <Frames urls={urls} />}
            {q.data?.borrowed && <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>Instrucciones de «{ex.name}», el ejercicio del catálogo más parecido.</span>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {label('primary').map((m) => <span key={'p' + m} className="kova-chip strong">{m}</span>)}
              {label('secondary').map((m) => <span key={'s' + m} className="kova-chip">{m}</span>)}
              {ex.exercise_equipment.map((e) => <span key={e.equipment_code} className="kova-chip">{EQUIPMENT_LABEL[e.equipment_code] ?? e.equipment_code}</span>)}
            </div>
            {!hasHowTo(ins, ex.media) && <span style={muted}>Todavía no tenemos instrucciones para este ejercicio. Si lo renombras como en el catálogo (por ejemplo «Press de banca»), se muestran solas.</span>}
            {ins.steps?.length ? (<><span style={h}>Cómo hacerlo</span><ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, ...muted }}>{ins.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>) : null}
            {ins.cues?.length ? (<><span style={h}>Claves</span>{ins.cues.map((c) => <div key={c.title} style={{ display: 'grid', gap: 2 }}><span style={{ fontSize: 14, fontWeight: 500 }}>{c.title}</span><span style={muted}>{c.body}</span></div>)}</>) : null}
            {ins.errors?.length ? (<><span style={h}>Errores comunes</span>{ins.errors.map((e) => <div key={e.title} style={{ display: 'grid', gap: 2 }}><span style={{ fontSize: 14, fontWeight: 500, color: 'var(--kova-warn, #EFC173)' }}>{e.title}</span><span style={muted}>{e.fix}</span></div>)}</>) : null}
            {ins.breath?.length || ins.tempo ? (<><span style={h}>Respiración y ritmo</span>{ins.tempo && <span style={muted}>Ritmo: {ins.tempo}</span>}{ins.breath?.map((b) => <span key={b} style={muted}>• {b}</span>)}</>) : null}
            {urls.length > 0 && !anim && <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>Imágenes: free-exercise-db (dominio público).</span>}
          </>
        ) : null}
      </div>
    </div>
  );
}
