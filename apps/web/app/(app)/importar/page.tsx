'use client';
/**
 * Routine import: Excel (.xlsx), CSV or JSON → column mapping (auto-detected, editable) → editable
 * preview with exercise matching → save_routine per routine. Nothing is saved until "Importar".
 */
import {
  detectColumns, FIELD_LABEL, isoDays, jsonToRoutines, matchExercise, newId, normalize, parseCsv, planReady, sheetToRoutines,
  slugify, type CatalogExercise, type DraftRoutine, type ImportField, type Sheet, type SheetPlan,
} from '@kova/domain';
import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { kova } from '@/lib/client';
import { useAsync } from '@/lib/useAsync';

const FIELDS: ImportField[] = ['exercise', 'sets', 'reps', 'setsReps', 'rest', 'weight', 'routine', 'days', 'notes'];
const WEEK: Array<[number, string]> = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];
const CREATE = '__create__';

const TEMPLATE_CSV = [
  'Rutina;Días;Ejercicio;Series;Reps;Descanso;Peso (kg);Notas',
  'Fuerza A;Lun, Jue;Sentadilla con barra;4;6;90;80;',
  'Fuerza A;Lun, Jue;Press de banca;4;8-10;90;60;',
  'Fuerza B;Mar, Vie;Peso muerto;3;5;2 min;100;Agarre mixto',
].join('\r\n');
const TEMPLATE_JSON = JSON.stringify({
  routines: [{ name: 'Fuerza A', days: ['Lun', 'Jue'], exercises: [{ exercise: 'Sentadilla con barra', sets: 4, reps: '6', rest_s: 90, weight_kg: 80 }] }],
}, null, 2);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Item extends DraftRoutine { key: string; include: boolean }

