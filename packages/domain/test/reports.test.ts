import { describe, expect, it } from 'vitest';
import { composeReport, reportOptions } from '../src/index.js';

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
