/** Create or edit a routine by hand (same model and rules as the web editor, @kova/domain routineEditor). */
import {
  draftToSaveInput, fromDisplayWeight, moveItem, newId, newItem, normalize, parseRepsInput, repsLabel, slugify, toDisplayWeight, toggleDay,
  validateDraft, KovaError, type EditorItem, type RoutineDraft, type WeightUnit,
} from '@kova/domain';
import { ArrowDown, ArrowUp, Check, Plus, Trash } from 'phosphor-react-native';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useBack } from '../back';
import { kova } from '../client';
import { c, r } from '../theme';
import { Button, Card, Confirm, ErrorNote, Field, Row, T } from '../ui';
import { useReportTarget } from '../report';

const WEEK: Array<[number, string, string]> = [
  [1, 'L', 'Lunes'], [2, 'M', 'Martes'], [3, 'X', 'Miércoles'], [4, 'J', 'Jueves'], [5, 'V', 'Viernes'], [6, 'S', 'Sábado'], [7, 'D', 'Domingo'],
];

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(v) ? null : v;
};

function IconButton({ icon: Icon, label, onPress, disabled }: { icon: typeof Trash; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
      <Icon size={18} color={c.n300} />
    </Pressable>
  );
}

function ItemRow({ item, index, count, units, onChange, onMove, onRemove }: {
  item: EditorItem; index: number; count: number; units: WeightUnit;
  onChange: (patch: Partial<EditorItem>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const [sets, setSets] = useState(String(item.sets));
  const [reps, setReps] = useState(repsLabel(item.repsMin, item.repsMax));
  const [rest, setRest] = useState(item.restS == null ? '' : String(item.restS));
  const [load, setLoad] = useState(item.loadKg == null ? '' : String(Math.round(toDisplayWeight(item.loadKg, units) * 100) / 100).replace('.', ','));
  const [repsBad, setRepsBad] = useState(false);
  return (
    <View style={{ padding: 12, borderRadius: r.md, backgroundColor: c.bg, gap: 8 }}>
      <Row>
        <T size={14} w="medium" style={{ flex: 1 }}>{index + 1}. {item.exerciseName}</T>
        <IconButton icon={ArrowUp} label={'Subir ' + item.exerciseName} disabled={index === 0} onPress={() => onMove(-1)} />
        <IconButton icon={ArrowDown} label={'Bajar ' + item.exerciseName} disabled={index === count - 1} onPress={() => onMove(1)} />
        <IconButton icon={Trash} label={'Quitar ' + item.exerciseName} onPress={onRemove} />
      </Row>
      <Row style={{ gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field label="Series" value={sets} keyboardType="number-pad" maxLength={2}
            onChangeText={(v) => { setSets(v); onChange({ sets: Math.round(num(v) ?? 0) }); }} />
        </View>
        <View style={{ flex: 1.2 }}>
          <Field label="Reps" value={reps} placeholder="8-12" maxLength={7}
            onChangeText={(v) => {
              setReps(v);
              const p = parseRepsInput(v);
              setRepsBad(p === 'invalid');
              if (p !== 'invalid') onChange({ repsMin: p.min, repsMax: p.max });
            }} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Desc. (s)" value={rest} placeholder="90" keyboardType="number-pad" maxLength={4}
            onChangeText={(v) => { setRest(v); const n = num(v); onChange({ restS: n == null ? null : Math.round(n) }); }} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={'Peso (' + units + ')'} value={load} placeholder="—" keyboardType="decimal-pad" maxLength={6}
            onChangeText={(v) => { setLoad(v); const n = num(v); onChange({ loadKg: n == null ? null : fromDisplayWeight(n, units) }); }} />
        </View>
      </Row>
      {repsBad ? <T size={12} color={c.warn}>Reps: un número (8) o un rango (8-12).</T> : null}
    </View>
  );
}

export function RoutineEditor({ initial, exercises, units, onClose, ownerId, title }: {
  initial: RoutineDraft;
  exercises: Array<{ id: string; name: string }>;
  units: WeightUnit;
  onClose: (changed: boolean) => void;
  /** As a coach: the student whose routine this is (saved through kova.people, checked against the link). */
  ownerId?: string;
  title?: string;
}) {
  const [d, setD] = useState<RoutineDraft>(initial);
  const [query, setQuery] = useState('');
  const [pendingNew, setPendingNew] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = initial.version == null;
  useReportTarget('routine');
  useBack(true, () => onClose(false));
  // Messages refer to the draft as it was saved; any edit makes them stale.
  useEffect(() => setErrors([]), [d]);

  const matches = useMemo(() => {
    const q = normalize(query);
    return q ? exercises.filter((e) => normalize(e.name).includes(q)).slice(0, 6) : [];
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
    if (errs.length) return setErrors(errs);
    setBusy(true);
    try {
      for (const it of d.items) {
        const name = pendingNew[it.exerciseId];
        const slug = (slugify(name ?? '') + '-' + it.exerciseId.slice(0, 6)).slice(0, 80);
        if (name) await (ownerId ? kova.people.createExercise(ownerId, { id: it.exerciseId, name, slug }) : kova.exercises.create({ id: it.exerciseId, name, slug }));
      }
      await (ownerId ? kova.people.saveRoutine(ownerId, draftToSaveInput(d)) : kova.routines.save(draftToSaveInput(d)));
      onClose(true);
    } catch (e) {
      const code = e instanceof KovaError ? e.code : '';
      setErrors([code === 'VERSION_CONFLICT'
        ? 'Esta rutina cambió en otro dispositivo mientras la editabas. Cancela y vuelve a abrirla.'
        : e instanceof KovaError ? e.message : 'No se pudo guardar. Revisa tu conexión.']);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    setBusy(true);
    try {
      await (ownerId ? kova.people.deleteRoutine(ownerId, d.id) : kova.routines.remove(d.id));
      onClose(true);
    } catch (e) {
      setErrors([e instanceof KovaError ? e.message : 'No se pudo borrar.']);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={22} w="medium" style={{ flex: 1 }}>{title ?? (isNew ? 'Nueva rutina' : 'Editar rutina')}</T>
          <Button variant="ghost" label="Cancelar" onPress={() => onClose(false)} />
        </Row>

        <Field label="Nombre" value={d.name} placeholder="Ej.: Fuerza A" maxLength={80} onChangeText={(v) => setD({ ...d, name: v })} />

        <View style={{ gap: 6 }}>
          <T size={12} color="rgba(233,233,237,0.7)">Días (opcional)</T>
          <Row style={{ gap: 6 }}>
            {WEEK.map(([n, l, full]) => {
              const on = d.days.includes(n);
              return (
                <Pressable key={n} onPress={() => setD({ ...d, days: toggleDay(d.days, n) })} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={full}
                  style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? c.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <T size={13} color={on ? c.a200 : c.n400}>{l}</T>
                </Pressable>
              );
            })}
          </Row>
        </View>

        <View style={{ gap: 8 }}>
          {d.items.map((it, i) => (
            <ItemRow key={it.key} item={it} index={i} count={d.items.length} units={units}
              onChange={(p) => patch(it.key, p)}
              onMove={(dir) => setD((x) => ({ ...x, items: moveItem(x.items, i, dir) }))}
              onRemove={() => setD((x) => ({ ...x, items: x.items.filter((y) => y.key !== it.key) }))} />
          ))}
          {d.items.length === 0 ? <T size={13} color={c.n400}>Todavía no hay ejercicios. Búscalos abajo.</T> : null}
        </View>

        <Card style={{ gap: 8 }}>
          <Field label="Añadir ejercicio" value={query} onChangeText={setQuery} placeholder="Busca o escribe uno nuevo" autoCorrect={false}
            returnKeyType="done" onSubmitEditing={() => (matches[0] && exact ? add(matches[0].id, matches[0].name) : addNew())} />
          {matches.map((e) => (
            <Pressable key={e.id} onPress={() => add(e.id, e.name)} accessibilityRole="button" style={{ minHeight: 40, justifyContent: 'center' }}>
              <T size={14}>{e.name}</T>
            </Pressable>
          ))}
          {query.trim() && !exact ? (
            <Pressable onPress={addNew} accessibilityRole="button" style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Plus size={16} color={c.accent} />
              <T size={14} color={c.accent}>Crear «{query.trim().slice(0, 40)}»</T>
            </Pressable>
          ) : null}
        </Card>

        {errors.length ? <ErrorNote message={errors.join('\n')} /> : null}

        <Button label="Guardar rutina" icon={Check} busy={busy} onPress={save} />
        {!isNew ? <Button variant="ghost" label="Borrar rutina" icon={Trash} onPress={() => setConfirmDelete(true)} /> : null}
      </ScrollView>
      <Confirm visible={confirmDelete} title="Borrar rutina" message="¿Borrar esta rutina? Tu historial de entrenamientos no se pierde."
        confirmLabel="Borrar" destructive cancelLabel="Cancelar" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
    </KeyboardAvoidingView>
  );
}
