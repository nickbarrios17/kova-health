import { describe, expect, it } from 'vitest';
import { composeReport, reportOptions, searchUsers } from '../src/index.js';

describe('report options', () => {
  it('specific options first, then the general ones', () => {
    const o = reportOptions('exercise');
    expect(o[0]!.category).toBe('model3d');
    expect(o.at(-1)!.key).toBe('idea');
    expect(reportOptions('other').map((x) => x.key)).toEqual(['crash', 'looks_wrong', 'idea']);
  });
  it('message = chosen options + comment; category from the first option', () => {
    const [a, b] = reportOptions('session');
    expect(composeReport([a!, b!], '  Pasó en la 3ª serie ')).toEqual({ category: 'bug', message: '• No se guardó una serie\n• El descanso o el cronómetro fallan\nPasó en la 3ª serie' });
    expect(composeReport([], 'Solo texto', 'idea')).toEqual({ category: 'idea', message: 'Solo texto' });
  });
});

describe('admin search', () => {
  const u = (name: string, email: string) => ({ id: name, name, email, created_at: '', last_seen_at: null, workouts: 0, workouts_7d: 0, meals_7d: 0, reports: 0, is_admin: false, suspended: false, has_coach: false, students: 0 });
  it('matches name or email, ignoring case and spaces', () => {
    const list = [u('Nico', 'nico@x.com'), u('Ana', 'ana.gym@y.com')];
    expect(searchUsers(list, '  ')).toHaveLength(2);
    expect(searchUsers(list, 'GYM').map((x) => x.name)).toEqual(['Ana']);
    expect(searchUsers(list, 'nic').map((x) => x.name)).toEqual(['Nico']);
  });
});
