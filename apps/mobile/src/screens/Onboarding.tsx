/**
 * Mandatory first run (and "Recalcular meta" from Progreso): name and unit, body data, activity
 * and goal, then the estimated daily target, which the user can accept or type by hand.
 */
import {
  ACTIVITY_LABEL, ageFromBirthYear, energyTarget, fromDisplayWeight, GOAL_HINT, GOAL_LABEL, goalHasPace, localDate, newId, nf, PACE_ADJUST, PACE_LABEL,
  resolveBodyFat, RMR_METHOD_LABEL, SEX_LABEL, toDisplayWeight, VidaError, type ActivityLevel, type GoalPace, type Sex, type WeightGoal,
  type WeightUnit,
} from '@vida/domain';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { vida } from '../client';
import { useSession, type Prefs } from '../session';
import { c, r } from '../theme';
import { Button, Card, ErrorNote, Field, Notice, Row, Seg, T } from '../ui';

type Step = 1 | 2 | 3;

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(v) ? null : v;
};

/** One-of-N choice as full-width tappable rows (null = nothing chosen yet). */
function Choice<V extends string>({ options, value, onChange, label }: {
  options: Array<[V, string, string?]>; value: V | null; onChange: (v: V) => void; label: string;
}) {
  return (
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <T size={12} color="rgba(233,233,237,0.7)">{label}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(([v, title, hint]) => {
          const on = v === value;
          return (
            <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ flexGrow: 1, flexBasis: hint ? '100%' : 0, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center',
                borderRadius: r.md, borderWidth: 1, borderColor: on ? c.accent : c.divider, backgroundColor: on ? c.accentSoft : c.surface }}>
              <T size={14} w={on ? 'medium' : 'regular'} color={on ? c.a200 : c.text}>{title}</T>
              {hint ? <T size={12} color={c.n400}>{hint}</T> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Onboarding({ onCancel }: { onCancel?: () => void }) {
  const { prefs, setUnit, reloadPrefs } = useSession();
  const p = prefs as Prefs;
  const units: WeightUnit = p.weight_unit;
  const today = localDate(new Date(), p.time_zone);

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(p.display_name ?? '');
  const [birthYear, setBirthYear] = useState(p.profile.birth_year ? String(p.profile.birth_year) : '');
  const [height, setHeight] = useState(p.profile.height_cm ? String(p.profile.height_cm) : '');
  const [weight, setWeight] = useState(p.lastWeightKg != null ? String(units === 'kg' ? p.lastWeightKg : toDisplayWeight(p.lastWeightKg, 'lb')).replace('.', ',') : '');
  const [sex, setSex] = useState<Sex | null>(p.profile.sex);
  const [activity, setActivity] = useState<ActivityLevel | null>(p.profile.activity_level);
  const [goal, setGoal] = useState<WeightGoal | null>(p.profile.weight_goal);
  const [pace, setPace] = useState<GoalPace | null>(p.profile.goal_pace);
  const [manual, setManual] = useState(false);
  const [custom, setCustom] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [measurementId] = useState(newId);
  // Optional body composition: a body fat % (from the watch or typed) or tape measurements.
  const [fatPct, setFatPct] = useState('');
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState('');
  const [hip, setHip] = useState('');
  const [loaded, setLoaded] = useState<{ fat: string; fatFromDevice: boolean; neck: string; waist: string; hip: string } | null>(null);
  useEffect(() => {
    vida.body.composition().then((c) => {
      const recent = c.fat && (Date.now() - Date.parse(c.fat.measuredAt)) / 86_400_000 <= 30 ? c.fat : null;
      const str = (v: number | undefined) => (v == null ? '' : String(v).replace('.', ','));
      const l = { fat: str(recent?.value), fatFromDevice: !!recent && recent.source !== 'manual', neck: str(c.neck?.value), waist: str(c.waist?.value), hip: str(c.hip?.value) };
      setLoaded(l);
      setFatPct(l.fat); setNeck(l.neck); setWaist(l.waist); setHip(l.hip);
    }).catch(() => undefined);
  }, []);

  const by = num(birthYear), h = num(height), wDisp = num(weight);
  const weightKg = wDisp == null ? null : fromDisplayWeight(wDisp, units);
  const age = by == null ? null : ageFromBirthYear(by, today);
  const bodyFat = resolveBodyFat({ sex, heightCm: h, typedPct: num(fatPct), neckCm: num(neck), waistCm: num(waist), hipCm: num(hip) });

  const step2Error = (() => {
    if (age == null || age < 14 || age > 100) return 'Revisa el año de nacimiento: necesitas tener entre 14 y 100 años.';
    if (h == null || h < 120 || h > 230) return 'La altura va en centímetros, entre 120 y 230.';
    if (weightKg == null || weightKg < 30 || weightKg > 300) return 'Revisa el peso.';
    if (!sex) return 'Elige tu sexo: la fórmula de energía cambia según el sexo.';
    if (!activity) return 'Elige tu nivel de actividad.';
    if (!goal) return 'Elige tu objetivo.';
    if (goalHasPace(goal) && !pace) return 'Elige un ritmo para tu objetivo.';
    if (fatPct.trim() && !(num(fatPct)! >= 3 && num(fatPct)! <= 60)) return 'El % de grasa va de 3 a 60.';
    return null;
  })();

  const target = useMemo(() => {
    if (step2Error) return null;
    return energyTarget({
      sex: sex!, age: age!, heightCm: h!, weightKg: weightKg!, activity: activity!, goal: goal!, pace: goalHasPace(goal) ? pace : null,
      bodyFatPct: bodyFat?.pct ?? null,
    });
  }, [step2Error, sex, age, h, weightKg, activity, goal, pace, bodyFat?.pct]);

  const next = () => {
    setError(null);
    if (step === 1) setStep(2);
    else if (step === 2) {
      if (step2Error) setError(step2Error);
      else {
        setCustom({ kcal: String(target!.kcal), protein: String(target!.proteinG), carbs: String(target!.carbsG), fat: String(target!.fatG) });
        setStep(3);
      }
    }
  };

  const save = async () => {
    setError(null);
    const t = target!;
    const vals = manual
      ? { kcal: num(custom.kcal), proteinG: num(custom.protein), carbsG: num(custom.carbs), fatG: num(custom.fat) }
      : { kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG };
    if (vals.kcal == null || vals.kcal < 800 || vals.kcal > 10000) return setError('Las calorías van entre 800 y 10.000.');
    if ([vals.proteinG, vals.carbsG, vals.fatG].some((v) => v == null || v < 0)) return setError('Completa proteína, carbohidratos y grasa.');
    setBusy(true);
    try {
      // Measurements the user typed or changed are saved too, so the daily target can use them later.
      const at = new Date().toISOString();
      const rows: Array<{ metric: 'body_fat_pct' | 'neck_cm' | 'waist_cm' | 'hip_cm'; text: string; was: string | undefined }> = [
        { metric: 'body_fat_pct', text: fatPct, was: loaded?.fat },
        { metric: 'neck_cm', text: neck, was: loaded?.neck },
        { metric: 'waist_cm', text: waist, was: loaded?.waist },
        { metric: 'hip_cm', text: hip, was: loaded?.hip },
      ];
      const changed = rows.filter((r) => r.text.trim() && r.text.trim() !== (r.was ?? '').trim() && num(r.text) != null);
      if (changed.length) {
        await vida.body.record(changed.map((r) => ({ id: newId(), metric: r.metric, value: num(r.text)!, measured_at: at, time_zone: p.time_zone })));
      }
      await vida.profile.completeOnboarding({
        displayName: name.trim() || null, birthYear: by!, heightCm: h!, weightKg: Math.round(weightKg! * 10) / 10, sex: sex!,
        activity: activity!, goal: goal!, pace: goalHasPace(goal) ? pace : null, measurementId,
        kcal: Math.round(vals.kcal), proteinG: Math.round(vals.proteinG!), carbsG: Math.round(vals.carbsG!), fatG: Math.round(vals.fatG!),
        isEstimated: !manual, timeZone: p.time_zone,
      });
      await reloadPrefs();
      onCancel?.();
    } catch (e) {
      setError(e instanceof VidaError ? e.message : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const paceHint = (g: 'lose' | 'gain', k: GoalPace) => (g === 'lose' ? '−' : '+') + Math.round(Math.abs(PACE_ADJUST[g][k]) * 100) + '%';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 18 }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={12} color={c.n500}>Paso {step} de 3</T>
          {onCancel ? <Button variant="ghost" label="Cancelar" onPress={onCancel} /> : null}
        </Row>

        {step === 1 ? (
          <>
            <View style={{ gap: 6 }}>
              <T size={26} w="medium">Bienvenido a VIDA</T>
              <T size={14} color={c.n400}>Antes de empezar, unos datos para ajustar la app a vos. Lleva un minuto.</T>
            </View>
            <Field label="¿Cómo te llamamos?" value={name} onChangeText={setName} placeholder="Tu nombre" autoCapitalize="words" maxLength={80} />
            <View style={{ gap: 6 }}>
              <T size={12} color="rgba(233,233,237,0.7)">Unidad de peso</T>
              <Seg options={[['kg', 'Kilos (kg)'], ['lb', 'Libras (lb)']]} value={units} onChange={(u) => { setUnit(u); setWeight(''); }} />
            </View>
          </>
        ) : step === 2 ? (
          <>
            <View style={{ gap: 6 }}>
              <T size={22} w="medium">Tus datos</T>
              <T size={14} color={c.n400}>Los usamos para estimar cuánta energía gastás al día.</T>
            </View>
            <Row style={{ gap: 10, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Field label="Año de nacimiento" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} placeholder="1996" /></View>
              <View style={{ flex: 1 }}><Field label="Altura (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} placeholder="175" /></View>
            </Row>
            <Field label={'Peso actual (' + units + ')'} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={6} placeholder={units === 'kg' ? '78' : '172'} />
            <Choice label="Sexo" value={sex} onChange={setSex} options={[['male', SEX_LABEL.male], ['female', SEX_LABEL.female]]} />
            <Choice label="Actividad diaria" value={activity} onChange={setActivity}
              options={(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((k) => [k, ACTIVITY_LABEL[k][0], ACTIVITY_LABEL[k][1]])} />
            <Choice label="Objetivo" value={goal} onChange={(g) => { setGoal(g); if (!goalHasPace(g)) setPace(null); else if (!pace) setPace('moderate'); }}
              options={(['lose', 'maintain', 'gain', 'recomp'] as WeightGoal[]).map((k) => [k, GOAL_LABEL[k], GOAL_HINT[k]])} />
            {goalHasPace(goal) ? (
              <Choice label="Ritmo" value={pace} onChange={setPace}
                options={(['light', 'moderate', 'aggressive'] as GoalPace[]).map((k) => [k, PACE_LABEL[k] + ' · ' + paceHint(goal, k)])} />
            ) : null}
            <Card style={{ gap: 10 }}>
              <T size={15} w="medium">Composición corporal (opcional)</T>
              <T size={12} color={c.n400}>
                Con tu % de grasa el cálculo usa tu masa magra, que es más preciso. Si no lo sabés, con un centímetro: cuello, cintura a la altura del ombligo{sex === 'female' ? ' y cadera' : ''}.
              </T>
              <Field label="% de grasa corporal" value={fatPct} onChangeText={setFatPct} keyboardType="decimal-pad" maxLength={4} placeholder="Ej.: 18"
                hint={loaded?.fatFromDevice && fatPct === loaded.fat ? 'Medido por tu reloj (Health Connect).' : undefined} />
              <Row style={{ gap: 8, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Field label="Cuello (cm)" value={neck} onChangeText={setNeck} keyboardType="decimal-pad" maxLength={5} /></View>
                <View style={{ flex: 1 }}><Field label="Cintura (cm)" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" maxLength={5} /></View>
                {sex === 'female' ? <View style={{ flex: 1 }}><Field label="Cadera (cm)" value={hip} onChangeText={setHip} keyboardType="decimal-pad" maxLength={5} /></View> : null}
              </Row>
              {bodyFat?.source === 'tape' ? <T size={12} color={c.a300}>Según tus medidas: {String(bodyFat.pct).replace('.', ',')} % de grasa (estimación).</T> : null}
            </Card>
          </>
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <T size={22} w="medium">Tu meta diaria</T>
              <T size={14} color={c.n400}>Una estimación según tus datos. Podés cambiarla cuando quieras.</T>
            </View>
            {!manual ? (
              <Card style={{ gap: 14 }}>
                <View>
                  <T size={40} w="medium">{nf(target!.kcal, 0)}</T>
                  <T size={13} color={c.n400}>kcal al día · estimación</T>
                </View>
                <Row style={{ gap: 8 }}>
                  {[['Proteína', target!.proteinG], ['Carbos', target!.carbsG], ['Grasa', target!.fatG]].map(([l, v]) => (
                    <View key={l as string} style={{ flex: 1, padding: 10, borderRadius: r.md, backgroundColor: c.bg }}>
                      <T size={11} color={c.n400}>{l}</T>
                      <T size={17} w="medium">{v} g</T>
                    </View>
                  ))}
                </Row>
                <T size={12} color={c.n400}>
                  Gasto en reposo {nf(target!.bmr, 0)} kcal ({RMR_METHOD_LABEL[target!.method]}{bodyFat ? ', ' + String(bodyFat.pct).replace('.', ',') + ' % de grasa' : ''}) × actividad = {nf(target!.tdee, 0)} kcal
                  {target!.adjust ? (target!.adjust < 0 ? ' − ' : ' + ') + Math.round(Math.abs(target!.adjust) * 100) + '% por tu objetivo' : ''}.
                </T>
                <T size={12} color={c.n400}>Es tu meta de un día típico. Cada día se ajusta a lo que te moviste: los días con más pasos o entrenamiento tenés más margen.</T>
                {target!.floored ? <Notice tone="warn" text="Subimos la meta al mínimo recomendado sin supervisión profesional." /> : null}
              </Card>
            ) : (
              <Card style={{ gap: 12 }}>
                <Field label="Calorías (kcal)" value={custom.kcal} onChangeText={(v) => setCustom({ ...custom, kcal: v })} keyboardType="number-pad" maxLength={5} />
                <Row style={{ gap: 8, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}><Field label="Proteína (g)" value={custom.protein} onChangeText={(v) => setCustom({ ...custom, protein: v })} keyboardType="number-pad" maxLength={4} /></View>
                  <View style={{ flex: 1 }}><Field label="Carbos (g)" value={custom.carbs} onChangeText={(v) => setCustom({ ...custom, carbs: v })} keyboardType="number-pad" maxLength={4} /></View>
                  <View style={{ flex: 1 }}><Field label="Grasa (g)" value={custom.fat} onChangeText={(v) => setCustom({ ...custom, fat: v })} keyboardType="number-pad" maxLength={4} /></View>
                </Row>
              </Card>
            )}
            <Button variant="ghost" label={manual ? 'Usar la estimación' : 'Editar a mano'} onPress={() => setManual(!manual)} style={{ alignSelf: 'flex-start' }} />
            <Notice text="Es una estimación general, no una indicación médica." />
          </>
        )}

        {error ? <ErrorNote message={error} /> : null}

        <View style={{ gap: 8, marginTop: 4 }}>
          {step < 3 ? <Button label="Continuar" onPress={next} /> : <Button label="Guardar y empezar" onPress={save} busy={busy} />}
          {step > 1 ? <Button variant="secondary" label="Atrás" onPress={() => { setError(null); setStep((step - 1) as Step); }} /> : null}
          {!onCancel ? <Button variant="ghost" label="Cerrar sesión" onPress={() => vida.auth.signOut()} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
