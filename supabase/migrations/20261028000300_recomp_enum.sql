-- Body recomposition goal (lose fat and gain muscle at the same time): maintenance-ish calories,
-- higher protein, no pace. The new enum value is added alone: Postgres cannot use a value in the
-- same transaction that adds it. Constraint and RPC changes are in 20261028000400_recomp_goal.sql.
alter type public.weight_goal add value if not exists 'recomp';
