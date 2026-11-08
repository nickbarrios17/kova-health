/**
 * Design tokens: Nocturno Vital (docs/design/tokens.json). The original keys come from
 * design/prototypes/nocturne.css and keep their names and values; new roles are added next to them.
 */
export const c = {
  bg: '#161826',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',
  divider: 'rgba(233,233,237,0.16)',
  n200: '#e4e7f5',
  n300: '#cfd3e5',
  n400: '#b2b6ca',
  n500: '#9397ab',
  n600: '#75798c',
  n700: '#595d6c',
  n800: '#3f424d',
  n900: '#292b31',
  a100: '#f5f4ff',
  a200: '#e7e5fe',
  a300: '#d2cefd',
  a700: '#5d5294',
  a800: '#423a6a',
  a900: '#2b2741',
  accentSoft: 'rgba(145,132,217,0.16)',
  ok: '#6FD6A3',
  warn: '#EFC173',
  crit: '#F08A78',

  // Nocturno Vital (new)
  raised: '#2C2F3F',
  navBg: '#1C1E2C',
  a400: '#b5abfc', // every violet text and the focus ring
  a700Hover: '#6B60A8',
  a700Pressed: '#4E457E',
  accentSoftSolid: '#2A2843',
  track: '#3A3466',
  okSoft: '#1D3A2E',
  warnSoft: '#3A3020',
  critSoft: '#3D2522',
  chartMuted: '#6B6F84',
  chartEmpty: '#3A3D4C',
  skeleton: '#2C2F3F',
  borderSubtle: 'rgba(233,233,237,0.08)',
  borderStrong: 'rgba(233,233,237,0.24)',
  scrim: 'rgba(10,11,18,0.70)',
  white: '#ffffff',
} as const;

/** Original radii (4/8/14), kept as aliases. */
export const r = { sm: 4, md: 8, lg: 14 } as const;

/** Nocturno Vital radii. */
export const rad = { badge: 6, control: 12, button: 14, card: 18, lg: 16, xl: 20, sheet: 24, pill: 999 } as const;

/** Spacing scale (dp). */
export const sp = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

/** Type scale for phones (dp), with line height as a multiplier. */
export const typeScale = {
  display: { size: 36, lh: 1.0, w: 'semibold' },
  title1: { size: 26, lh: 1.15, w: 'semibold' },
  metric: { size: 24, lh: 1.1, w: 'semibold' },
  title2: { size: 17, lh: 1.2, w: 'semibold' },
  title3: { size: 17, lh: 1.3, w: 'semibold' },
  body: { size: 15, lh: 1.55, w: 'regular' },
  bodyStrong: { size: 15, lh: 1.45, w: 'medium' },
  label: { size: 13, lh: 1.4, w: 'medium' },
  caption: { size: 12, lh: 1.4, w: 'regular' },
  axis: { size: 11, lh: 1.2, w: 'medium' },
} as const;

/** Touch targets (dp). */
export const touch = { min: 48, primary: 52, icon: 44 } as const;

export const motion = { fast: 120, base: 200, slow: 320, skeleton: 1200, toast: 3000 } as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;