export default function ImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [jsonDraft, setJsonDraft] = useState<DraftRoutine[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Item>>>({});
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const catalog = useAsync(async () => {
    const c = kova();
    const all: CatalogExercise[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = (await c.exercises.search({ limit: 100, offset })) as Array<{ id: string; name: string }>;
      all.push(...page.map((e) => ({ id: e.id, name: e.name })));
      if (page.length < 100) break;
    }
    return all;
  }, []);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null); setDone(null); setEdits({}); setChoice({}); setJsonDraft(null); setSheets([]); setPlans([]);
    setFileName(f.name);
    try {
      const ext = f.name.toLowerCase().split('.').pop();
      if (ext === 'json') {
        setJsonDraft(jsonToRoutines(await f.text()));
        return;
      }
      let read: Sheet[];
      if (ext === 'xlsx') {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        read = (await readXlsxFile(f)).map((s) => ({ name: s.sheet, rows: s.data as Sheet['rows'] }));
      } else if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
        read = [{ name: f.name.replace(/\.[^.]+$/, ''), rows: parseCsv(await f.text()) }];
      } else {
        throw new Error(ext === 'xls' ? 'El formato .xls (Excel antiguo) no se puede leer: guárdalo como .xlsx o .csv.' : 'Formato no soportado. Usa .xlsx, .csv o .json.');
      }
      read = read.filter((s) => s.rows.some((r) => r.some((c) => c != null && String(c).trim() !== '')));
      if (!read.length) throw new Error('El archivo está vacío.');
      setSheets(read);
      setPlans(read.map(detectColumns));
    } catch (err) {
      setFileName(null);
      setError(err instanceof Error ? err.message : 'No pudimos leer el archivo.');
    }
  };

  const drafts: Item[] = useMemo(() => {
    const base = jsonDraft ?? sheets.flatMap((s, i) => (plans[i] && planReady(plans[i]!) ? sheetToRoutines(s, plans[i]!, sheets.length > 1 ? s.name : 'Rutina importada') : []));
    return base.map((r, i) => {
      const key = r.source + ':' + i;
      return { ...r, key, include: true, ...edits[key] };
    });
  }, [jsonDraft, sheets, plans, edits]);

  const exerciseFor = (name: string) => {
    const k = normalize(name);
    if (choice[k]) return choice[k]!;
    return matchExercise(name, catalog.data ?? [])?.id ?? CREATE;
  };

  const setPlan = (i: number, patch: Partial<SheetPlan>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setMap = (i: number, f: ImportField, col: string) =>
    setPlans((ps) => ps.map((p, j) => {
      if (j !== i) return p;
      const mapping = { ...p.mapping };
      if (col === '') delete mapping[f]; else mapping[f] = Number(col);
      return { ...p, mapping };
    }));
  const edit = (key: string, patch: Partial<Item>) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  const chosen = drafts.filter((r) => r.include);
  const unmappedSheets = sheets.filter((_, i) => plans[i] && !planReady(plans[i]!));
  const newNames = [...new Map(chosen.flatMap((r) => r.items).filter((it) => exerciseFor(it.name) === CREATE).map((it) => [normalize(it.name), it.name])).values()];

  const save = async () => {
    setError(null);
    const tooLong = chosen.find((r) => r.items.length > 50);
    if (tooLong) return setError('«' + tooLong.name + '» tiene más de 50 ejercicios; divídela en dos rutinas.');
    if (chosen.some((r) => !r.name.trim())) return setError('Ponle nombre a cada rutina.');
    setBusy(true);
    try {
      const c = kova();
      const created = new Map<string, string>();
      for (const name of newNames) {
        const id = newId();
        await c.exercises.create({ id, name: name.slice(0, 120), slug: (slugify(name) + '-' + id.slice(0, 6)).slice(0, 80) });
        created.set(normalize(name), id);
      }
      for (const r of chosen) {
        await c.routines.save({
          id: newId(),
          name: r.name.trim().slice(0, 80),
          schedule_days: r.days,
          items: r.items.map((it) => {
            const ex = exerciseFor(it.name);
            return {
              exercise_id: ex === CREATE ? created.get(normalize(it.name))! : ex,
              target_sets: it.sets,
              target_reps_min: it.repsMin,
              target_reps_max: it.repsMax,
              target_rest_s: it.restS,
              target_load_kg: it.loadKg,
              notes: it.notes,
            };
          }),
        });
      }
      setDone(chosen.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  if (done != null) {
    return (
      <div className="card" style={{ maxWidth: 560, gap: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 500 }}><i className="ph ph-check-circle" style={{ color: 'var(--kova-ok)' }} /> {done === 1 ? '1 rutina importada' : done + ' rutinas importadas'}</span>
        <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Ya están en Entrenamiento, en el teléfono y en el reloj.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-primary" href="/entrenamiento">Ver rutinas</Link>
          <button className="btn btn-ghost" onClick={() => { setDone(null); setFileName(null); setSheets([]); setPlans([]); setJsonDraft(null); }}>Importar otro archivo</button>
        </div>
      </div>
    );
  }

  return (
    <div data-screen-label="Importar rutinas" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div className="card" style={{ gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Elige un archivo</span>
        <span style={{ fontSize: 13, color: 'var(--color-neutral-400)', lineHeight: 1.5 }}>
          Excel (.xlsx), CSV o JSON. No hace falta un formato exacto: Kova Health reconoce columnas como «Ejercicio», «Series», «Reps», «4x8», «Descanso» o «Peso»,
          y si no las encuentra te deja elegirlas. Cada hoja, o cada fila título como «Día A», es una rutina.
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <i className="ph ph-upload-simple" />{fileName ? 'Elegir otro archivo' : 'Elegir archivo'}
            <input type="file" accept=".xlsx,.csv,.tsv,.txt,.json" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-ghost" onClick={() => download('plantilla-rutinas-kova.csv', TEMPLATE_CSV, 'text/csv;charset=utf-8')}><i className="ph ph-file-csv" />Plantilla para Excel</button>
          <button className="btn btn-ghost" onClick={() => download('rutinas-kova.json', TEMPLATE_JSON, 'application/json')}><i className="ph ph-brackets-curly" />Ejemplo JSON</button>
          {fileName ? <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>{fileName}</span> : null}
        </div>
      </div>

      {error && (
        <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)', fontSize: 16, marginTop: 1 }} /><span>{error}</span></div>
      )}

      {sheets.map((s, i) => {
        const p = plans[i]!;
        const headers = (s.rows[p.headerRow] ?? []).map((h, col) => String(h ?? '').trim() || 'Columna ' + (col + 1));
        return (
          <div key={s.name + i} className="card" style={{ gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Columnas · {s.name}</span>
              <span style={{ fontSize: 12, color: planReady(p) ? 'var(--kova-ok)' : 'var(--kova-warn)' }}>
                {planReady(p) ? 'Listo para leer' : 'Elige al menos la columna del ejercicio'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
              <div className="field">
                <label htmlFor={'hr-' + i}>Fila de títulos</label>
                <select id={'hr-' + i} className="input" value={p.headerRow} onChange={(e) => setPlan(i, { headerRow: Number(e.target.value) })}>
                  {s.rows.slice(0, 15).map((_, r) => <option key={r} value={r}>Fila {r + 1}</option>)}
                </select>
              </div>
              {FIELDS.map((f) => (
                <div key={f} className="field">
                  <label htmlFor={f + '-' + i}>{FIELD_LABEL[f]}{f === 'exercise' ? ' *' : ''}</label>
                  <select id={f + '-' + i} className="input" value={p.mapping[f] ?? ''} onChange={(e) => setMap(i, f, e.target.value)}>
                    <option value="">— No está —</option>
                    {headers.map((h, col) => <option key={col} value={col}>{h}</option>)}
                  </select>
                </div>
              ))}
              {p.mapping.weight !== undefined && (
                <div className="field">
                  <label htmlFor={'u-' + i}>Unidad del peso</label>
                  <select id={'u-' + i} className="input" value={p.weightUnit} onChange={(e) => setPlan(i, { weightUnit: e.target.value as 'kg' | 'lb' })}>
                    <option value="kg">kg</option><option value="lb">lb</option>
                  </select>
                </div>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ fontSize: 12, minWidth: 480 }}>
                <tbody>
                  {s.rows.slice(p.headerRow, p.headerRow + 5).map((row, r) => (
                    <tr key={r} style={{ fontWeight: r === 0 ? 500 : 400 }}>
                      {row.slice(0, 10).map((cell, col) => <td key={col}>{cell instanceof Date ? cell.toLocaleDateString() : String(cell ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {fileName && drafts.length === 0 && !error && unmappedSheets.length === 0 ? (
        <EmptyState icon="ph ph-table" title="No encontramos ejercicios">Revisa qué columna tiene el nombre del ejercicio y la fila de títulos.</EmptyState>
      ) : null}

      {drafts.length > 0 && (
        <>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Vista previa · {chosen.length} de {drafts.length} rutinas</span>
          {drafts.map((r) => (
            <div key={r.key} className="card" style={{ gap: 10, opacity: r.include ? 1 : 0.55 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <input type="checkbox" checked={r.include} onChange={(e) => edit(r.key, { include: e.target.checked })} aria-label={'Importar ' + r.name} />
                <input className="input" style={{ flex: '1 1 200px', fontWeight: 500 }} value={r.name} maxLength={80} aria-label="Nombre de la rutina"
                  onChange={(e) => edit(r.key, { name: e.target.value })} />
                <div role="group" aria-label="Días" style={{ display: 'flex', gap: 4 }}>
                  {WEEK.map(([d, l]) => {
                    const on = r.days.includes(d);
                    return (
                      <button key={d} type="button" aria-pressed={on} onClick={() => edit(r.key, { days: on ? r.days.filter((x) => x !== d) : [...r.days, d].sort() })}
                        style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid ' + (on ? 'var(--color-accent)' : 'var(--color-divider)'), background: on ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent', color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)', fontSize: 12, cursor: 'pointer' }}>{l}</button>
                    );
                  })}
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{isoDays(r.days)}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: 13, minWidth: 620 }}>
                  <thead><tr><th>Ejercicio en el archivo</th><th>En Kova Health</th><th>Series × reps</th><th>Descanso</th><th>Peso</th></tr></thead>
                  <tbody>
                    {r.items.map((it) => {
                      const ex = exerciseFor(it.name);
                      return (
                        <tr key={it.row + it.name}>
                          <td>
                            {it.name}
                            {it.issues.map((m) => <div key={m} style={{ fontSize: 11, color: 'var(--kova-warn)' }}>Fila {it.row}: {m}</div>)}
                          </td>
                          <td>
                            <select className="input" style={{ minWidth: 190 }} value={ex} aria-label={'Ejercicio de Kova Health para ' + it.name}
                              onChange={(e) => setChoice((c) => ({ ...c, [normalize(it.name)]: e.target.value }))}>
                              <option value={CREATE}>Crear «{it.name.slice(0, 40)}»</option>
                              {(catalog.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                          </td>
                          <td>{it.sets} × {it.repsMin == null ? '—' : it.repsMin === it.repsMax ? it.repsMin : it.repsMin + '–' + it.repsMax}</td>
                          <td>{it.restS == null ? '—' : it.restS >= 60 && it.restS % 60 === 0 ? it.restS / 60 + ' min' : it.restS + ' s'}</td>
                          <td>{it.loadKg == null ? '—' : String(it.loadKg).replace('.', ',') + ' kg'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={busy || chosen.length === 0 || catalog.loading} onClick={save}>
              {busy ? <><i className="ph ph-circle-notch kova-spin" />Importando…</> : <><i className="ph ph-download-simple" />Importar {chosen.length === 1 ? '1 rutina' : chosen.length + ' rutinas'}</>}
            </button>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
              {newNames.length ? 'Se crearán ' + newNames.length + (newNames.length === 1 ? ' ejercicio nuevo' : ' ejercicios nuevos') + ' en tu cuenta. ' : ''}
              Nada se guarda hasta que pulses Importar.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
