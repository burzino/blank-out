<script lang="ts">
  import { CHECKIN, PRODROMES, activityOf, type Opt } from '../lib/catalog';
  import { dayKey } from '../lib/clinic';
  import { getDay, nowIso, saveDay } from '../lib/db.svelte';
  import type { CheckIn, CheckInField } from '../lib/types';
  import { haptic } from '../lib/ui.svelte';
  import Chips from './Chips.svelte';
  import Icon from './Icon.svelte';

  // Check-in giornaliero: un tocco per riga, salvataggio immediato.
  let { date = dayKey(new Date()) }: { date?: string } = $props();

  type Draft = Omit<CheckIn, 'at' | 'times'>;
  type SegKey = 'sleep' | 'stress' | 'meals' | 'water' | 'caffeine' | 'activity';
  type FlagKey = 'alcohol' | 'sleepIrregular' | 'screens';

  let c = $state<Draft>({});
  let prodromes = $state<string[]>([]);
  // Ora in cui ogni campo è stato toccato: serve al modello per sapere se un fattore precede l'attacco
  let times: Partial<Record<CheckInField, string>> = {};
  let collapsed = $state(false);
  let prodOpen = $state(false);
  let infoOpen = $state(false);
  let loadedFor = '';

  // Ricarica quando cambia la data
  $effect(() => {
    if (date === loadedFor) return;
    loadedFor = date;
    const stored = getDay(date)?.checkin;
    const { at: _at, exercise: _ex, times: savedTimes, ...saved } = stored ?? ({} as CheckIn);
    times = { ...savedTimes };
    // Il vecchio sì/no sul movimento diventa la scala a 4 livelli (salvato alla prossima modifica)
    c = { ...saved, activity: activityOf(stored) };
    prodromes = [...(saved.prodromes ?? [])];
    collapsed = !!(saved.sleep && saved.stress);
    prodOpen = prodromes.length > 0;
  });

  const done = $derived(!!(c.sleep && c.stress));
  const isToday = $derived(date === dayKey(new Date()));

  const ROWS: { key: SegKey; label: string; hint?: string; options: Opt[] }[] = [
    { key: 'sleep', label: 'Come hai dormito?', options: CHECKIN.sleep },
    { key: 'stress', label: 'Stress oggi', options: CHECKIN.stress },
    { key: 'meals', label: 'Pasti', options: CHECKIN.meals },
    { key: 'water', label: 'Acqua', options: CHECKIN.water },
    { key: 'caffeine', label: 'Caffè', options: CHECKIN.caffeine },
    {
      key: 'activity',
      label: 'Movimento',
      hint: 'Leggero: passeggiata, faccende. Moderato: camminata svelta, bici, nuoto tranquillo. Intenso: corsa, palestra, sport. Se non l’hai ancora fatto, puoi segnarlo stasera.',
      options: CHECKIN.activity
    }
  ];

  function save(field?: CheckInField) {
    const at = nowIso();
    if (field) times[field] = at;
    const checkin: CheckIn = { ...c, prodromes: prodromes.length ? [...prodromes] : undefined, times: { ...times }, at };
    saveDay({ ...(getDay(date) ?? { date }), checkin });
  }

  function pick(key: SegKey, id: string) {
    haptic();
    (c as Record<SegKey, string | undefined>)[key] = c[key] === id ? undefined : id;
    if (c[key] === undefined) delete times[key];
    save(c[key] === undefined ? undefined : key);
  }

  // Chip sì/no: un chip mai toccato resta "non segnato" (vale "no" solo a check-in fatto, vedi flagOf in catalog.ts)
  function flip(key: FlagKey) {
    haptic();
    c[key] = !c[key];
    save(key);
  }

  function finish() {
    haptic();
    collapsed = true;
  }
</script>

