import { describe, expect, it } from 'vitest';
import { addDays, keyToDate } from '../clinic';
import type { Episode } from '../types';
import { forecast, predictLogistic, trainLogistic } from './forecast';
import { findPatterns } from './patterns';
import { LIT, personalTriggers } from './triggers';
import type { DayInfo } from '../types';
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

  it('forecast disponibile dal primo giorno, basato su dati generali', () => {
    const f = forecast(ctx([], new Date('2026-04-01T12:00:00')));
    expect(f.available).toBe(true);
    expect(f.basis).toBe('generale');
    expect(f.today!).toBeGreaterThan(0.03);
    expect(f.today!).toBeLessThan(0.4);
    expect(f.reason).toMatch(/dati generali/);
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

describe('personalTriggers', () => {
  it('senza dati resta sul prior della letteratura', () => {
    const r = personalTriggers(ctx([], new Date('2026-04-01T12:00:00')));
    const sleep = r.find((x) => x.id === 'sleep_poco')!;
    expect(sleep.basis).toBe('generale');
    expect(sleep.exposedDays).toBe(0);
    expect(sleep.rr).toBeCloseTo(LIT.sleep_poco.rr, 1);
    expect(sleep.low).toBeLessThan(sleep.rr);
    expect(sleep.high).toBeGreaterThan(sleep.rr);
  });

  it('impara che dormire poco precede gli attacchi', () => {
    const eps: Episode[] = [];
    const days: DayInfo[] = [];
    let k = '2026-01-01';
    for (let i = 0; i < 150; i++, k = addDays(k, 1)) {
      const before = i % 6 === 4; // la notte prima dell'attacco: sonno scarso
      if (i % 6 === 5) eps.push(ep(`${k}T10:00:00`));
      days.push({ date: k, checkin: { at: `${k}T08:00:00`, sleep: before ? 'poco' : 'ok', stress: 'medio' } });
    }
    const c = ctx(eps, new Date(`${k}T12:00:00`));
    c.days = days;
    const sleep = personalTriggers(c).find((x) => x.id === 'sleep_poco')!;
    expect(sleep.rr).toBeGreaterThan(1.5);
    expect(sleep.basis).not.toBe('generale');
    expect(sleep.exposedDays).toBeGreaterThan(20);
  });
});
