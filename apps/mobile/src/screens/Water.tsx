/**
 * Water through the day (docs/comidas.md, etapa 5): +1 glass, undo, and a goal by weight and training.
 * The goal is an estimate (~35 ml/kg); food also brings water. Private: no coach or friend sees it.
 */
import { nf, waterGoalMl } from '@kova/domain';
import { ArrowCounterClockwise, Drop, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { kova } from '../client';
import { c } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Card, Row, T } from '../ui';

export function WaterCard({ today }: { today: string }) {
  const [busy, setBusy] = useState(false);
  const q = useAsync(async () => {
    const [water, weights, energy] = await Promise.all([
      kova.food.water.total(today),
      kova.body.history('weight_kg', 1).catch(() => []),
      kova.energy.today(today).catch(() => null),
    ]);
    const w = (weights as Array<{ value: unknown }>)[0]?.value;
    const trained = energy?.mode === 'dynamic' && (energy.day?.workoutMinutes ?? 0) > 0;
    return { ...water, goal: waterGoalMl(w == null ? null : Number(w), trained), trained };
  }, [today]);

  const act = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try { await f(); } catch { /* the total below stays as it was */ }
    setBusy(false);
    q.reload();
  };

  const d = q.data;
  const pct = d ? Math.min(1, d.ml / d.goal) : 0;
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Row style={{ gap: 8 }}>
          <Drop size={18} color={c.accent} weight="fill" />
          <T size={17} w="medium">Agua</T>
        </Row>
        <T size={13} color={c.n400}>{d ? `${nf(d.ml / 1000, 2)} de ${nf(d.goal / 1000, 2)} l` : '—'}</T>
      </Row>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.n800, overflow: 'hidden' }} accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: d?.goal ?? 0, now: d?.ml ?? 0 }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: c.accent }} />
      </View>
      <T size={12} color={c.n500}>
        {d?.trained ? 'Hoy entrenaste: la meta suma medio litro. ' : ''}Es una estimación por tu peso; la comida también aporta agua.
      </T>
      <Row style={{ gap: 8 }}>
        <Button label="1 vaso (250 ml)" icon={Plus} disabled={!d || busy} onPress={() => act(() => kova.food.water.add(today, 250))} />
        {d?.last_id ? (
          <Button variant="ghost" label="Deshacer" icon={ArrowCounterClockwise} disabled={busy} onPress={() => act(() => kova.food.water.remove(d.last_id!))} />
        ) : null}
      </Row>
    </Card>
  );
}
