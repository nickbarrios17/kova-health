/**
 * Novedades (docs/novedades.md): the days from @kova/domain NEWS this device has not seen, shown once
 * on open after an update; Ajustes → Novedades shows them all. What was seen is a per-device
 * convenience in AsyncStorage: losing it only shows the last week again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NEWS, newsDate, newsFor, newsId, unseenNews, type NewsDay } from '@kova/domain';
import * as Application from 'expo-application';
import { Sparkle } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { c, r } from './theme';
import { Button, Row, T } from './ui';

const SEEN_KEY = 'kova:news-seen';
/** The test app («Kova Health Prueba») also shows what is not in the official app yet. */
export const newsDays = () => newsFor(!!Application.applicationId?.endsWith('.prueba'), NEWS);

export function NewsSheet({ visible, days, onClose, title = 'Novedades' }: { visible: boolean; days: NewsDay[]; onClose: () => void; title?: string }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: r.lg, borderTopRightRadius: r.lg, maxHeight: '85%' }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <Row style={{ gap: 10, alignItems: 'center' }}>
              <Sparkle size={22} color={c.accent} weight="fill" />
              <T size={18} w="medium">{title}</T>
            </Row>
            {days.map((d) => (
              <View key={d.date} style={{ gap: 10 }}>
                <T size={12} w="medium" color={c.n400}>{newsDate(d.date)}</T>
                {d.items.map((i) => (
                  <View key={i.title} style={{ gap: 2, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: c.accent }}>
                    <T size={15} w="medium">{i.title}</T>
                    {i.body ? <T size={13} color={c.n300}>{i.body}</T> : null}
                  </View>
                ))}
              </View>
            ))}
            <Button label="Entendido" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Shows the unseen days once, when `ready` (signed in and onboarded). */
export function NewsOnOpen({ ready }: { ready: boolean }) {
  const [days, setDays] = useState<NewsDay[]>([]);
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        const seen = raw ? (JSON.parse(raw) as string[]) : null;
        setDays(unseenNews(newsDays(), seen, new Date().toISOString().slice(0, 10)));
      })
      .catch(() => undefined);
  }, [ready]);
  const close = () => {
    setDays([]);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(newsDays().map(newsId))).catch(() => undefined);
  };
  return <NewsSheet visible={days.length > 0} days={days} onClose={close} title="¿Qué hay de nuevo?" />;
}
