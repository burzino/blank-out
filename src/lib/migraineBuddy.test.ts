import { describe, expect, it } from 'vitest';
import { parseCsv, parseMed, parseMigraineBuddy } from './migraineBuddy';

const SAMPLE = `"Data","Intervallo di Tempo","Descrizione","Annotazioni"
"Nessun evento in corso registrato durante questo periodo.","","",""

"#","Iniziato","Durato","Offset UTC di inizio (min)","Offset UTC di fine (min)","Geohash","Tipi di attacco","Sito d’attacco","Livello di Dolore","Attività Affette","Potenziali Cause Scatenanti","Sintomi","Sintomo più fastidioso","Sintomi Premonitori","Localizzazioni del Dolore","Farmaco efficace","Farmaco di una certa efficacia","Farmaco inefficace","Farmaco non sicuro","Metodi di sollievo efficaci non basati su farmaci","Metodi di sollievo di una certa efficacia non basati su farmaci","Metodi di sollievo inefficaci non basati su farmaci","Metodi di sollievo non sicuri non basati su farmaci","Annotazioni"
"1","03/11/26 10:24","10h 26m","60","60","u0j2","Non so ancora","A casa","3","Non affetto","Nessuna idea","Nessuno","","No","Parte Posteriore Destra della Testa (in basso), Parte Posteriore Destra della Testa (in alto)","","","","1x Ibuprofen 600mg Polvere","","","","Nessun sollievo",""
"2","21/10/26 13:07","13h 47m","120","120","u0j2","Emicrania","A casa","4","Difficile concentrarsi","Stress, Dormito poco","Dolore pulsante, Dolore sordo, Dolore al collo, Formicolio","","Cefalea","Parte Posteriore Destra del Collo, Tempia Sinistra, Occhio Destro","","1x Ketoprofen Orale","2x Ibuprofen Orale","","Buio","","","","una nota, con ""virgolette"""
`;

describe('parseCsv', () => {
  it('gestisce virgolette, virgole e a capo nei campi', () => {
    expect(parseCsv('a,"b,c","d""e"\r\n"f\ng",h')).toEqual([['a', 'b,c', 'd"e'], ['f\ng', 'h']]);
  });
});

describe('parseMed', () => {
  it('normalizza nome, classe e dose', () => {
    expect(parseMed('1x Ibuprofen 600mg Polvere')).toEqual({ name: 'Ibuprofene', cls: 'fans', dose: '600 mg' });
    expect(parseMed('2x Sumatriptan 50mg')).toEqual({ name: 'Sumatriptan', cls: 'triptano', dose: '2 × 50 mg' });
    expect(parseMed('1x Ketoprofen Orale')).toEqual({ name: 'Ketoprofene', cls: 'fans', dose: undefined });
    expect(parseMed('1x Magnesio')).toEqual({ name: 'Magnesio', cls: 'altro', dose: undefined });
  });
});

describe('parseMigraineBuddy', () => {
  const { episodes, skippedRows } = parseMigraineBuddy(SAMPLE);

  it('legge solo la tabella degli attacchi', () => {
    expect(episodes).toHaveLength(2);
    expect(skippedRows).toBe(0);
  });

  it('converte ora locale + offset UTC e durata', () => {
    expect(episodes[0].start).toBe('2026-11-03T09:24:00.000Z');
    expect(episodes[0].end).toBe('2026-11-03T19:50:00.000Z');
    expect(episodes[1].start).toBe('2026-10-21T11:07:00.000Z');
  });

  it('mappa zone, lato, sintomi, trigger e disabilità', () => {
    const [a, b] = episodes;
    expect(a.locations).toEqual(['occipitale']);
    expect(a.side).toBe('destro');
    expect(a.symptoms).toEqual([]);
    expect(a.triggers).toEqual([]);
    expect(a.disability).toBe('nessuna');
    expect(b.locations.sort()).toEqual(['nucale', 'orbitale', 'temporale']);
    expect(b.side).toBe('bilaterale');
    expect(b.quality).toEqual(['pulsante', 'gravativo']);
    expect(b.symptoms).toEqual(['cervicalgia']);
    expect(b.triggers).toEqual(['stress', 'sonno_scarso']);
    expect(b.disability).toBe('ridotta');
    expect(b.intensity).toBe(4);
  });

  it('registra i farmaci con la loro efficacia', () => {
    expect(episodes[0].meds.map((m) => [m.name, m.efficacy])).toEqual([['Ibuprofene', undefined]]);
    expect(episodes[1].meds.map((m) => [m.name, m.efficacy, m.dose])).toEqual([
      ['Ketoprofene', 'parziale', undefined],
      ['Ibuprofene', 'nessuna', '2 ×']
    ]);
    expect(episodes[1].meds[0].time).toBe(episodes[1].start);
  });

  it('mette nelle note ciò che non ha un campo dedicato', () => {
    expect(episodes[0].notes).toBe('');
    expect(episodes[1].notes).toContain('Tipo (Migraine Buddy): Emicrania');
    expect(episodes[1].notes).toContain('Altri sintomi: Formicolio');
    expect(episodes[1].notes).toContain('Segnali premonitori: Cefalea');
    expect(episodes[1].notes).toContain('Sollievo senza farmaci: Buio');
    expect(episodes[1].notes).toContain('una nota, con "virgolette"');
  });

  it('rifiuta file non riconosciuti', () => {
    expect(() => parseMigraineBuddy('a,b\n1,2')).toThrow();
  });
});