<section class="card checkin" aria-labelledby="checkin-title">
  <div class="row head">
    <h2 id="checkin-title">{isToday ? 'Check-in di oggi' : 'Check-in del giorno'}</h2>
    <button
      type="button"
      class="info-btn"
      aria-label="Come e quando fare il check-in"
      aria-expanded={infoOpen}
      aria-controls="checkin-info"
      onclick={() => (infoOpen = !infoOpen)}
    ><Icon name="info" size={20} /></button>
    {#if done}<span class="badge" aria-label="Check-in completato">Fatto ✓</span>{/if}
    {#if collapsed}
      <button type="button" class="btn link" aria-expanded="false" aria-controls="checkin-body" onclick={() => (collapsed = false)}>Modifica</button>
    {/if}
  </div>

  {#if infoOpen}
    <div id="checkin-info" class="info small">
      <p><strong>Quando</strong></p>
      <ul>
        <li><strong>Al mattino:</strong> come hai dormito (anche se a orari diversi dal solito) e, se ci sono, i segnali premonitori.</li>
        <li><strong>La sera:</strong> tutto il resto (stress, pasti, acqua, caffè, alcol, schermi, movimento), a giornata quasi finita.</li>
        <li>Se riesci a farlo una volta sola, meglio la sera.</li>
      </ul>
      <p><strong>Come</strong></p>
      <ul>
        <li>Rispondi solo a quello che sai: una riga vuota va bene, una risposta a caso no.</li>
        <li>Confronta con il tuo solito, non con l’ideale.</li>
        <li>Se oggi hai avuto un attacco, pensa a com’era la giornata <em>prima</em> del dolore. Pasti, acqua, caffè, stress, movimento (e gli altri fattori della giornata) segnati dopo l’inizio del dolore non vengono usati per cercare i fattori scatenanti di quel giorno (potrebbero essere conseguenze del dolore): se puoi, compilali prima.</li>
        <li>Puoi tornare a modificarlo quando vuoi: si salva da solo.</li>
      </ul>
    </div>
  {/if}

  {#if collapsed}
    <p class="small muted summary">Grazie! Ogni check-in ti aiuta a scoprire i tuoi fattori scatenanti.</p>
  {:else}
    <div id="checkin-body" class="stack">
      <p class="small muted">Un tocco per riga, si salva da solo.</p>
      {#each ROWS as r (r.key)}
        <div class="line" role="group" aria-labelledby={'ci-' + r.key} aria-describedby={r.hint ? 'ci-hint-' + r.key : undefined}>
          <span class="label" id={'ci-' + r.key}>{r.label}</span>
          {#if r.hint}<span class="small muted" id={'ci-hint-' + r.key}>{r.hint}</span>{/if}
          <div class="seg">
            {#each r.options as o (o.id)}
              <button type="button" class="chip" aria-pressed={c[r.key] === o.id} onclick={() => pick(r.key, o.id)}>{o.label}</button>
            {/each}
          </div>
        </div>
      {/each}

      <div class="chips" role="group" aria-label="Oggi" aria-describedby="ci-hint-flags">
        <button type="button" class="chip" aria-pressed={!!c.alcohol} onclick={() => flip('alcohol')}>Alcol</button>
        <button type="button" class="chip" aria-pressed={!!c.sleepIrregular} onclick={() => flip('sleepIrregular')}>Sonno a orari diversi dal solito</button>
        <button type="button" class="chip" aria-pressed={!!c.screens} onclick={() => flip('screens')}>Molte ore di schermo / luce forte</button>
      </div>
      <span class="small muted" id="ci-hint-flags">Tocca solo se è successo: a check-in fatto, quello che non tocchi vale “no”.</span>

      <div class="prod">
        <button type="button" class="btn link toggle-prod" aria-expanded={prodOpen} aria-controls="ci-prodromes" onclick={() => (prodOpen = !prodOpen)}>
          Segnali premonitori?{prodromes.length ? ` (${prodromes.length})` : ''}
          <span aria-hidden="true">{prodOpen ? '▴' : '▾'}</span>
        </button>
        {#if prodOpen}
          <div id="ci-prodromes">
            <Chips options={PRODROMES} bind:value={prodromes} onchange={() => save('prodromes')} />
          </div>
        {/if}
      </div>

      <div class="row end">
        <button type="button" class="btn" class:primary={done} onclick={finish}>Fatto</button>
      </div>
    </div>
  {/if}
</section>

<style>
  .head h2 { margin: 0; font-size: 1.1rem; }
  .info-btn {
    margin-right: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    background: none;
    border: none;
    border-radius: 999px;
    color: var(--muted);
    cursor: pointer;
  }
  .info-btn[aria-expanded='true'] { color: var(--accent); }
  .info {
    margin: 4px 0 8px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .info p { margin: 6px 0 2px; }
  .info ul { margin: 0 0 4px; padding-left: 18px; }
  .info li { margin: 2px 0; }
  .badge {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--i1);
    color: var(--on-i);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .summary { margin: 8px 0 0; }
  .line { display: flex; flex-direction: column; gap: 6px; }
  .seg .chip { min-height: 44px; }
  .toggle-prod { padding-left: 0; display: inline-flex; gap: 6px; align-items: center; }
  .end { justify-content: flex-end; }
</style>
