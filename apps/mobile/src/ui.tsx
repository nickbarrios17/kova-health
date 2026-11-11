/**
 * Component kit: Nocturno Vital (docs/design/HANDOFF.md §3). The names and props from the first kit
 * (mirroring nocturne.css) stay; new pieces are added below them.
 */
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { CircleNotch, Info, WarningCircle } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  useWindowDimensions,

  Animated,
  Modal,
  Pressable,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { c, font, rad } from './theme';

type Weight = 'regular' | 'medium' | 'semibold';

export function T({ size = 15, w = 'regular', color = c.text, style, ...rest }: TextProps & { size?: number; w?: Weight; color?: string }) {
  return <RNText {...rest} style={[{ fontFamily: font[w], fontSize: size, color, lineHeight: Math.round(size * 1.35), fontVariant: ['tabular-nums'] }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: c.surface, borderRadius: rad.card, padding: 16, gap: 10 }, style]}>{children}</View>;
}

/** primary: filled accent-strong · secondary: outline · ghost / text: violet text · danger: crit outline. */
type Variant = 'primary' | 'secondary' | 'ghost' | 'text' | 'danger';

const FG: Record<Variant, string> = { primary: c.white, secondary: c.text, ghost: c.a400, text: c.a400, danger: c.crit };

export function Button({
  label, onPress, variant = 'primary', icon: Icon, disabled, busy, style, accessibilityLabel, accessibilityHint, large,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: PhosphorIcon;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** The screen's main action: 52 dp. */
  large?: boolean;
}) {
  const off = !!(disabled || busy);
  const textual = variant === 'ghost' || variant === 'text';
  const fg = disabled ? (textual ? c.n600 : c.n500) : FG[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: large ? 52 : 48,
          paddingHorizontal: textual ? 10 : 16,
          borderRadius: rad.button,
          borderWidth: variant === 'secondary' || variant === 'danger' ? 1 : 0,
          borderColor: variant === 'danger' ? c.crit : disabled ? 'rgba(233,233,237,0.12)' : c.borderStrong,
          backgroundColor:
            variant === 'primary'
              ? disabled ? c.raised : pressed ? c.a700Pressed : c.a700
              : pressed
                ? variant === 'secondary' ? 'rgba(233,233,237,0.12)' : variant === 'danger' ? 'rgba(240,138,120,0.18)' : 'rgba(181,171,252,0.18)'
                : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        style,
      ]}
    >
      {busy ? <Spinner color={fg} /> : Icon ? <Icon size={18} color={fg} /> : null}
      <T w={variant === 'primary' ? 'semibold' : 'medium'} size={15} color={fg}>{label}</T>
    </Pressable>
  );
}

/** Static when reduced motion is on. */
function Spinner({ color }: { color: string }) {
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ transform: [{ rotate }] }}><CircleNotch size={16} color={color} /></Animated.View>;
}

/** 44 × 44 icon button on raised; the label is mandatory. */
export function IconButton({ icon: Icon, label, onPress, style, color = c.text, size = 44, filled }: {
  icon: PhosphorIcon; label: string; onPress: () => void; style?: StyleProp<ViewStyle>; color?: string; size?: number; filled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#343747' : c.raised }, style]}>
      <Icon size={22} color={color} weight={filled ? 'fill' : 'regular'} />
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null; style?: StyleProp<TextStyle> }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T size={13} w="medium" color={c.n400}>{label}</T>
      <TextInput
        placeholderTextColor={c.n600}
        selectionColor={c.accent}
        accessibilityLabel={label}
        {...input}
        onFocus={(e) => { setFocus(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); input.onBlur?.(e); }}
        style={[{
          minHeight: 48, paddingHorizontal: 14, borderRadius: rad.control, borderWidth: focus ? 2 : 1,
          borderColor: error ? c.crit : focus ? c.accent : c.divider, backgroundColor: c.bg,
          color: input.editable === false ? c.n600 : c.text, fontFamily: font.regular, fontSize: 16,
        }, style]}
      />
      {error ? (
        <Row style={{ gap: 6 }}><T size={13} color={c.crit} accessibilityLiveRegion="polite">✕ {error}</T></Row>
      ) : hint ? <T size={12} color={c.n500}>{hint}</T> : null}
    </View>
  );
}

