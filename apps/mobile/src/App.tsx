import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
import { KovaError } from '@kova/domain';
import { StatusBar } from 'expo-status-bar';
import { Barbell, ChartLineUp, ForkKnife, SquaresFour, type Icon } from 'phosphor-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkApkUpdate, type ApkRelease } from './appUpdate';
import { useBack } from './back';
import { inviteCode } from '@kova/api-client';
import { configured, outbox, kova } from './client';
import * as hc from './health';
import { Comida } from './screens/Comida';
import { Entrenar } from './screens/Entrenar';
import { Hoy } from './screens/Hoy';
import { Login } from './screens/Login';
import { Onboarding } from './screens/Onboarding';
import { Personas } from './screens/Personas';
import { Progreso } from './screens/Progreso';
import { Session, SessionSummary } from './screens/Session';
import { UpdatePrompt } from './screens/UpdatePrompt';
import { SessionProvider, useSession } from './session';
import { c } from './theme';
import type { TrainingData } from './training';
import { Button, KeyboardRoom, Loading, T, useKeyboardInset } from './ui';
import { loadLive, saveLive, startFromRoutine, type LiveSession, type Summary } from './workout';
import { SessionConflict, SyncProvider } from './sync';
import { ReportProvider, useReportButtonOffset } from './report';
import { NewsOnOpen } from './NewsSheet';
import { sendWideScreensToDesktop } from './webLayout';

sendWideScreensToDesktop();

type Tab = 'hoy' | 'entrenar' | 'comida' | 'progreso';
const TABS: Array<[Tab, string, Icon]> = [
  ['hoy', 'Hoy', SquaresFour],
  ['entrenar', 'Entrenar', Barbell],
  ['comida', 'Comida', ForkKnife],
  ['progreso', 'Progreso', ChartLineUp],
];

function Shell() {
  const { status, prefs, deviceId, bootError, retryBoot } = useSession();
  const [tab, setTab] = useState<Tab>('hoy');
  const [live, setLive] = useState<LiveSession | null>(null);
  // While typing, the tabs step aside so the screen keeps the room above the keyboard.
  const typing = useKeyboardInset() > 0;
  const [showLive, setShowLive] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [apkUpdate, setApkUpdate] = useState<ApkRelease | null>(null);
  const [laterVersion, setLaterVersion] = useState<number | null>(null);
  // An invite link (kovahealth://invitar/K7MQ2X) opens «Coach y amigos» with the code filled in.
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => {
    const take = (url: string | null | undefined) => { if (url && /invitar/i.test(url)) setInvite(inviteCode(url)); };
    Linking.getInitialURL().then(take).catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => take(e.url));
    return () => sub.remove();
  }, []);

  // A new APK (native changes) is offered when the app opens and when it comes back to the
  // foreground, at most every 6 hours. Code-only updates arrive silently via expo-updates.
  useEffect(() => {
    let last = 0;
    const check = () => {
      if (Date.now() - last < 6 * 3600_000) return;
      last = Date.now();
      checkApkUpdate().then(setApkUpdate).catch(() => undefined);
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);
  const prompt = apkUpdate && apkUpdate.versionCode !== laterVersion
    ? <UpdatePrompt release={apkUpdate} onLater={() => setLaterVersion(apkUpdate.versionCode)} />
    : null;

  // Recover an interrupted session and retry pending writes on start and when returning to the app.
  useEffect(() => {
    if (status !== 'signedIn') return;
    loadLive().then(setLive);
    const autoSync = () => {
      outbox.flush().catch(() => undefined);
      // Background-safe: only if Health Connect is already connected; failures are silent here.
      hc.grantedCount().then(async (n) => { if (n > 0 && prefs) await hc.sync(prefs.time_zone, deviceId, 7); }).catch(() => undefined);
    };
    autoSync();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && autoSync());
    return () => sub.remove();
  }, [status, prefs, deviceId]);

  // Back: summary → Entrenar, live session → minimized, another tab → Hoy, Hoy → Android closes the app.
  useBack(!!summary, () => { setSummary(null); setTab('entrenar'); });
  useBack(!summary && !!live && showLive, () => setShowLive(false));
  useBack(!summary && !(live && showLive) && tab !== 'hoy', () => setTab('hoy'));

  // ⚠️ button: hidden until signed in and onboarded; above the tab bar on the tabbed screens.
  const tabbed = status === 'signedIn' && !!prefs?.onboarded && !summary && !(live && showLive) && !invite;
  useReportButtonOffset(status !== 'signedIn' || !prefs?.onboarded ? -1 : tabbed ? (live ? 160 : 92) : live && showLive ? -1 : 24);

  if (status === 'signedIn' && !prefs && bootError) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
        <T size={19} w="semibold" accessibilityRole="header">No pudimos cargar tu cuenta</T>
        <T size={14} color={c.n400}>Revisá tu conexión a internet e intentalo de nuevo.</T>
        <Button large label="Reintentar" onPress={retryBoot} />
        <Button variant="secondary" label="Cerrar sesión" onPress={() => kova.auth.signOut()} />
      </View>
    );
  }
  if (status === 'loading' || (status === 'signedIn' && !prefs)) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><Loading /></View>;
  }
  if (status === 'signedOut') return <>{prompt}<Login /></>;
  if (!prefs!.onboarded) return <>{prompt}<Onboarding /></>;

  const start = async (routineId: string, data: TrainingData) => {
    const routine = data.routines.find((x) => x.id === routineId);
    if (!routine) return;
    try {
      const s = await startFromRoutine(routine, data.names, data.lastKg, data.bestKg, deviceId, prefs!.time_zone);
      setLive(s);
      setShowLive(true);
    } catch (e) {
      const msg = e instanceof KovaError ? e.message : 'Algo salió mal.';
      // react-native-web has no Alert.
      if (Platform.OS === 'web') window.alert('No se pudo empezar: ' + msg);
      else Alert.alert('No se pudo empezar', msg);
    }
  };

  if (invite) return <Personas initialCode={invite} onClose={() => setInvite(null)} />;
  if (summary) return <SessionSummary summary={summary} onDone={() => { setSummary(null); setTab('entrenar'); }} />;
  if (live && showLive) {
    return <Session live={live} setLive={setLive} onClose={() => setShowLive(false)} onFinished={(s) => { setShowLive(false); setSummary(s); }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {prompt}
      <NewsOnOpen ready={!prompt} />
      <View style={{ flex: 1 }}>
        {tab === 'hoy' ? <Hoy live={live} onOpenLive={() => setShowLive(true)} onStart={start} onCreateRoutine={() => setTab('entrenar')} />
          : tab === 'entrenar' ? <Entrenar hasLive={!!live} onStart={start} />
          : tab === 'comida' ? <Comida />
          : <Progreso />}
      </View>
      {live && !typing ? <LiveBar live={live} onOpen={() => setShowLive(true)} /> : null}
      <SessionConflict live={live} onDropLocal={() => { saveLive(null).catch(() => undefined); setLive(null); }} />
      {typing ? null : <View accessibilityRole="tablist" style={{ height: 80, flexDirection: 'row', backgroundColor: c.navBg, borderTopWidth: 1, borderTopColor: c.borderSubtle, paddingBottom: 6 }}>
        {TABS.map(([k, label, Ic]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}>
              <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.track : 'transparent' }}>
                <Ic size={22} color={on ? c.text : c.n400} weight={on ? 'fill' : 'regular'} />
              </View>
              <T size={12} w={on ? 'semibold' : 'regular'} color={on ? c.text : c.n400}>{label}</T>
            </Pressable>
          );
        })}
      </View>}
    </View>
  );
}

