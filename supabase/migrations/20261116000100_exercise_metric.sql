-- Everything Samsung Health (and other apps) leave in Health Connect, beyond steps, sleep, weight,
-- resting pulse, HRV and body fat. The enum values go in their own migration: Postgres cannot use a
-- new enum value in the same transaction that adds it (the next migration uses them).
alter type public.health_metric add value if not exists 'exercise_session';    -- minutes; details: exercise_type, title, kcal
alter type public.health_metric add value if not exists 'total_energy_kcal';   -- interval
alter type public.health_metric add value if not exists 'floors';              -- interval
alter type public.health_metric add value if not exists 'heart_rate_bpm';      -- interval, average; details: min, max, samples
alter type public.health_metric add value if not exists 'blood_pressure_mmhg'; -- systolic; details: diastolic
alter type public.health_metric add value if not exists 'blood_glucose_mgdl';
alter type public.health_metric add value if not exists 'spo2_pct';
alter type public.health_metric add value if not exists 'respiratory_rate';    -- breaths per minute
alter type public.health_metric add value if not exists 'vo2max';              -- ml/kg/min
alter type public.health_metric add value if not exists 'hydration_ml';        -- interval
alter type public.health_metric add value if not exists 'skin_temp_delta_c';   -- interval, vs the person's baseline
alter type public.health_metric add value if not exists 'body_temp_c';

alter type public.body_metric add value if not exists 'body_water_kg';
alter type public.body_metric add value if not exists 'bone_mass_kg';
alter type public.body_metric add value if not exists 'height_cm';
alter type public.body_metric add value if not exists 'bmr_kcal';
