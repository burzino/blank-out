import { describe, expect, it } from 'vitest';
import type { Episode, MedIntake } from '../types';
import { overallDiagnosis } from './diagnosis';
import { recommendations } from './recommendations';
import type { AdvisorContext } from './types';

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
const ctx = (episodes: Episode[], extra: Partial<AdvisorContext> = {}): AdvisorContext => ({
  episodes: [...episodes].sort((a, b) => b.start.localeCompare(a.start)),
  days: [],
  questionnaires: [],
  prophylaxis: [],
  medications: [],
  now,
  ...extra
});

/** Attacco tipico di emicrania senza aura il giorno `d` di marzo. */
const migraine = (d: number, p: Partial<Episode> = {}) => {
  const day = `2026-03-${String(d).padStart(2, '0')}`;
  return ep({
    start: `${day}T08:00:00`,
    end: `${day}T16:00:00`,
    intensity: 7,
    side: 'destro',
    quality: ['pulsante'],
    symptoms: ['nausea', 'fotofobia'],
    disability: 'ridotta',
    ...p
  });
};

describe('overallDiagnosis', () => {
  it('pochi dati: insufficiente, con confidenza bassa e cosa compilare', () => {
    const dx = overallDiagnosis(ctx([ep({ intensity: 3 }), ep({ start: '2026-03-12T08:00:00', end: null })]));
    expect(dx.id).toBe('insufficiente');
    expect(dx.confidence).toBe('bassa');
    expect(dx.missing.length).toBeGreaterThan(0);
  });

  it('≥5 attacchi tipici: emicrania senza aura', () => {
    const dx = overallDiagnosis(ctx([3, 9, 15, 21, 27, 30].map((d) => migraine(d))));
    expect(dx.id).toBe('emicrania_senza_aura');
    expect(dx.confidence).not.toBe('bassa');
    expect(dx.reasons.some((r) => r.includes('6 attacchi'))).toBe(true);
  });
});

describe('recommendations', () => {
  it('alta frequenza senza profilassi: consiglia di parlare di prevenzione', () => {
    const c = ctx([2, 5, 8, 11, 14, 17, 20, 23, 26, 29].map((d) => migraine(d)));
    const adv = recommendations(c, overallDiagnosis(c));
    expect(adv.some((a) => a.id === 'visita_prevenzione' && a.priority === 1)).toBe(true);
    expect(adv.some((a) => a.category === 'prevenzione')).toBe(true);
    expect(adv.length).toBeLessThanOrEqual(10);
    expect(adv.every((a) => a.why.length > 0)).toBe(true);
  });

  it('i consigli terapeutici non sono prescrizioni (niente dosaggi)', () => {
    const med = (d: string, name: string, cls: MedIntake['cls'], efficacy: MedIntake['efficacy']): MedIntake => ({
      id: Math.random().toString(36),
      name,
      cls,
      time: `${d}T10:30:00`, // 2,5 h dopo l'inizio: assunzione tardiva
      efficacy,
      recurrence24h: true
    });
    const eps = [3, 7, 11, 15, 19, 23, 27].map((d) => {
      const day = `2026-03-${String(d).padStart(2, '0')}`;
      return migraine(d, { meds: [med(day, 'Ibuprofene', 'fans', 'parziale')], triggers: ['digiuno', 'sonno_scarso'] });
    });
    const c = ctx(eps);
    const adv = recommendations(c, overallDiagnosis(c));
    const acute = adv.filter((a) => a.category === 'terapia_acuta');
    expect(acute.length).toBeGreaterThan(0);
    expect(acute.some((a) => a.id === 'chiedi_triptano')).toBe(true);
    for (const a of adv) expect(`${a.title} ${a.text} ${a.why}`).not.toMatch(/\bmg\b|\d\s*mg/i);
    for (const a of acute) expect(a.text.toLowerCase()).toContain('medico');
  });
});
