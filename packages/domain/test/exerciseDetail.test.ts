import { describe, expect, it } from 'vitest';
import { exerciseImages, findCatalogMatch, hasHowTo } from '../src/index.js';
import { CATALOG_NAMES } from './catalogNames.js';

const catalog = CATALOG_NAMES.map((name, i) => ({ id: String(i), name }));
const match = (s: string) => findCatalogMatch(s, catalog)?.name ?? null;

describe('findCatalogMatch', () => {
  it('exact names, ignoring case and accents', () => {
    expect(match('press de banca')).toBe('Press de banca');
    expect(match('EXTENSION DE CUADRICEPS')).toBe('Extensión de cuádriceps');
  });
  it('close Spanish names', () => {
    expect(match('Press inclinado mancuerna')).toBe('Press inclinado con mancuernas');
    expect(match('Curl martillo con mancuernas')).toBe('Curl martillo');
    expect(match('Remo con barra T')).toBe('Remo en T');
    expect(match('T-bar row')).toBe('Remo en T');
    expect(match('Sentadilla')).toBe('Sentadilla con barra');
  });
  it('English and gym slang', () => {
    expect(match('Back squat')).toBe('Sentadilla con barra');
    expect(match('Front squat')).toBe('Sentadilla frontal');
    expect(match('Lat pulldown')).toBe('Jalón al pecho');
    expect(match('Dumbbell bench press')).toBe('Press de banca con mancuernas');
    expect(match('Bench press')).toBe('Press de banca');
    expect(match('Seated cable row')).toBe('Remo sentado en polea');
    expect(match('Triceps pushdown')).toBe('Extensión de tríceps en polea');
    expect(match('Hip thrust')).toBe('Hip thrust con barra');
    expect(match('Serrucho')).toBe('Remo con mancuerna a un brazo');
  });
  it('null when unsure', () => {
    expect(match('Press')).toBeNull();
    expect(match('Ejercicio raro de la abuela')).toBeNull();
    expect(match('')).toBeNull();
  });
});

describe('exerciseImages / hasHowTo', () => {
  const media = [
    { kind: 'image', ref: 'exercise-media/press-banca/0.jpg' },
    { kind: 'animation', ref: 'gym-mannequin:bench' },
    { kind: 'image', ref: 'https://evil.example/x.jpg' },
  ];
  it('public URLs for our bucket only', () => {
    expect(exerciseImages(media, 'https://abc.supabase.co/')).toEqual(['https://abc.supabase.co/storage/v1/object/public/exercise-media/press-banca/0.jpg']);
    expect(exerciseImages(null, 'https://abc.supabase.co')).toEqual([]);
  });
  it('has content with steps, cues or images', () => {
    expect(hasHowTo({}, [])).toBe(false);
    expect(hasHowTo({ steps: ['a'] }, [])).toBe(true);
    expect(hasHowTo({}, media)).toBe(true);
  });
});
