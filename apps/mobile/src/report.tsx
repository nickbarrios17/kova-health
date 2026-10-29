/**
 * The ⚠️ button present on every screen (docs/reportes.md). Each screen says where it is with
 * useReportTarget(screen, context); the button opens ReportSheet with that screen's quick options and,
 * when there is one, the exercise. Screens shown in a Modal (exercise detail) carry their own button.
 */
import type { ReportContext, ReportScreen } from '@kova/domain';
import { Warning } from 'phosphor-react-native';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ReportSheet } from './ReportSheet';
import { c } from './theme';

interface Target { screen: ReportScreen; context?: ReportContext }
interface Ctx { push: (t: Target) => () => void; setBottom: (n: number) => void }
const ReportCtx = createContext<Ctx | null>(null);

/** Registers the current screen while it is mounted (the innermost mounted screen wins). */
export function useReportTarget(screen: ReportScreen, context?: ReportContext) {
  const ctx = useContext(ReportCtx);
  const key = JSON.stringify(context ?? {});
  useEffect(() => ctx?.push({ screen, context }), [screen, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** How far from the bottom the button sits (above the tab bar when there is one); negative hides it. */
export function useReportButtonOffset(bottom: number) {
  const ctx = useContext(ReportCtx);
  useEffect(() => ctx?.setBottom(bottom), [bottom]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ReportButton({ onPress, size = 20 }: { onPress: () => void; size?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Reportar un problema en esta pantalla"
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Warning size={size} color={c.warn} />
    </Pressable>
  );
}

export function ReportProvider({ children }: { children: ReactNode }) {
  const stack = useRef<Target[]>([]);
  const [top, setTop] = useState<Target>({ screen: 'other' });
  const [bottom, setBottom] = useState(24);
  const [open, setOpen] = useState(false);
  const push = (t: Target) => {
    stack.current.push(t);
    setTop(t);
    return () => {
      stack.current = stack.current.filter((x) => x !== t);
      setTop(stack.current.at(-1) ?? { screen: 'other' });
    };
  };
  return (
    <ReportCtx.Provider value={{ push, setBottom }}>
      <View style={{ flex: 1 }}>
        {children}
        {bottom >= 0 ? <View pointerEvents="box-none" style={{ position: 'absolute', right: 10, bottom }}>
          <View style={{ borderRadius: 22, backgroundColor: 'rgba(35,37,50,0.92)', borderWidth: 1, borderColor: c.divider }}>
            <ReportButton onPress={() => setOpen(true)} />
          </View>
        </View> : null}
        <ReportSheet visible={open} onClose={() => setOpen(false)} screen={top.screen} context={top.context} />
      </View>
    </ReportCtx.Provider>
  );
}
