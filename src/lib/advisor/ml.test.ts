import { describe, expect, it } from 'vitest';
import { addDays, keyToDate } from '../clinic';
import type { Episode } from '../types';
import { activityOf, flagOf } from '../catalog';
import { dailyPlan, weeklyGoals } from './coach';
import { forecast, predictLogistic, riskFactorsToday, trainLogistic } from './forecast';
import { findPatterns } from './patterns';
import { LIT, buildTimeline, exposureOf, personalTriggers } from './triggers';
import type { CheckIn } from '../types';
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

describe('movimento', () => {
  it('converte il vecchio sì/no', () => {
    expect(activityOf({ at: '', exercise: true })).toBe('moderata');
    expect(activityOf({ at: '', exercise: false })).toBe('nessuna');
    expect(activityOf({ at: '', activity: 'intensa', exercise: false })).toBe('intensa');
    expect(activityOf({ at: '' })).toBeUndefined();
  });

  /** 150 giorni: sforzo intenso ogni 6 giorni, attacco il giorno dopo; negli altri giorni movimento a rotazione.
   *  Attacco alle 21:00, dopo il check-in delle 20:00: il movimento del giorno d'attacco resta noto. */
  const intenseData = () => {
    const eps: Episode[] = [];
    const days: DayInfo[] = [];
    let k = '2026-01-01';
    const other = ['nessuna', 'leggera', 'moderata'] as const;
    for (let i = 0; i < 150; i++, k = addDays(k, 1)) {
      if (i % 6 === 5) eps.push(ep(`${k}T21:00:00`));
      const activity = i % 6 === 4 ? 'intensa' : other[i % 3];
      days.push({ date: k, checkin: { at: `${k}T20:00:00`, sleep: 'ok', stress: 'medio', activity } });
    }
    const c = ctx(eps, new Date(`${k}T12:00:00`));
    c.days = days;
    return { c, k };
  };

  it('impara che lo sforzo intenso precede gli attacchi', () => {
    const { c } = intenseData();
    const r = personalTriggers(c);
    const intense = r.find((x) => x.id === 'exercise_intensa')!;
    expect(intense.rr).toBeGreaterThan(1.5);
    expect(intense.basis).not.toBe('generale');
    // "Niente movimento" non è legato agli attacchi in questi dati: non deve salire
    expect(r.find((x) => x.id === 'no_exercise')!.rr).toBeLessThan(1.3);
  });

  it('forecast: dopo uno sforzo intenso domani è più a rischio', () => {
    const { c, k } = intenseData();
    const past = c.days;
    const todayWith = (activity: 'moderata' | 'intensa') => {
      c.days = [...past, { date: k, checkin: { at: `${k}T08:00:00`, sleep: 'ok', stress: 'medio', activity } }];
      return forecast(c).tomorrow!;
    };
    expect(todayWith('intensa')).toBeGreaterThan(todayWith('moderata'));
  });

  it('fattori di oggi: sforzo intenso e niente movimento', () => {
    const now = new Date('2026-04-01T20:00:00');
    const c = ctx([], now);
    c.days = [{ date: '2026-04-01', checkin: { at: '2026-04-01T20:00:00', activity: 'intensa' } }];
    expect(riskFactorsToday(c).map((f) => f.id)).toContain('exercise_intensa');
    c.days = [{ date: '2026-04-01', checkin: { at: '2026-04-01T20:00:00', exercise: false } }];
    expect(riskFactorsToday(c).map((f) => f.id)).toContain('no_exercise');
  });
});

