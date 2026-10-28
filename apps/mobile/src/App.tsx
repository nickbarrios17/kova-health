import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
import { VidaError } from '@vida/domain';
import { StatusBar } from 'expo-status-bar';
import { Barbell, ChartLineUp, ForkKnife, House, type Icon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { configured, outbox, vida } from './client';
import * as hc from './health';
import { Comida } from './screens/Comida';
import { Entrenar } from './screens/Entrenar';
import { Hoy } from './screens/Hoy';
import { Login } from './screens/Login';
import { Onboarding } from './screens/Onboarding';
import { Progreso } from './screens/Progreso';
import { Session, SessionSummary } from './screens/Session';
import { SessionProvider, useSession } from './session';
import { c } from './theme';
import type { TrainingData } from './training';
import { Button, T } from './ui';
import { loadLive, startFromRoutine, type LiveSession, type Summary } from './workout';

type Tab = 'hoy' | 'entrenar' | 'comida' | 'progreso';
const TABS: Array<[Tab, string, Icon]> = [
  ['hoy', 'Hoy', House],
  ['entrenar', 'Entrenar', Barbell],
  ['comida', 'Comida', ForkKnife],
  ['progreso', 'Progreso', ChartLineUp],
];

function Shell() {
  const { status, prefs, deviceId, bootError, retryBoot } = useSession();
  const [tab, setTab] = useState<Tab>('hoy');
  const [live, setLive] = useState<LiveSession | null>(null);
  const [showLive, setShowLive] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

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

  if (status === 'signedIn' && !prefs && bootError) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
        <T size={18} w="medium">No pudimos cargar tu cuenta</T>
        <T size={13} color={c.n400}>{bootError}</T>
        <T size={13} color={c.n400}>Revisa tu conexión a internet e inténtalo de nuevo.</T>
        <Button label="Reintentar" onPress={retryBoot} />
        <Button variant="ghost" label="Cerrar sesión" onPress={() => vida.auth.signOut()} />
      </View>
    );
  }
  if (status === 'loading' || (status === 'signedIn' && !prefs)) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View>;
  }
  if (status === 'signedOut') return <Login />;
  if (!prefs!.onboarded) return <Onboarding />;

  const start = async (routineId: string, data: TrainingData) => {
    const routine = data.routines.find((x) => x.id === routineId);
    if (!routine) return;
    try {
      const s = await startFromRoutine(routine, data.names, data.lastKg, data.bestKg, deviceId, prefs!.time_zone);
      setLive(s);
      setShowLive(true);
    } catch (e) {
      Alert.alert('No se pudo empezar', e instanceof VidaError ? e.message : 'Algo salió mal.');
    }
  };

  if (summary) return <SessionSummary summary={summary} onDone={() => { setSummary(null); setTab('entrenar'); }} />;
  if (live && showLive) {
    return <Session live={live} setLive={setLive} onClose={() => setShowLive(false)} onFinished={(s) => { setShowLive(false); setSummary(s); }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'hoy' ? <Hoy live={live} onOpenLive={() => setShowLive(true)} onStart={start} />
          : tab === 'entrenar' ? <Entrenar hasLive={!!live} onStart={start} />
          : tab === 'comida' ? <Comida />
          : <Progreso />}
      </View>
      {live ? (
        <Pressable onPress={() => setShowLive(true)} style={{ marginHorizontal: 12, marginBottom: 8, height: 44, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent }} />
          <T size={13} style={{ flex: 1 }}>{live.name}{live.pausedAt ? ' · en pausa' : ''}</T>
          <T size={13} color={c.accent}>Volver</T>
        </Pressable>
      ) : null}
      <View style={{ height: 66, flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: 'rgba(233,233,237,0.06)' }}>
        {TABS.map(([k, label, Ic]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <View style={{ width: 52, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.a900 : 'transparent' }}>
                <Ic size={20} color={on ? c.a200 : c.n400} weight={on ? 'fill' : 'regular'} />
              </View>
              <T size={11} color={on ? c.a200 : c.n400}>{label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {!fontsLoaded ? null : !configured ? (
          <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
            <T size={16}>Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (ver apps/mobile/.env.example).</T>
          </View>
        ) : (
          <SessionProvider><Shell /></SessionProvider>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
