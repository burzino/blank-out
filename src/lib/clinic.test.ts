import { describe, expect, it } from 'vitest';
import { classify, computeStats, cycleCorrelation, hit6Impact, midasGrade, mohStatus, prophylaxisEfficacy } from './clinic';
import type { Episode } from './types';

const ep = (p: Partial<Episode>): Episode => ({
  id: Math.random().toString(36),
  start: '2026-03-10T08:00:00',
  end: '2026-03-10T16:00:00',
  intensity: 5,
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
  updatedAt: '',
  ...p
});

const now = new Date('2026-04-01T12:00:00');

describe('classify', () => {
  it('emicrania senza aura', () => {
    const e = ep({ intensity: 7, side: 'destro', quality: ['pulsante'], symptoms: ['nausea'] });
    expect(classify(e, now).id).toBe('emicrania');
  });
  it('emicrania con aura tipica', () => {
    expect(classify(ep({ aura: ['visiva'], auraDurationMin: 20 }), now).id).toBe('emicrania_aura');
  });
  it('tensiva', () => {
    const e = ep({ intensity: 4, side: 'bilaterale', quality: ['gravativo'], symptoms: ['fotofobia'] });
    expect(classify(e, now).id).toBe('tensiva');
  });
  it('grappolo', () => {
    const e = ep({ intensity: 9, side: 'sinistro', locations: ['orbitale'], autonomic: ['lacrimazione'], end: '2026-03-10T09:00:00' });
    expect(classify(e, now).id).toBe('grappolo');
  });
  it('emicrania breve ma trattata resta emicrania', () => {
    const e = ep({ intensity: 7, side: 'destro', quality: ['pulsante'], symptoms: ['nausea'], end: '2026-03-10T09:30:00', meds: [{ id: 'm', name: 'Sumatriptan', cls: 'triptano', time: '2026-03-10T08:10:00' }] });
    expect(classify(e, now).id).toBe('emicrania');
  });
  it('dati minimi: non classificabile e incompleto', () => {
    const c = classify(ep({ intensity: 2, end: '2026-03-10T08:10:00' }), now);
    expect(c.id).toBe('non_class');
    expect(c.incomplete).toBe(true);
  });
});

describe('mohStatus', () => {
  const tripDays = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = `2026-03-${String(i + 2).padStart(2, '0')}`;
      return ep({ start: `${d}T08:00:00`, end: `${d}T12:00:00`, meds: [{ id: 'm' + i, name: 'Sumatriptan', cls: 'triptano', time: `${d}T08:30:00` }] });
    });
  it('preavviso a 8 giorni di triptano', () => {
    expect(mohStatus(tripDays(8), '2026-03-31').find((r) => r.key === 'triptano')!.status).toBe('warn');
  });
  it('soglia superata a 10 giorni', () => {
    expect(mohStatus(tripDays(10), '2026-03-31').find((r) => r.key === 'triptano')!.status).toBe('over');
  });
  it('più dosi nello stesso giorno contano 1 giorno', () => {
    const e = ep({ meds: [1, 2, 3].map((i) => ({ id: 'x' + i, name: 'Ibuprofene', cls: 'fans' as const, time: '2026-03-20T0' + i + ':00:00' })) });
    expect(mohStatus([e], '2026-03-31').find((r) => r.key === 'fans')!.days).toBe(1);
  });
});

describe('metriche', () => {
  it('episodio a cavallo della mezzanotte conta due giorni', () => {
    const s = computeStats([ep({ start: '2026-03-10T22:00:00', end: '2026-03-11T03:00:00' })], '2026-03-01', '2026-03-31', now);
    expect(s.headacheDays).toBe(2);
  });
  it('ciclo: attacco al giorno 1 è perimestruale', () => {
    const e = ep({ start: '2026-03-10T08:00:00', meds: [{ id: 'm', name: 'Sumatriptan', cls: 'triptano', time: '2026-03-10T09:00:00' }] });
    const r = cycleCorrelation([e], [{ date: '2026-03-10', period: true }], now)!;
    expect(r.perimenstrual).toBe(1);
  });
  it('profilassi: riduzione del 50% = responder', () => {
    const mk = (d: string) => ep({ start: `${d}T08:00:00`, end: `${d}T20:00:00`, meds: [{ id: d, name: 'Rizatriptan', cls: 'triptano', time: `${d}T08:30:00` }] });
    const before = Array.from({ length: 8 }, (_, i) => mk(`2026-01-${String(i * 3 + 2).padStart(2, '0')}`));
    const after = Array.from({ length: 3 }, (_, i) => mk(`2026-05-${String(i * 5 + 2).padStart(2, '0')}`));
    const r = prophylaxisEfficacy({ id: 'p', name: 'Topiramato', dose: '50 mg', frequency: 'giornaliera', startDate: '2026-02-01', sideEffects: [], notes: '' }, [...before, ...after], new Date('2026-05-25T12:00:00'));
    expect(r.evaluable).toBe(true);
    expect(r.responder).toBe(true);
  });
});

describe('questionari', () => {
  it('gradi MIDAS e impatto HIT-6', () => {
    expect(midasGrade(5).grade).toBe('I');
    expect(midasGrade(21).grade).toBe('IV');
    expect(hit6Impact(49)).toMatch(/scarso/);
    expect(hit6Impact(60)).toMatch(/grave/);
  });
});
