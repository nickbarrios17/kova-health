/**
 * Sync state from the outbox (HANDOFF §6.4): chip, banners, the sheet of queued sends and the
 * «Todo enviado» notice. Reads the existing outbox only; retries are never shown.
 */
import { safeMessage, type ErrorCode } from '@kova/domain';
import type { OutboxEntry } from '@kova/api-client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { kova, outbox } from './client';
import { c } from './theme';
import { Banner, Button, Row, Sheet, T, useReduceMotion } from './ui';

export interface SyncState {
  pending: number;
  failed: OutboxEntry[];
  /** The last send stopped on a network error: the device is offline. */
  offline: boolean;
  /** A flush has been running for more than 600 ms. */
  sending: boolean;
  /** Pending record_set operations (the sets saved only on this phone). */
  pendingSetIds: Set<string>;
  refresh: () => void;
  openSheet: () => void;
}

const empty: SyncState = { pending: 0, failed: [], offline: false, sending: false, pendingSetIds: new Set(), refresh: () => undefined, openSheet: () => undefined };
const Ctx = createContext<SyncState>(empty);
export const useSync = () => useContext(Ctx);

const OP_LABEL: Record<OutboxEntry['op']['kind'], [one: string, many: string]> = {
  record_set: ['serie', 'series'],
  start_session: ['inicio de sesión', 'inicios de sesión'],
  transition_session: ['cambio de sesión', 'cambios de sesión'],
  log_food: ['comida', 'comidas'],
  log_habit: ['hábito', 'hábitos'],
  record_measurement: ['medición', 'mediciones'],
  record_observation: ['dato de salud', 'datos de salud'],
};
const label = (kind: OutboxEntry['op']['kind'], n: number) => n + ' ' + OP_LABEL[kind][n === 1 ? 0 : 1];
const reason = (code: ErrorCode | undefined) => safeMessage(code ?? 'INTERNAL').replace(/\.$/, '');

export function SyncProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prevPending = useRef<OutboxEntry[]>([]);

  const refresh = useCallback(() => {
    Promise.all([outbox.entries(), outbox.state()]).then(([list, st]) => {
      setEntries(list);
      setBusy(st.sending);
      const pendingNow = list.filter((e) => e.status === 'pending');
      const before = prevPending.current;
      // Pending → empty with nothing failed: «Todo enviado · N series».
      if (before.length > 0 && pendingNow.length === 0 && !st.sending) {
        const sets = before.filter((e) => e.op.kind === 'record_set').length;
        setToast('Todo enviado' + (sets ? ' · ' + label('record_set', sets) : ''));
      }
      prevPending.current = pendingNow;
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    return outbox.subscribe(refresh);
  }, [refresh]);

  // «Enviando» only when a flush lasts more than 600 ms.
  useEffect(() => {
    if (!busy) { setSending(false); return; }
    const t = setTimeout(() => setSending(true), 600);
    return () => clearTimeout(t);
  }, [busy]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const pendingList = entries.filter((e) => e.status === 'pending');
  const failed = entries.filter((e) => e.status === 'failed');
  const state: SyncState = {
    pending: pendingList.length,
    failed,
    offline: pendingList.some((e) => e.error === 'NETWORK'),
    sending,
    pendingSetIds: new Set(pendingList.flatMap((e) => (e.op.kind === 'record_set' ? [e.op.input.id] : []))),
    refresh,
    openSheet: () => setSheet(true),
  };

  // The sheet groups by kind; each failed one can be discarded (removed from this phone's queue).
  const groups = Object.entries(
    pendingList.reduce<Record<string, number>>((a, e) => ({ ...a, [e.op.kind]: (a[e.op.kind] ?? 0) + 1 }), {}),
  ) as Array<[OutboxEntry['op']['kind'], number]>;

  return (
    <Ctx.Provider value={state}>
      {children}
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Envíos">
        {pendingList.length === 0 && failed.length === 0 ? (
          <T size={14} color={c.n400}>✓ Todo está al día.</T>
        ) : null}
        {groups.length ? (
          <View style={{ gap: 6 }}>
            <T size={13} w="medium" color={c.n400}>{state.offline ? '⌁ Sin conexión · se envían al volver' : '↑ Pendientes'}</T>
            {groups.map(([kind, n]) => <T key={kind} size={14}>{label(kind, n)} guardadas acá</T>)}
          </View>
        ) : null}
        {failed.map((e) => (
          <View key={e.id} style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: c.critSoft }}>
            <T size={14}><T size={14} w="semibold" color={c.crit}>✕ </T>{label(e.op.kind, 1)} no se pudo guardar: {reason(e.error)}.</T>
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button variant="danger" label="Descartar" onPress={() => { outbox.discard(e.id).catch(() => undefined); }} style={{ minHeight: 40 }} />
            </Row>
          </View>
        ))}
        <Button variant="secondary" label="Cerrar" onPress={() => setSheet(false)} />
      </Sheet>
      {toast ? <SyncToast text={toast} /> : null}
    </Ctx.Provider>
  );
}

