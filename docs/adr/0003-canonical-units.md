# ADR 0003 — Canonical units

**Status:** accepted

## Decision
Store **kg, metres, seconds, kcal and grams**. Never store display units. Conversion happens in `@kova/domain` (`toDisplayWeight`, `fromDisplayWeight`), using the user's `user_preferences.weight_unit`.

- Weight columns are `numeric(6,2)`, precise to 0.01 kg. That is enough to round-trip lb input: 225 lb → 102.06 kg → 225.0 lb.
- Display rounding follows the prototype: kg to 0.5, lb to 1. Plate steps are 2.5 kg and 5 lb (`weightStep`).

## Consequences
Changing a preference never rewrites data, and history stays comparable across devices with different settings.
