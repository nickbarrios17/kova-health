/** Small component kit mirroring nocturne.css (.btn-primary/.btn-secondary/.btn-ghost, .input, cards). */
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { CircleNotch, Info, WarningCircle, XCircle } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
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
import { c, font, r } from './theme';

type Weight = 'regular' | 'medium' | 'semibold';

export function T({ size = 15, w = 'regular', color = c.text, style, ...rest }: TextProps & { size?: number; w?: Weight; color?: string }) {
  return <RNText {...rest} style={[{ fontFamily: font[w], fontSize: size, color, lineHeight: Math.round(size * 1.35) }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: c.surface, borderRadius: r.lg, padding: 16, gap: 10 }, style]}>{children}</View>;
}

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label, onPress, variant = 'primary', icon: Icon, disabled, busy, style, accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: PhosphorIcon;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const fg = variant === 'secondary' ? c.text : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingHorizontal: variant === 'ghost' ? 6 : 14,
          borderRadius: r.md,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor: variant === 'primary' ? c.accent : c.divider,
          backgroundColor: pressed ? (variant === 'secondary' ? 'rgba(233,233,237,0.10)' : 'rgba(145,132,217,0.18)') : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled || busy ? 0.45 : 1,
        },
        style,
      ]}
    >
      {busy ? <CircleNotch size={18} color={fg} /> : Icon ? <Icon size={18} color={fg} /> : null}
      <T w="medium" size={15} color={fg}>{label}</T>
    </Pressable>
  );
}

export function Field({ label, hint, style, ...input }: TextInputProps & { label: string; hint?: string; style?: StyleProp<TextStyle> }) {
  return (
    <View style={{ gap: 5 }}>
      <T size={12} color="rgba(233,233,237,0.7)">{label}</T>
      <TextInput
        placeholderTextColor={c.n600}
        selectionColor={c.accent}
        {...input}
        style={[{ minHeight: 44, paddingHorizontal: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.divider, backgroundColor: c.surface, color: c.text, fontFamily: font.regular, fontSize: 15 }, style]}
      />
      {hint ? <T size={12} color={c.n400}>{hint}</T> : null}
    </View>
  );
}

/** Design-system empty state: explains how to start, never shows sample numbers. */
export function Empty({ icon: Icon = Info, title, children }: { icon?: PhosphorIcon; title: string; children: ReactNode }) {
  return (
    <View style={{ padding: 16, borderRadius: r.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: c.n700, flexDirection: 'row', gap: 12 }}>
      <Icon size={22} color={c.n400} />
      <View style={{ flex: 1, gap: 4 }}>
        <T w="medium">{title}</T>
        <T size={13} color={c.n400}>{children}</T>
      </View>
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.crit, backgroundColor: c.surface, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <XCircle size={18} color={c.crit} />
        <T style={{ flex: 1 }}>{message}</T>
      </View>
      {onRetry ? <Button label="Reintentar" variant="secondary" onPress={onRetry} /> : null}
    </View>
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

export function Loading() {
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

/** Segmented control (prototype .seg): e.g. kg / lb. */
export function Seg<V extends string>({ options, value, onChange }: { options: Array<[V, string]>; value: V; onChange: (v: V) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.divider, borderRadius: r.md, overflow: 'hidden' }}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', backgroundColor: on ? c.accentSoft : 'transparent' }}>
            <T size={12} color={on ? c.a200 : c.n400}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

/** In-app confirmation dialog (replaces the system Alert so it matches the rest of Kova Health). */
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
  const tone = destructive ? c.crit : c.accent;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable onPress={onCancel} accessibilityLabel={cancelLabel} style={{ flex: 1, backgroundColor: 'rgba(8,9,16,0.72)', justifyContent: 'center', padding: 24 }}>
        <Pressable accessibilityViewIsModal style={{ backgroundColor: c.surface, borderRadius: r.lg, borderWidth: 1, borderColor: c.divider, padding: 20, gap: 12 }}>
          <T size={18} w="medium" accessibilityRole="header">{title}</T>
          <T size={14} color={c.n300}>{message}</T>
          <View style={{ gap: 8, marginTop: 8 }}>
            <Pressable accessibilityRole="button" onPress={onConfirm}
              style={({ pressed }) => ({ minHeight: 44, borderRadius: r.md, borderWidth: 1, borderColor: tone, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? (destructive ? 'rgba(240,138,120,0.16)' : 'rgba(145,132,217,0.18)') : 'transparent' })}>
              <T w="medium" color={tone}>{confirmLabel}</T>
            </Pressable>
            <Button variant="secondary" label={cancelLabel} onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