function SyncToast({ text }: { text: string }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: reduce ? 120 : 200, useNativeDriver: true }).start();
  }, [a, reduce]);
  return (
    <Animated.View accessibilityLiveRegion="polite" pointerEvents="none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: 96, opacity: a, transform: reduce ? [] : [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.raised, borderWidth: 1, borderColor: c.divider, flexDirection: 'row', gap: 8 }}>
        <T w="semibold" color={c.ok}>✓</T><T size={14}>{text}</T>
      </View>
    </Animated.View>
  );
}

/**
 * Sync chip (32 high, glyph in colour + text). «✓ Al día» hides itself 5 s after it appears;
 * pending and error states open the sheet.
 */
export function SyncChip() {
  const s = useSync();
  const quiet = s.pending === 0 && s.failed.length === 0 && !s.sending;
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (!quiet) { setHide(false); return; }
    const t = setTimeout(() => setHide(true), 5000);
    return () => clearTimeout(t);
  }, [quiet]);
  if (quiet && hide) return null;
  const [glyph, color, text] =
    s.failed.length ? ['✕', c.crit, s.failed.length + (s.failed.length === 1 ? ' error' : ' errores')]
      : s.offline ? ['⌁', c.warn, 'Sin conexión']
      : s.sending ? ['◌', c.a400, 'Enviando']
      : s.pending ? ['↑', c.warn, s.pending + (s.pending === 1 ? ' pendiente' : ' pendientes')]
      : ['✓', c.ok, 'Al día'];
  return (
    <Pressable onPress={quiet ? undefined : s.openSheet} disabled={quiet} accessibilityRole={quiet ? 'text' : 'button'}
      accessibilityLabel={'Sincronización: ' + text} hitSlop={8}
      style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: s.offline ? 'rgba(239,193,115,0.5)' : c.divider, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <T size={13} w="semibold" color={color}>{glyph}</T>
      <T size={13}>{text}</T>
    </Pressable>
  );
}

/** Banners for a screen: offline (neutral) and failed sends (crit, «Ver»). */
export function SyncBanners({ during }: { during?: 'session' }) {
  const s = useSync();
  return (
    <>
      {s.offline ? (
        <Banner glyph="⌁" title="Sin conexión"
          text={during === 'session' ? 'Podés seguir entrenando. Tus series se guardan acá y se envían al volver.' : 'Lo que registres se guarda acá y se envía al volver.'} />
      ) : null}
      {s.failed.length ? (
        <Banner tone="crit"
          text={s.failed.length === 1
            ? label(s.failed[0]!.op.kind, 1).replace(/^1 /, '1 ') + ' no se pudo guardar: ' + reason(s.failed[0]!.error) + '.'
            : s.failed.length + ' envíos no se pudieron guardar.'}
          action={{ label: 'Ver', onPress: s.openSheet }} />
      ) : null}
    </>
  );
}

/**
 * Another device already has a session open (ACTIVE_SESSION_EXISTS on this phone's start): keep
 * the watch's, or abandon it and keep this one. Uses workouts.active() and the existing transition.
 */
export function SessionConflict({ live, onDropLocal }: { live: { id: string; exercises: Array<{ id: string }> } | null; onDropLocal: () => void }) {
  const s = useSync();
  const [busy, setBusy] = useState(false);
  const start = live ? s.failed.find((e) => e.op.kind === 'start_session' && e.op.input.id === live.id && e.error === 'ACTIVE_SESSION_EXISTS') : undefined;
  if (!live || !start) return null;
  const exIds = new Set(live.exercises.map((x) => x.id));
  const related = s.failed.filter((e) =>
    (e.op.kind === 'start_session' && e.op.input.id === live.id)
    || (e.op.kind === 'transition_session' && e.op.input.id === live.id)
    || (e.op.kind === 'record_set' && exIds.has(e.op.input.session_exercise_id)));

  const keepWatch = async () => {
    setBusy(true);
    for (const e of related) await outbox.discard(e.id).catch(() => undefined);
    setBusy(false);
    onDropLocal();
  };
  const keepHere = async () => {
    setBusy(true);
    try {
      const other = await kova.workouts.active();
      if (other && other.id !== live.id) await kova.workouts.transition({ id: other.id, action: 'abandon', at: new Date().toISOString() });
      await outbox.retry(related.map((e) => e.id));
      await outbox.flush();
    } catch {
      // Still offline or refused: the entries stay failed and the dialog stays.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={() => undefined} title="Ya tenés una sesión en curso">
      <T size={14} color={c.n400}>Empezaste una sesión en otro dispositivo, como el reloj. Elegí con cuál seguir.</T>
      <View style={{ gap: 8, marginTop: 8 }}>
        <Button large label="Continuar la del reloj" onPress={keepWatch} busy={busy} />
        <Button variant="secondary" label="Abandonar la del reloj y seguir acá" onPress={keepHere} disabled={busy} />
      </View>
    </Sheet>
  );
}
