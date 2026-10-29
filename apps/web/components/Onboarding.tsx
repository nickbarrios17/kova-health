'use client';
/**
 * Mandatory first run (and "Recalcular meta"): name and unit, body data, activity and goal, then the
 * estimated daily target (energyTarget in @kova/domain), accepted as is or typed by hand.
 */
import {
  ACTIVITY_LABEL, ageFromBirthYear, energyTarget, fromDisplayWeight, GOAL_HINT, GOAL_LABEL, goalHasPace, localDate, newId, PACE_ADJUST, PACE_LABEL,
  resolveBodyFat, RMR_METHOD_LABEL, SEX_LABEL, toDisplayWeight, KovaError, type ActivityLevel, type GoalPace, type Sex, type WeightGoal,
} from '@kova/domain';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { kova } from '@/lib/client';
import { nf } from '@/lib/format';
import { useSession } from '@/lib/session';

type Step = 1 | 2 | 3;

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || Number.isNaN(v) ? null : v;
};

function Choice<V extends string>({ name, label, options, value, onChange }: {
  name: string; label: string; options: Array<[V, string, string?]>; value: V | null; onChange: (v: V) => void;
}) {
  return (
    <fieldset className="kova-choice-group">
      <legend>{label}</legend>
      <div className="kova-choices">
        {options.map(([v, title, hint]) => (
          <label key={v} className={'kova-choice' + (hint ? ' kova-choice-wide' : '')}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span>{title}</span>
            {hint ? <small>{hint}</small> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Onboarding({ onClose }: { onClose?: () => void }) {
  const { prefs, setUnit, reload } = useSession();
  const p = prefs!;
  const units = p.weight_unit;
  const today = localDate(new Date(), p.time_zone);

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(p.display_name ?? '');
  const [birthYear, setBirthYear] = useState(p.profile.birth_year ? String(p.profile.birth_year) : '');
  const [height, setHeight] = useState(p.profile.height_cm ? String(p.profile.height_cm) : '');
  const [weight, setWeight] = useState(p.lastWeightKg != null ? String(units === 'kg' ? p.lastWeightKg : toDisplayWeight(p.lastWeightKg, 'lb')) : '');
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
    kova().body.composition().then((c) => {
      const recent = c.fat && (Date.now() - Date.parse(c.fat.measuredAt)) / 86_400_000 <= 30 ? c.fat : null;
      const str = (v: number | undefined) => (v == null ? '' : String(v));
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (step === 1) return setStep(2);
    if (step === 2) {
      if (step2Error) return setError(step2Error);
      setCustom({ kcal: String(target!.kcal), protein: String(target!.proteinG), carbs: String(target!.carbsG), fat: String(target!.fatG) });
      return setStep(3);
    }
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
        await kova().body.record(changed.map((r) => ({ id: newId(), metric: r.metric, value: num(r.text)!, measured_at: at, time_zone: p.time_zone })));
      }
      await kova().profile.completeOnboarding({
        displayName: name.trim() || null, birthYear: by!, heightCm: h!, weightKg: Math.round(weightKg! * 10) / 10, sex: sex!,
        activity: activity!, goal: goal!, pace: goalHasPace(goal) ? pace : null, measurementId,
        kcal: Math.round(vals.kcal), proteinG: Math.round(vals.proteinG!), carbsG: Math.round(vals.carbsG!), fatG: Math.round(vals.fatG!),
        isEstimated: !manual, timeZone: p.time_zone,
      });
      await reload();
      onClose?.();
    } catch (err) {
      setError(err instanceof KovaError ? err.message : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const paceHint = (g: 'lose' | 'gain', k: GoalPace) => (g === 'lose' ? '−' : '+') + Math.round(Math.abs(PACE_ADJUST[g][k]) * 100) + '%';

  return (
    <div className="kova-auth">
      <form className="kova-auth-card" style={{ width: 'min(520px, 100%)' }} onSubmit={submit} noValidate>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>Paso {step} de 3</span>
          {onClose ? <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button> : null}
        </div>

        {step === 1 ? (
          <>
            <h1 style={{ fontSize: 24, margin: 0 }}>Bienvenido a Kova Health</h1>
            <p style={{ margin: 0, color: 'var(--color-neutral-400)', fontSize: 14 }}>Antes de empezar, unos datos para ajustar la app a vos. Lleva un minuto.</p>
            <div className="field">
              <label htmlFor="ob-name">¿Cómo te llamamos?</label>
              <input id="ob-name" className="input" value={name} maxLength={80} placeholder="Tu nombre" autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
            </div>
            <Choice name="unit" label="Unidad de peso" value={units} onChange={(u) => { setUnit(u); setWeight(''); }}
              options={[['kg', 'Kilos (kg)'], ['lb', 'Libras (lb)']]} />
          </>
        ) : step === 2 ? (
          <>
            <h1 style={{ fontSize: 22, margin: 0 }}>Tus datos</h1>
            <p style={{ margin: 0, color: 'var(--color-neutral-400)', fontSize: 14 }}>Los usamos para estimar cuánta energía gastás al día.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div className="field">
                <label htmlFor="ob-year">Año de nacimiento</label>
                <input id="ob-year" className="input" inputMode="numeric" maxLength={4} placeholder="1996" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ob-height">Altura (cm)</label>
                <input id="ob-height" className="input" inputMode="numeric" maxLength={3} placeholder="175" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ob-weight">Peso actual ({units})</label>
                <input id="ob-weight" className="input" inputMode="decimal" maxLength={6} placeholder={units === 'kg' ? '78' : '172'} value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <Choice name="sex" label="Sexo" value={sex} onChange={setSex} options={[['male', SEX_LABEL.male], ['female', SEX_LABEL.female]]} />
            <Choice name="activity" label="Actividad diaria" value={activity} onChange={setActivity}
              options={(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((k) => [k, ACTIVITY_LABEL[k][0], ACTIVITY_LABEL[k][1]])} />
            <Choice name="goal" label="Objetivo" value={goal}
              onChange={(g) => { setGoal(g); if (!goalHasPace(g)) setPace(null); else if (!pace) setPace('moderate'); }}
              options={(['lose', 'maintain', 'gain', 'recomp'] as WeightGoal[]).map((k) => [k, GOAL_LABEL[k], GOAL_HINT[k]])} />
            {goalHasPace(goal) ? (
              <Choice name="pace" label="Ritmo" value={pace} onChange={setPace}
                options={(['light', 'moderate', 'aggressive'] as GoalPace[]).map((k) => [k, PACE_LABEL[k] + ' · ' + paceHint(goal, k)])} />
            ) : null}
            <fieldset className="kova-choice-group" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
              <legend style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', float: 'left', marginBottom: 2 }}>Composición corporal (opcional)</legend>
              <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', clear: 'both' }}>
                Con tu % de grasa el cálculo usa tu masa magra, que es más preciso. Si no lo sabés, con un centímetro: cuello, cintura a la altura del ombligo{sex === 'female' ? ' y cadera' : ''}.
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                <div className="field">
                  <label htmlFor="ob-fat">% de grasa</label>
                  <input id="ob-fat" className="input" inputMode="decimal" maxLength={4} placeholder="18" value={fatPct} onChange={(e) => setFatPct(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="ob-neck">Cuello (cm)</label>
                  <input id="ob-neck" className="input" inputMode="decimal" maxLength={5} value={neck} onChange={(e) => setNeck(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="ob-waist">Cintura (cm)</label>
                  <input id="ob-waist" className="input" inputMode="decimal" maxLength={5} value={waist} onChange={(e) => setWaist(e.target.value)} />
                </div>
                {sex === 'female' ? (
                  <div className="field">
                    <label htmlFor="ob-hip">Cadera (cm)</label>
                    <input id="ob-hip" className="input" inputMode="decimal" maxLength={5} value={hip} onChange={(e) => setHip(e.target.value)} />
                  </div>
                ) : null}
              </div>
              {loaded?.fatFromDevice && fatPct === loaded.fat ? <span style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>El % de grasa lo midió tu reloj (Health Connect).</span> : null}
              {bodyFat?.source === 'tape' ? <span style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>Según tus medidas: {String(bodyFat.pct).replace('.', ',')} % de grasa (estimación).</span> : null}
            </fieldset>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, margin: 0 }}>Tu meta diaria</h1>
            <p style={{ margin: 0, color: 'var(--color-neutral-400)', fontSize: 14 }}>Una estimación según tus datos. Podés cambiarla cuando quieras.</p>
            {!manual ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
                <div>
                  <div style={{ fontSize: 40, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{nf(target!.kcal, 0)}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>kcal al día · estimación</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {([['Proteína', target!.proteinG], ['Carbos', target!.carbsG], ['Grasa', target!.fatG]] as const).map(([l, v]) => (
                    <div key={l} style={{ padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
                      <div style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>{l}</div>
                      <div style={{ fontSize: 17, fontWeight: 500 }}>{v} g</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                  Gasto en reposo {nf(target!.bmr, 0)} kcal ({RMR_METHOD_LABEL[target!.method]}{bodyFat ? ', ' + String(bodyFat.pct).replace('.', ',') + ' % de grasa' : ''}) × actividad = {nf(target!.tdee, 0)} kcal
                  {target!.adjust ? (target!.adjust < 0 ? ' − ' : ' + ') + Math.round(Math.abs(target!.adjust) * 100) + '% por tu objetivo' : ''}.
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                  Es tu meta de un día típico. Cada día se ajusta a lo que te moviste: los días con más pasos o entrenamiento tenés más margen.
                </div>
                {target!.floored ? (
                  <div style={{ fontSize: 12, color: 'var(--kova-warn)' }}>Subimos la meta al mínimo recomendado sin supervisión profesional.</div>
                ) : null}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
                {([['kcal', 'Calorías (kcal)'], ['protein', 'Proteína (g)'], ['carbs', 'Carbos (g)'], ['fat', 'Grasa (g)']] as const).map(([k, l]) => (
                  <div key={k} className="field">
                    <label htmlFor={'ob-' + k}>{l}</label>
                    <input id={'ob-' + k} className="input" inputMode="numeric" maxLength={5} value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(!manual)}>
              <i className={manual ? 'ph ph-calculator' : 'ph ph-pencil-simple'} />{manual ? 'Usar la estimación' : 'Editar a mano'}
            </button>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-400)' }}>Es una estimación general, no una indicación médica.</p>
          </>
        )}

        {error && (
          <div className="kova-error" role="alert">
            <i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)', fontSize: 16, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {step > 1 ? <button type="button" className="btn btn-secondary" onClick={() => { setError(null); setStep((step - 1) as Step); }}>Atrás</button> : null}
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
            {busy ? <><i className="ph ph-circle-notch kova-spin" />Guardando…</> : step < 3 ? 'Continuar' : 'Guardar y empezar'}
          </button>
        </div>
        {!onClose ? (
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'center', fontSize: 13 }} onClick={() => kova().auth.signOut()}>
            <i className="ph ph-sign-out" />Cerrar sesión
          </button>
        ) : null}
      </form>
    </div>
  );
}
