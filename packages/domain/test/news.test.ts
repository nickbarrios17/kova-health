import { describe, expect, it } from 'vitest';
import { newsDate, newsFor, newsId, unseenNews, type NewsDay } from '../src/index.js';

const days: NewsDay[] = [
  { date: '2026-10-30', items: [{ title: 'A' }, { title: 'Solo prueba', preview: true }] },
  { date: '2026-10-20', items: [{ title: 'Vieja' }] },
  { date: '2026-10-10', items: [{ title: 'Solo prueba', preview: true }] },
];

describe('novedades', () => {
  it('preview items only in the test app', () => {
    expect(newsFor(false, days).map((d) => [d.date, d.items.length])).toEqual([['2026-10-30', 1], ['2026-10-20', 1]]);
    expect(newsFor(true, days)).toHaveLength(3);
  });
  it('first time on a device: only the last week', () => {
    expect(unseenNews(newsFor(false, days), null, '2026-10-30').map((d) => d.date)).toEqual(['2026-10-30']);
  });
  it('after that: whatever was not seen, and a day that gained items counts again', () => {
    const shown = newsFor(false, days);
    expect(unseenNews(shown, shown.map(newsId), '2026-11-01')).toEqual([]);
    const grown = newsFor(true, days);
    expect(unseenNews(grown, shown.map(newsId), '2026-11-01').map((d) => d.date)).toEqual(['2026-10-30', '2026-10-10']);
  });
  it('dates in Spanish', () => {
    expect(newsDate('2026-10-30')).toBe('Viernes 30 de octubre');
  });
});