describe('causalita inversa', () => {
  /** 150 giorni, attacco alle 10:00 ogni 6 giorni. Nei giorni d'attacco "pasto saltato" e "poco sonno". */
  const attackDayData = (opts: { mealsAt?: string; at: string; withTimes: boolean }) => {
    const eps: Episode[] = [];
    const days: DayInfo[] = [];
    let k = '2026-01-01';
    for (let i = 0; i < 150; i++, k = addDays(k, 1)) {
      const attack = i % 6 === 5;
      if (attack) eps.push(ep(`${k}T10:00:00`));
      const checkin: CheckIn = { at: `${k}T${opts.at}:00`, sleep: attack ? 'poco' : 'ok', stress: 'medio', meals: attack ? 'saltato' : 'regolari' };
      if (opts.withTimes) checkin.times = { sleep: `${k}T07:30:00`, stress: `${k}T07:30:00`, meals: `${k}T${opts.mealsAt}:00` };
      days.push({ date: k, checkin });
    }
    const c = ctx(eps, new Date(`${k}T12:00:00`));
    c.days = days;
    return { c, k };
  };

  it('fattore registrato dopo l\'inizio dell\'attacco: non noto', () => {
    const { c } = attackDayData({ mealsAt: '20:00', at: '20:00', withTimes: true });
    const r = personalTriggers(c);
    const meals = r.find((x) => x.id === 'meals_saltato')!;
    expect(meals.exposedDays).toBe(0);
    expect(meals.rr).toBeCloseTo(LIT.meals_saltato.rr, 1);
    // Il sonno riguarda la notte prima: resta valido anche se segnato dopo
    expect(r.find((x) => x.id === 'sleep_poco')!.exposedDays).toBeGreaterThan(20);
  });

  it('fattore registrato prima dell\'inizio dell\'attacco: usato', () => {
    const { c } = attackDayData({ mealsAt: '08:00', at: '20:00', withTimes: true });
    const meals = personalTriggers(c).find((x) => x.id === 'meals_saltato')!;
    expect(meals.exposedDays).toBeGreaterThan(20);
    expect(meals.rr).toBeGreaterThan(1.5);
  });

  it('check-in vecchi senza times: si usa at (conservativo)', () => {
    const late = personalTriggers(attackDayData({ at: '20:00', withTimes: false }).c).find((x) => x.id === 'meals_saltato')!;
    expect(late.exposedDays).toBe(0);
    const early = personalTriggers(attackDayData({ at: '08:00', withTimes: false }).c).find((x) => x.id === 'meals_saltato')!;
    expect(early.exposedDays).toBeGreaterThan(20);
  });

  it('forecast: un fattore che è solo conseguenza dell\'attacco non alza il rischio', () => {
    const { c, k } = attackDayData({ mealsAt: '20:00', at: '20:00', withTimes: true });
    const past = c.days;
    const todayWith = (meals: 'regolari' | 'saltato') => {
      c.days = [...past, { date: k, checkin: { at: `${k}T11:00:00`, sleep: 'ok', stress: 'medio', meals } }];
      return forecast(c).today!;
    };
    // Al più l'effetto del prior della letteratura (rr 1.5), non quello appreso dalla causalità inversa
    expect(todayWith('saltato') / todayWith('regolari')).toBeLessThan(1.6);
  });

  it('exposureOf: senza attacco nel giorno non toglie nulla; il vecchio exercise diventa activity', () => {
    const old: CheckIn = { at: '2026-03-01T21:00:00', sleep: 'ok', stress: 'alto', exercise: false, meals: 'saltato' };
    const x = exposureOf(old, NaN);
    expect(x.activity).toBe('nessuna');
    expect(x.exercise).toBeUndefined();
    expect(x.stress).toBe('alto');
    expect(x.alcohol).toBe(false); // check-in fatto: alcol non segnato = no
    expect(x.screens).toBeUndefined(); // chip nuovo, check-in vecchio: non noto
    const y = exposureOf(old, new Date('2026-03-01T15:00:00').getTime());
    expect(y.stress).toBeUndefined();
    expect(y.meals).toBeUndefined();
    expect(y.activity).toBeUndefined();
    expect(y.sleep).toBe('ok');
  });

  it('compatibilita: check-in vecchi (exercise, senza times) funzionano in tutta la pipeline', () => {
    const eps: Episode[] = [];
    const days: DayInfo[] = [];
    let k = '2026-01-01';
    for (let i = 0; i < 90; i++, k = addDays(k, 1)) {
      if (i % 7 === 3) eps.push(ep(`${k}T15:00:00`));
      days.push({ date: k, checkin: { at: `${k}T09:00:00`, sleep: 'ok', stress: 'medio', exercise: i % 2 === 0 } });
    }
    const c = ctx(eps, new Date(`${k}T12:00:00`));
    c.days = days;
    const tl = buildTimeline(c);
    expect(tl.exposure.filter(Boolean).length).toBe(90);
    const r = personalTriggers(c, tl);
    expect(r.find((x) => x.id === 'no_exercise')!.exposedDays).toBeGreaterThan(30);
    expect(r.find((x) => x.id === 'screens')!.exposedDays).toBe(0);
    const f = forecast(c);
    expect(f.today!).toBeGreaterThan(0);
    expect(f.today!).toBeLessThan(1);
  });
});

