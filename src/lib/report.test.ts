import { describe, expect, it } from 'vitest';
import { auraDurationSummary, intakeDelayMin, intakeTimingByDrug, median } from './clinic';
import { checkinSummary, reportFactors } from './analytics';
import { auraWithCombinedPill, normalizeProfile, onsetAgeOf, parseOnset, profileLines } from './profile';
import type { TriggerRisk } from './advisor/types';
import type { BackupFile, DayInfo, Episode, MedIntake } from './types';

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
const med = (name: string, time: string): MedIntake => ({ id: Math.random().toString(36), name, cls: 'triptano', time });

describe('mediana', () => {
  it('pari, dispari, vuota', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('tempo di assunzione', () => {
  const e = ep({ start: '2026-03-10T08:00:00' });
  it('minuti dall’inizio, con tolleranza prima dell’inizio e scarto degli orari impossibili', () => {
    expect(intakeDelayMin(e, med('A', '2026-03-10T08:45:00'))).toBe(45);
    expect(intakeDelayMin(e, med('A', '2026-03-10T07:40:00'))).toBe(0);
    expect(intakeDelayMin(e, med('A', '2026-03-10T06:00:00'))).toBeNull();
    expect(intakeDelayMin(e, med('A', '2026-03-14T08:00:00'))).toBeNull();
  });
  it('mediana e quota entro 1 h per farmaco, solo nel periodo', () => {
    const list = [
      ep({ start: '2026-03-10T08:00:00', meds: [med('Sumatriptan', '2026-03-10T08:30:00')] }),
      ep({ start: '2026-03-12T08:00:00', meds: [med('sumatriptan', '2026-03-12T10:00:00')] }),
      ep({ start: '2026-03-14T08:00:00', meds: [med('Sumatriptan', '2026-03-14T09:00:00'), med('Ibuprofene', '2026-03-14T08:10:00')] }),
      ep({ start: '2026-02-01T08:00:00', meds: [med('Sumatriptan', '2026-02-01T20:00:00')] })
    ];
    const t = intakeTimingByDrug(list, '2026-03-01', '2026-03-31');
    expect(t.get('sumatriptan')).toEqual({ timed: 3, medianDelayMin: 60, within1h: 2 });
    expect(t.get('ibuprofene')).toEqual({ timed: 1, medianDelayMin: 10, within1h: 1 });
  });
});

describe('aura', () => {
  it('durata mediana solo sugli episodi con aura e durata', () => {
    const r = auraDurationSummary([ep({ aura: ['visiva'], auraDurationMin: 20 }), ep({ aura: ['visiva'], auraDurationMin: 40 }), ep({ aura: ['visiva'] }), ep({ auraDurationMin: 90 })]);
    expect(r).toEqual({ n: 2, medianMin: 30 });
    expect(auraDurationSummary([]).medianMin).toBeNull();
  });
});

describe('riepilogo check-in', () => {
  const days: DayInfo[] = [
    { date: '2026-03-01', checkin: { at: '', sleep: 'poco', stress: 'alto' } },
    { date: '2026-03-02', checkin: { at: '', sleep: 'ok', stress: 'alto' } },
    { date: '2026-03-03', checkin: { at: '', sleep: 'ok' } }, // incompleto: non conta per l'aderenza
    { date: '2026-03-04', period: true },
    { date: '2026-04-01', checkin: { at: '', sleep: 'troppo', stress: 'basso' } } // fuori periodo
  ];
  it('aderenza e distribuzioni', () => {
    const r = checkinSummary(days, '2026-03-01', '2026-03-10');
    expect(r.days).toBe(10);
    expect(r.done).toBe(2);
    expect(r.compliance).toBeCloseTo(0.2);
    expect(r.sleepN).toBe(3);
    expect(r.sleep.ok).toBeCloseTo(2 / 3);
    expect(r.sleep.troppo).toBe(0);
    expect(r.stress).toEqual({ basso: 0, medio: 0, alto: 1 });
  });
  it('periodo vuoto', () => {
    const r = checkinSummary([], '2026-03-01', '2026-03-10');
    expect(r.done).toBe(0);
    expect(r.sleep.poco).toBe(0);
  });
});

describe('fattori nel report', () => {
  const f = (id: string, rr: number, basis: TriggerRisk['basis']): TriggerRisk => ({ id, label: id, rr, low: 1, high: 2, exposedDays: 10, basis });
  it('solo stime con dati personali e RR ≥ 1,2, ordinate', () => {
    const r = reportFactors([f('a', 1.5, 'generale'), f('b', 1.3, 'misto'), f('c', 1.1, 'personale'), f('d', 2.1, 'personale')]);
    expect(r.map((x) => x.id)).toEqual(['d', 'b']);
  });
});

describe('profilo', () => {
  it('backup vecchio senza i campi nuovi si importa invariato', () => {
    const old = JSON.parse('{"app":"blank-out","version":1,"exportedAt":"2025-01-01T00:00:00Z","episodes":[],"medications":[],"prophylaxis":[],"questionnaires":[],"days":[],"customTriggers":[],"profile":{"name":"Anna","birthYear":1988}}') as BackupFile;
    expect(normalizeProfile(old.profile, 2026)).toEqual({ name: 'Anna', birthYear: 1988 });
    expect(normalizeProfile(undefined)).toEqual({});
    expect(normalizeProfile(null)).toEqual({});
  });
  it('scarta valori sconosciuti o fuori intervallo', () => {
    expect(normalizeProfile({ sex: 'x', smoking: 'ex', birthYear: 1800, onsetAge: 14, familyHistory: 'si', hormonal: 'estroprogestinica' }, 2026)).toEqual({
      smoking: 'ex',
      onsetAge: 14,
      familyHistory: 'si',
      hormonal: 'estroprogestinica'
    });
  });
  it('esordio: anno o età', () => {
    expect(parseOnset('2005', 2026)).toEqual({ onsetYear: 2005 });
    expect(parseOnset('14', 2026)).toEqual({ onsetAge: 14 });
    expect(parseOnset('', 2026)).toEqual({});
    expect(parseOnset('3000', 2026)).toEqual({});
    expect(onsetAgeOf({ birthYear: 1990, onsetYear: 2004 })).toBe(14);
  });
  it('righe del report: solo i campi compilati', () => {
    expect(profileLines({}, 2026)).toEqual([]);
    const l = profileLines({ birthYear: 1990, sex: 'femmina', hormonal: 'estroprogestinica', onsetYear: 2004, smoking: 'no' }, 2026);
    expect(l.map((x) => x.label)).toEqual(['Età', 'Sesso', 'Terapia ormonale', 'Esordio', 'Fumo']);
    expect(l[0].value).toContain('36');
    expect(l[3].value).toBe('2004 (a 14 anni)');
  });
  it('aura con pillola combinata', () => {
    expect(auraWithCombinedPill({ hormonal: 'estroprogestinica' }, 1)).toBe(true);
    expect(auraWithCombinedPill({ hormonal: 'estroprogestinica' }, 0)).toBe(false);
    expect(auraWithCombinedPill({ hormonal: 'progestinico' }, 3)).toBe(false);
  });
});
