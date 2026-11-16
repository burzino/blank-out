import { describe, expect, it } from 'vitest';
import { addDays, keyToDate } from '../clinic';
import type { Episode } from '../types';
import { forecast, predictLogistic, trainLogistic } from './forecast';
import { findPatterns } from './patterns';
import type { AdvisorContext } from './types';

const ep = (start: string, hours = 6): Episode => ({
  id: Math.random().toString(36),
  start,
  end: new Date(new Date(start).getTime() + hours * 3600000).toISOString(),
  intensity: 6,
  locations: [],
  quality: [],
  symptoms: [],
  autonomic: [],
  aura: [],
  triggers: [],
  meds: [],
  redFlags: [],
  notes: '',
  createdAt: '',
  updatedAt: ''
});

const ctx = (episodes: Episode[], now: Date): AdvisorContext => ({
  episodes: [...episodes].reverse(),
  days: [],
  questionnaires: [],
  prophylaxis: [],
  medications: [],
  now
});

describe('regressione logistica', () => {
  it('impara che il lunedì è a rischio', () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 280; i++) {
      const monday = i % 7 === 0 ? 1 : 0;
      X.push([monday * 2.4 - 0.4, Math.sin(i)]); // feature lunedì (circa standardizzata) + rumore
      y.push(monday && i % 14 !== 7 ? 1 : 0);
    }
    const m = trainLogistic(X, y);
    expect(predictLogistic(m, [2, 0])).toBeGreaterThan(predictLogistic(m, [-0.4, 0]) * 3);
    expect(m.w[0]).toBeGreaterThan(Math.abs(m.w[1]));
  });

  it('forecast: domani lunedì è più a rischio di oggi domenica', () => {
    const eps: Episode[] = [];
    let k = '2026-03-02'; // lunedì
    for (let i = 0; i < 20; i++, k = addDays(k, 7)) eps.push(ep(`${k}T09:00:00`));
    // ultima domenica dopo l'ultimo lunedì registrato
    const sunday = keyToDate(addDays(k, -1));
    sunday.setHours(12);
    const f = forecast(ctx(eps, sunday));
    expect(f.available).toBe(true);
    expect(f.tomorrow!).toBeGreaterThan(f.today!);
  });

  it('forecast non disponibile con pochi dati', () => {
    const eps = [ep('2026-03-02T09:00:00'), ep('2026-03-10T09:00:00'), ep('2026-03-20T09:00:00')];
    const f = forecast(ctx(eps, new Date('2026-04-01T12:00:00')));
    expect(f.available).toBe(false);
    expect(f.reason).toMatch(/almeno 60 giorni/);
  });
});

describe('findPatterns', () => {
  it('individua la fascia oraria dominante', () => {
    const eps: Episode[] = [];
    let k = '2026-01-03';
    for (let i = 0; i < 16; i++, k = addDays(k, 5)) eps.push(ep(`${k}T${i % 8 === 7 ? '20' : '07'}:30:00`));
    const ps = findPatterns(ctx(eps, new Date('2026-04-01T12:00:00')));
    const p = ps.find((x) => x.id === 'fascia-oraria');
    expect(p?.title).toMatch(/mattino/);
    expect(p?.chart?.length).toBe(4);
  });
});
