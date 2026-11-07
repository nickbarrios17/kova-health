'use client';
/**
 * A student, seen by their coach (docs/coach.md): their routines, created, edited and deleted with the
 * same editor as one's own, saved through kova.people (checked server-side against the link).
 */
import type { CoachRoutine } from '@kova/api-client';
import { draftFromRoutine, emptyDraft, isoDays, type RoutineDraft } from '@kova/domain';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { EmptyState, ErrorNotice } from '@/components/EmptyState';
import { RoutineEditor } from '@/components/RoutineEditor';
import { kova } from '@/lib/client';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';

const card = { padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 10 } as const;
const muted = { fontSize: 13, color: 'var(--color-neutral-400)' } as const;

function scheme(it: { target_sets: number; target_reps_min: number | null; target_reps_max: number | null }) {
  const reps = it.target_reps_min == null ? null
    : it.target_reps_max == null || it.target_reps_max === it.target_reps_min ? String(it.target_reps_min)
    : it.target_reps_min + '–' + it.target_reps_max;
  return it.target_sets + (reps ? '×' + reps : ' series');
}

export default function AlumnoPage() {
  const { personId } = useParams<{ personId: string }>();
  const { prefs } = useSession();
  const [editing, setEditing] = useState<RoutineDraft | null>(null);

  const q = useAsync(async () => {
    const c = kova();
    const links = await c.people.links();
    const link = links.find((l) => l.kind === 'coach' && l.role === 'viewer' && l.person_id === personId) ?? null;
    if (!link) return { link: null, routines: [] as CoachRoutine[], exercises: [] as Array<{ id: string; name: string }> };
    const [routines, own, catalog] = await Promise.all([c.people.routines(personId), c.people.exercises(personId), c.exercises.catalog()]);
    const exercises = [...catalog.filter((e) => e.owner_id == null), ...own]
      .map((e) => ({ id: e.id, name: e.short_name ?? e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { link, routines, exercises };
  }, [personId]);

  if (q.error) return <ErrorNotice message={q.error} onRetry={q.reload} />;
  if (q.loading && !q.data) return <span style={muted}>Cargando…</span>;
  const { link, routines, exercises } = q.data!;
  if (!link) {
    return <EmptyState icon="ph ph-user-circle-minus" title="No eres coach de esta persona">Puede que el vínculo se haya cortado. <Link href="/personas">Volver a Coach y amigos</Link></EmptyState>;
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/personas" className="btn btn-ghost" aria-label="Volver"><i className="ph ph-arrow-left" /></Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 500 }}>{link.person_name}</div>
          <div style={muted}>Tu alumno · {link.sessions_7d ? link.sessions_7d + (link.sessions_7d === 1 ? ' entrenamiento' : ' entrenamientos') + ' esta semana' : 'sin entrenar esta semana'}</div>
        </div>
        <Link className="btn btn-ghost" href={'/importar?para=' + link.person_id}><i className="ph ph-upload-simple" />Importar planilla</Link>
        <button className="btn btn-secondary" onClick={() => setEditing(emptyDraft())}><i className="ph ph-plus" />Nueva rutina</button>
      </div>

      {editing && (
        <RoutineEditor key={editing.id} initial={editing} exercises={exercises} units={prefs!.weight_unit} ownerId={link.person_id}
          onClose={(changed) => { setEditing(null); if (changed) q.reload(); }} />
      )}

      {routines.length === 0 ? (
        <EmptyState icon="ph ph-barbell" title={link.person_name + ' todavía no tiene rutinas'}>Arma la primera con «Nueva rutina»: le aparece en el celular y en el reloj.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {routines.map((r) => (
            <section key={r.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 500 }}>{r.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{isoDays(r.schedule_days)}</span>
              </div>
              {r.assigned_by == null && <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>Creada por {link.person_name}</span>}
              {r.routine_exercises.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--color-neutral-300)' }}>{it.exercise_name}</span>
                  <span style={{ color: 'var(--color-neutral-400)' }}>{scheme(it)}</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 13 }}
                onClick={() => setEditing(draftFromRoutine(r, Object.fromEntries(r.routine_exercises.map((it) => [it.exercise_id, it.exercise_name]))))}>
                <i className="ph ph-pencil-simple" />Editar
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