/** Design-system empty state: explains how to start, never shows sample numbers; at most one action. */
export function Empty({ icon: Icon = Info, title, children, action }: { icon?: PhosphorIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ padding: 16, borderRadius: rad.lg, backgroundColor: c.surface, flexDirection: 'row', gap: 12 }}>
      <Icon size={32} color={c.n500} />
      <View style={{ flex: 1, gap: 4 }}>
        <T size={16} w="semibold">{title}</T>
        <T size={14} color={c.n400}>{children}</T>
        {action ? <View style={{ marginTop: 6, alignItems: 'flex-start' }}>{action}</View> : null}
      </View>
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Banner tone="crit" text={message} action={onRetry ? { label: 'Reintentar', onPress: onRetry } : undefined} />
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' }) {
  const Icon = tone === 'warn' ? WarningCircle : Info;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Icon size={15} color={tone === 'warn' ? c.warn : c.n400} />
      <T size={12} color={c.n400} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

/** First load only; screens use Skeleton for their own content. */
export function Loading() {
  return (
    <View style={{ padding: 16, gap: 12 }} accessibilityLabel="Cargando" accessibilityRole="progressbar">
      <Skeleton height={22} width="45%" radius={6} />
      <Skeleton height={140} radius={rad.sheet} />
      <Row style={{ gap: 10 }}><Skeleton height={110} style={{ flex: 1 }} /><Skeleton height={110} style={{ flex: 1 }} /></Row>
    </View>
  );
}

/** Segmented control: container bg, active option raised + border + 600. */
export function Seg<V extends string>({ options, value, onChange, label, stretch }: { options: Array<[V, string]>; value: V; onChange: (v: V) => void; label?: string; /** Options share the full width (only where the control has its own row). */ stretch?: boolean }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}
      style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.divider, borderRadius: 10, padding: 2, gap: 2, backgroundColor: c.bg }}>
      {options.map(([v, text]) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} accessibilityLabel={text}
            style={{ flexGrow: stretch ? 1 : 0, paddingHorizontal: 12, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? c.raised : 'transparent', borderWidth: 1, borderColor: on ? c.divider : 'transparent' }}>
            <T size={13} w={on ? 'semibold' : 'regular'} color={on ? c.text : c.n400}>{text}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

/** Chip / filter: pill 34; selected is accent-soft + #D2CEFD + «✓». */
export function Chip({ label, selected, onPress, disabled, icon: Icon, accessibilityLabel }: {
  label: string; selected?: boolean; onPress?: () => void; disabled?: boolean; icon?: PhosphorIcon; accessibilityLabel?: string;
}) {
  const fg = disabled ? c.n600 : selected ? c.a300 : c.text;
  return (
    <Pressable onPress={onPress} disabled={disabled || !onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }} hitSlop={6}
      style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderColor: selected ? 'transparent' : disabled ? c.borderSubtle : c.divider,
        backgroundColor: selected ? c.accentSoftSolid : pressed ? 'rgba(233,233,237,0.06)' : 'transparent' })}>
      {selected ? <T size={13} w="semibold" color={fg}>✓</T> : Icon ? <Icon size={15} color={fg} /> : null}
      <T size={13} w={selected ? 'medium' : 'regular'} color={fg}>{label}</T>
    </Pressable>
  );
}

/** Confidence badge for an insight kind: color + glyph + word. */
const BADGE = {
  fact: { glyph: '●', label: 'Hecho', bg: c.accentSoftSolid, border: 'transparent', fg: c.a300 },
  pattern: { glyph: '◐', label: 'Patrón', bg: 'transparent', border: c.a400, fg: c.a400 },
  hypothesis: { glyph: '○', label: 'Hipótesis', bg: 'transparent', border: 'rgba(233,233,237,0.32)', fg: c.n400 },
  prediction: { glyph: '⇢', label: 'Proyección', bg: 'transparent', border: 'rgba(233,233,237,0.32)', fg: c.n400 },
} as const;
export function ConfidenceBadge({ kind }: { kind: keyof typeof BADGE }) {
  const b = BADGE[kind];
  return (
    <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: b.border, backgroundColor: b.bg, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
      <T size={12} color={b.fg}>{b.glyph}</T>
      <T size={12} w="medium" color={b.fg}>{b.label}</T>
    </View>
  );
}

type Tone = 'info' | 'ok' | 'warn' | 'crit';
const TONE: Record<Tone, { bg: string; border: string; fg: string; glyph: string }> = {
  info: { bg: c.raised, border: c.divider, fg: c.n400, glyph: '⌁' },
  ok: { bg: c.okSoft, border: 'rgba(111,214,163,0.32)', fg: c.ok, glyph: '✓' },
  warn: { bg: c.warnSoft, border: 'rgba(239,193,115,0.32)', fg: c.warn, glyph: '△' },
  crit: { bg: c.critSoft, border: 'rgba(240,138,120,0.32)', fg: c.crit, glyph: '✕' },
};