/** Session in progress, above the tabs on every tabbed screen (HANDOFF §5.2). */
function LiveBar({ live, onOpen }: { live: LiveSession; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now());
  const resting = live.restEndsAt != null && Date.parse(live.restEndsAt) > now;
  useEffect(() => {
    if (!live.restEndsAt) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [live.restEndsAt]);
  const ex = live.exercises[live.cur];
  const next = ex ? ex.sets.findIndex((x) => !x.done) : -1;
  const left = resting ? Math.ceil((Date.parse(live.restEndsAt!) - now) / 1000) : 0;
  const detail = live.pausedAt ? '‖ En pausa'
    : resting ? 'Descanso ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0')
    : ex && next >= 0 ? ex.name + ' · serie ' + (next + 1) + ' de ' + ex.sets.length
    : ex ? ex.name : '';
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={live.name + ' en curso. ' + detail + '. Volver a la sesión'}
      style={({ pressed }) => ({ marginHorizontal: 12, marginBottom: 8, height: 56, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(181,171,252,0.4)', backgroundColor: pressed ? '#343747' : c.raised, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={14} w="semibold" numberOfLines={1}>{live.name} · en curso</T>
        <T size={12} color={c.n400} numberOfLines={1}>{detail}</T>
      </View>
      <T size={14} w="medium" color={c.a400}>Volver</T>
    </Pressable>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  return (
    <SafeAreaProvider>
      {/* On the web (docs/web-celular.md) the app keeps a phone's width on tablets and wide windows. */}
      <SafeAreaView style={[{ flex: 1, backgroundColor: c.bg }, Platform.OS === 'web' && { width: '100%', maxWidth: 560, alignSelf: 'center' }]} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {!fontsLoaded ? null : !configured ? (
          <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
            <T size={16}>Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (ver apps/mobile/.env.example).</T>
          </View>
        ) : (
          <AppKeyboardRoom><SessionProvider><SyncProvider><ReportProvider><Shell /></ReportProvider></SyncProvider></SessionProvider></AppKeyboardRoom>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/** Every screen stays above the keyboard; the safe-area bottom (navigation bar) is already left out. */
function AppKeyboardRoom({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <KeyboardRoom extra={insets.bottom}>{children}</KeyboardRoom>;
}
