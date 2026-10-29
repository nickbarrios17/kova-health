'use client';
/**
 * Create or edit a routine by hand: name, days, exercises (catalog search or a new own exercise),
 * sets, reps (8 or 8-12), rest and weight. Saves through save_routine with the last seen version.
 */
import {
  draftToSaveInput, fromDisplayWeight, moveItem, newId, newItem, normalize, parseRepsInput, repsLabel, slugify, toDisplayWeight, toggleDay,
  validateDraft, KovaError, type EditorItem, type RoutineDraft, type WeightUnit,
} from '@kova/domain';
import { useEffect, useMemo, useState } from 'react';
import { kova } from '@/lib/client';

const WEEK: Array<[number, string, string]> = [
  [1, 'L', 'Lunes'], [2, 'M', 'Martes'], [3, 'X', 'Miércoles'], [4, 'J', 'Jueves'], [5, 'V', 'Viernes'], [6, 'S', 'Sábado'], [7, 'D', 'Domingo'],
];

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(v) ? null : v;
};

function ItemRow({ item, index, count, units, onChange, onMove, onRemove }: {
  item: EditorItem; index: number; count: number; units: WeightUnit;
  onChange: (patch: Partial<EditorItem>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const [reps, setReps] = useState(repsLabel(item.repsMin, item.repsMax));
  const [load, setLoad] = useState(item.loadKg == null ? '' : String(Math.round(toDisplayWeight(item.loadKg, units) * 100) / 100).replace('.', ','));
  const [repsBad, setRepsBad] = useState(false);
  const label = (index + 1) + '. ' + item.exerciseName;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{label}</span>
        <button type="button" className="btn btn-ghost btn-icon" aria-label={'Subir ' + item.exerciseName} disabled={index === 0} onClick={() => onMove(-1)}><i className="ph ph-arrow-up" /></button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label={'Bajar ' + item.exerciseName} disabled={index === count - 1} onClick={() => onMove(1)}><i className="ph ph-arrow-down" /></button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label={'Quitar ' + item.exerciseName} onClick={onRemove}><i className="ph ph-trash" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        <div className="field">
          <label htmlFor={item.key + '-s'}>Series</label>
          <input id={item.key + '-s'} className="input" inputMode="numeric" defaultValue={item.sets}
            onChange={(e) => onChange({ sets: Math.round(num(e.target.value) ?? 0) })} />
        </div>
        <div className="field">
          <label htmlFor={item.key + '-r'}>Reps</label>
          <input id={item.key + '-r'} className="input" placeholder="8-12" value={reps} aria-invalid={repsBad}
            onChange={(e) => {
              setReps(e.target.value);
              const r = parseRepsInput(e.target.value);
              setRepsBad(r === 'invalid');
              if (r !== 'invalid') onChange({ repsMin: r.min, repsMax: r.max });
            }} />
        </div>
        <div className="field">
          <label htmlFor={item.key + '-d'}>Descanso (s)</label>
          <input id={item.key + '-d'} className="input" inputMode="numeric" placeholder="90" defaultValue={item.restS ?? ''}
            onChange={(e) => { const v = num(e.target.value); onChange({ restS: v == null ? null : Math.round(v) }); }} />
        </div>
        <div className="field">
          <label htmlFor={item.key + '-p'}>Peso ({units})</label>
          <input id={item.key + '-p'} className="input" inputMode="decimal" placeholder="—" value={load}
            onChange={(e) => { setLoad(e.target.value); const v = num(e.target.value); onChange({ loadKg: v == null ? null : fromDisplayWeight(v, units) }); }} />
        </div>
      </div>
      {repsBad ? <span style={{ fontSize: 12, color: 'var(--kova-warn)' }}>Reps: un número (8) o un rango (8-12).</span> : null}
    </div>
  );
}

export function RoutineEditor({ initial, exercises, units, onClose, ownerId }: {
  initial: RoutineDraft;
  exercises: Array<{ id: string; name: string }>;
  units: WeightUnit;
  onClose: (changed: boolean) => void;
  /** As a coach: the student whose routine this is (saved through kova.people, checked against the link). */
  ownerId?: string;
}) {
  const [d, setD] = useState<RoutineDraft>(initial);
  const [query, setQuery] = useState('');
  const [pendingNew, setPendingNew] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = initial.version == null;
  // Messages refer to the draft as it was saved; any edit makes them stale.
  useEffect(() => setErrors([]), [d]);

  const matches = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    return exercises.filter((e) => normalize(e.name).includes(q)).slice(0, 8);
  }, [query, exercises]);
  const exact = matches.some((e) => normalize(e.name) === normalize(query));

  const add = (id: string, name: string) => {
    setD((x) => ({ ...x, items: [...x.items, newItem(id, name)] }));
    setQuery('');
  };
  const addNew = () => {
    const name = query.trim().slice(0, 120);
    if (!name) return;
    const id = newId();
    setPendingNew((p) => ({ ...p, [id]: name }));
    add(id, name);
  };
  const patch = (key: string, p: Partial<EditorItem>) => setD((x) => ({ ...x, items: x.items.map((it) => (it.key === key ? { ...it, ...p } : it)) }));

  const save = async () => {
    const errs = validateDraft(d);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const c = kova();
      for (const it of d.items) {
        const name = pendingNew[it.exerciseId];
        const slug = (slugify(name ?? '') + '-' + it.exerciseId.slice(0, 6)).slice(0, 80);
        if (name) await (ownerId ? c.people.createExercise(ownerId, { id: it.exerciseId, name, slug }) : c.exercises.create({ id: it.exerciseId, name, slug }));
      }
      await (ownerId ? c.people.saveRoutine(ownerId, draftToSaveInput(d)) : c.routines.save(draftToSaveInput(d)));
      onClose(true);
    } catch (e) {
      const code = e instanceof KovaError ? e.code : '';
      setErrors([code === 'VERSION_CONFLICT'
        ? 'Esta rutina cambió en otro dispositivo mientras la editabas. Cierra el editor y vuelve a abrirla.'
        : e instanceof KovaError ? e.message : 'No se pudo guardar. Revisa tu conexión.']);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await (ownerId ? kova().people.deleteRoutine(ownerId, d.id) : kova().routines.remove(d.id));
      onClose(true);
    } catch (e) {
      setErrors([e instanceof KovaError ? e.message : 'No se pudo borrar.']);
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ gap: 14 }} data-screen-label="Editor de rutina">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 17, fontWeight: 500 }}>{isNew ? 'Nueva rutina' : 'Editar rutina'}</span>
        <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Cancelar</button>
      </div>

      <div className="field">
        <label htmlFor="re-name">Nombre</label>
        <input id="re-name" className="input" maxLength={80} placeholder="Ej.: Fuerza A" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>

      <div role="group" aria-label="Días" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>Días (opcional)</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {WEEK.map(([n, l, full]) => {
            const on = d.days.includes(n);
            return (
              <button key={n} type="button" aria-pressed={on} aria-label={full} onClick={() => setD({ ...d, days: toggleDay(d.days, n) })}
                style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid ' + (on ? 'var(--color-accent)' : 'var(--color-divider)'), background: on ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent', color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)', fontSize: 13, cursor: 'pointer' }}>{l}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {d.items.map((it, i) => (
          <ItemRow key={it.key} item={it} index={i} count={d.items.length} units={units}
            onChange={(p) => patch(it.key, p)}
            onMove={(dir) => setD((x) => ({ ...x, items: moveItem(x.items, i, dir) }))}
            onRemove={() => setD((x) => ({ ...x, items: x.items.filter((y) => y.key !== it.key) }))} />
        ))}
        {d.items.length === 0 ? <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Todavía no hay ejercicios. Búscalos abajo.</span> : null}
      </div>

      <div className="field" style={{ position: 'relative' }}>
        <label htmlFor="re-search">Añadir ejercicio</label>
        <input id="re-search" className="input" placeholder="Busca o escribe uno nuevo: sentadilla, hip thrust…" value={query} autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0] && exact) add(matches[0].id, matches[0].name); else addNew(); } }} />
        {query.trim() ? (
          <div role="listbox" aria-label="Ejercicios" style={{ display: 'flex', flexDirection: 'column', marginTop: 4, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {matches.map((e) => (
              <button key={e.id} type="button" role="option" aria-selected={false} className="kova-nav" onClick={() => add(e.id, e.name)}
                style={{ textAlign: 'left', padding: '9px 12px', border: 0, background: 'transparent', color: 'var(--color-text)', fontSize: 14, cursor: 'pointer' }}>{e.name}</button>
            ))}
            {!exact ? (
              <button type="button" role="option" aria-selected={false} className="kova-nav" onClick={addNew}
                style={{ textAlign: 'left', padding: '9px 12px', border: 0, background: 'transparent', color: 'var(--color-accent-300)', fontSize: 14, cursor: 'pointer' }}>
                <i className="ph ph-plus" /> Crear «{query.trim().slice(0, 60)}»
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {errors.length ? (
        <div className="kova-error" role="alert">
          <i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)', fontSize: 16, marginTop: 1 }} />
          <span>{errors.map((m) => <span key={m} style={{ display: 'block' }}>{m}</span>)}</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? <><i className="ph ph-circle-notch kova-spin" />Guardando…</> : <><i className="ph ph-check" />Guardar rutina</>}
        </button>
        {!isNew ? (
          confirmDelete ? (
            <>
              <span style={{ fontSize: 13 }}>¿Borrar esta rutina? Tu historial no se pierde.</span>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={remove} style={{ color: 'var(--kova-crit)' }}>Sí, borrar</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>No</button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}><i className="ph ph-trash" />Borrar rutina</button>
          )
        ) : null}
      </div>
    </div>
  );
}