describe('chip sì/no e fattori nuovi', () => {
  it('flagOf: non toccato = no solo a check-in fatto; chip nuovi solo con times', () => {
    expect(flagOf({ at: '', sleep: 'ok' }, 'alcohol')).toBeUndefined();
    expect(flagOf({ at: '', sleep: 'ok', stress: 'medio' }, 'alcohol')).toBe(false);
    expect(flagOf({ at: '', sleep: 'ok', stress: 'medio' }, 'screens')).toBeUndefined();
    expect(flagOf({ at: '', sleep: 'ok', stress: 'medio', times: {} }, 'screens')).toBe(false);
    expect(flagOf({ at: '', screens: true }, 'screens')).toBe(true);
    expect(flagOf(undefined, 'alcohol')).toBeUndefined();
  });

  it('impara schermi e orari del sonno; fattori di oggi e coach', () => {
    const eps: Episode[] = [];
    const days: DayInfo[] = [];
    let k = '2026-01-01';
    for (let i = 0; i < 150; i++, k = addDays(k, 1)) {
      if (i % 6 === 5) eps.push(ep(`${k}T15:00:00`));
      const before = i % 6 === 4;
      const t = `${k}T09:00:00`;
      const checkin: CheckIn = { at: t, sleep: 'ok', stress: 'medio', times: { sleep: t, stress: t } };
      if (before) Object.assign(checkin, { screens: true, sleepIrregular: true, times: { sleep: t, stress: t, screens: t, sleepIrregular: t } });
      days.push({ date: k, checkin });
    }
    const c = ctx(eps, new Date(`${k}T12:00:00`));
    c.days = days;
    const r = personalTriggers(c);
    const screens = r.find((x) => x.id === 'screens')!;
    const irr = r.find((x) => x.id === 'sleep_irregolare')!;
    expect(screens.rr).toBeGreaterThan(1.3);
    expect(irr.rr).toBeGreaterThan(1.3);
    expect(screens.exposedDays).toBe(25);

    c.days = [...days, { date: k, checkin: { at: `${k}T09:00:00`, sleep: 'ok', stress: 'medio', screens: true, sleepIrregular: true, times: {} } }];
    const factors = riskFactorsToday(c);
    expect(factors.map((f) => f.id)).toEqual(expect.arrayContaining(['screens', 'sleep_irregolare']));
    const plan = dailyPlan(c, forecast(c), r, factors);
    const all = plan.actions.map((a) => a.text + ' ' + a.why).join(' ');
    expect(plan.actions.some((a) => a.id === 'sleep_irregolare' || a.id === 'screens')).toBe(true);
    expect(all).not.toMatch(/\d+\s?mg/i);
    expect(weeklyGoals(c, r).some((g) => g.id === 'sonno')).toBe(true);
  });
});
