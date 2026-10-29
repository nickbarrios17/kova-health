import { describe, expect, it } from 'vitest';
import { animationFor, exerciseAnimation, exerciseImages, findCatalogMatch, hasHowTo, imagesFor } from '../src/index.js';
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

describe('imagesFor', () => {
  const url = 'https://abc.supabase.co';
  const cat = [
    { id: 'sys', name: 'Press de banca', short_name: 'Press banca', owner_id: null, media: [{ kind: 'image', ref: 'exercise-media/press-banca/0.jpg' }] },
    { id: 'own', name: 'Press plano', short_name: null, owner_id: 'u1', media: [] },
    { id: 'odd', name: 'Algo raro', short_name: null, owner_id: 'u1', media: [] },
  ];
  it('own images, else the matched catalog entry, else none', () => {
    expect(imagesFor('sys', cat, url)).toHaveLength(1);
    expect(imagesFor('own', cat, url)).toEqual([url + '/storage/v1/object/public/exercise-media/press-banca/0.jpg']);
    expect(imagesFor('odd', cat, url)).toEqual([]);
    expect(imagesFor('missing', cat, url)).toEqual([]);
  });
});

describe('exerciseAnimation', () => {
  it('reads the mannequin inputs and strips anything odd', () => {
    const media = [{ kind: 'image', ref: 'exercise-media/x/0.jpg' }, { kind: 'animation', ref: 'kova-mannequin', slug: 'barbell-squat', muscle: 'quads', equipment: 'barbell', category: '' }];
    expect(exerciseAnimation(media)).toEqual({ slug: 'barbell-squat', muscle: 'quads', equipment: 'barbell', category: '' });
    expect(exerciseAnimation([{ kind: 'animation', ref: 'kova-mannequin', slug: 'a"><script>', muscle: 'quads' }])?.slug).toBe('ascript');
    expect(exerciseAnimation([{ kind: 'animation', ref: 'gym-mannequin:squat' }])).toBeNull();
    expect(exerciseAnimation(null)).toBeNull();
  });
});

describe('animationFor', () => {
  const anim = { kind: 'animation', ref: 'kova-mannequin', slug: 'barbell-bench-press-medium-grip', muscle: 'pectorals', equipment: 'barbell', category: '' };
  const cat = [
    { id: 'sys', name: 'Press de banca', short_name: 'Press banca', owner_id: null, media: [anim] },
    { id: 'own', name: 'Press plano', short_name: null, owner_id: 'u1', media: [] },
    { id: 'odd', name: 'Algo raro', short_name: null, owner_id: 'u1', media: [] },
  ];
  it('own animation, else the matched catalog entry, else none', () => {
    expect(animationFor('sys', cat)?.slug).toBe('barbell-bench-press-medium-grip');
    expect(animationFor('own', cat)?.slug).toBe('barbell-bench-press-medium-grip');
    expect(animationFor('odd', cat)).toBeNull();
  });
});