/** Banner: radius 14, soft background, glyph + text, optional action. */
export function Banner({ tone = 'info', text, title, glyph, action, style }: {
  tone?: Tone; text: string; title?: string; glyph?: string; action?: { label: string; onPress: () => void }; style?: StyleProp<ViewStyle>;
}) {
  const t = TONE[tone];
  return (
    <View accessibilityRole={tone === 'crit' ? 'alert' : undefined} accessibilityLiveRegion="polite"
      style={[{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, flexDirection: 'row', gap: 10, alignItems: 'center' }, style]}>
      <T w="semibold" color={t.fg}>{glyph ?? t.glyph}</T>
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T w="semibold" size={14}>{title}</T> : null}
        <T size={14} color={title ? c.n400 : c.text}>{text}</T>
      </View>
      {action ? <Button variant="text" label={action.label} onPress={action.onPress} style={{ minHeight: 40 }} /> : null}
    </View>
  );
}

/** Skeleton: raised blocks that pulse 1 ↔ .6 over 1.2 s; still with reduced motion. */
export function Skeleton({ height, width, radius = rad.card, style }: { height: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) { o.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.6, duration: 600, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce, o]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: c.skeleton, opacity: o }, style]} />;
}

/** Preparación: Kova does not compute it yet, so the ring is always the empty, dotted one. */
export function ReadinessRing({ size = 64 }: { size?: number }) {
  const stroke = Math.max(4, Math.round(size * 0.11));
  const rr = (size - stroke) / 2;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel="Preparación: aún sin calcular">
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={rr} fill="none" stroke={c.chartEmpty} strokeWidth={stroke} strokeDasharray="4 10" strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <T size={Math.round(size * 0.3)} w="semibold" color={c.n500}>—</T>
      </View>
    </View>
  );
}

/** Seven-day mini bars: today in accent (or its state colour), others chart-muted, no data a 2 dp mark. */
export function MiniBars({ values, todayColor = c.accent, label }: { values: Array<number | null>; todayColor?: string; label: string }) {
  const max = Math.max(...values.map((v) => v ?? 0), 0);
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 30 }}>
      {values.map((v, i) => {
        const today = i === values.length - 1;
        const h = v == null || max === 0 ? 2 : Math.max(4, Math.round((v / max) * 30));
        return <View key={i} style={{ width: 8, height: h, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: v == null ? c.raised : today ? todayColor : c.chartMuted }} />;
      })}
    </View>
  );
}

/**
 * How much of this window the keyboard covers, in px (0 when closed or on the web). Android draws the
 * app edge to edge, so the system no longer shrinks the window for the keyboard: screens and sheets
 * make room themselves. Where the system does shrink it, the overlap is ~0 and nothing is added twice.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const winH = Dimensions.get('window').height;
      const top = e.endCoordinates.screenY || winH - e.endCoordinates.height;
      setInset(Math.max(0, Math.round(winH - top)));
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setInset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return inset;
}

/** A full screen (or full-screen modal) whose content stays above the keyboard. */
export function KeyboardRoom({ children, style, extra = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; extra?: number }) {
  const kb = useKeyboardInset();
  return <View style={[{ flex: 1, paddingBottom: Math.max(0, kb - extra) }, style]}>{children}</View>;
}

/**
 * Bottom sheet: raised, top radius 24, scrim. It sits on top of the keyboard and its content scrolls
 * when it does not fit, so what you type is always in view.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const kb = useKeyboardInset();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Cerrar" style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end', paddingBottom: kb }}>
        <Pressable accessibilityViewIsModal style={{ maxHeight: Math.max(240, height - kb - 48), backgroundColor: c.raised, borderTopLeftRadius: rad.sheet, borderTopRightRadius: rad.sheet, borderWidth: 1, borderColor: c.divider, paddingTop: 20, paddingHorizontal: 20, paddingBottom: kb ? 12 : 32, gap: 12 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.n700, marginBottom: 4 }} />
          <T size={19} w="semibold" accessibilityRole="header">{title}</T>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** In-app confirmation (bottom sheet): title, text, primary + secondary. */
export function Confirm({
  visible, title, message, confirmLabel, cancelLabel = 'Cancelar', destructive, onConfirm, onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title}>
      <T size={14} color={c.n400}>{message}</T>
      <View style={{ gap: 8, marginTop: 8 }}>
        <Button variant={destructive ? 'danger' : 'primary'} large label={confirmLabel} onPress={onConfirm} />
        <Button variant="secondary" label={cancelLabel} onPress={onCancel} />
      </View>
    </Sheet>
  );
}

/** Reduced motion (AccessibilityInfo), live. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduce(v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}


