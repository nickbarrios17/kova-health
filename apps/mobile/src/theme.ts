/** Design tokens from design/prototypes/nocturne.css (dark theme) + the prototype's semantic colours. */
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
} as const;

export const r = { sm: 4, md: 8, lg: 14 } as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;
