<script lang="ts">
  import { CHECKIN, PRODROMES, type Opt } from '../lib/catalog';
  import { dayKey } from '../lib/clinic';
  import { getDay, nowIso, saveDay } from '../lib/db.svelte';
  import type { CheckIn } from '../lib/types';
  import { haptic } from '../lib/ui.svelte';
  import Chips from './Chips.svelte';

  // Check-in giornaliero: un tocco per riga, salvataggio immediato.
  let { date = dayKey(new Date()) }: { date?: string } = $props();

  type Draft = Omit<CheckIn, 'at'>;
  type SegKey = 'sleep' | 'stress' | 'meals' | 'water' | 'caffeine';

  let c = $state<Draft>({});
  let prodromes = $state<string[]>([]);
  let collapsed = $state(false);
  let prodOpen = $state(false);
  let loadedFor = '';

  // Ricarica quando cambia la data
  $effect(() => {
    if (date === loadedFor) return;
    loadedFor = date;
    const { at: _at, ...saved } = getDay(date)?.checkin ?? ({} as CheckIn);
    c = { ...saved };
    prodromes = [...(saved.prodromes ?? [])];
    collapsed = !!(saved.sleep && saved.stress);
    prodOpen = prodromes.length > 0;
  });

  const done = $derived(!!(c.sleep && c.stress));
  const isToday = $derived(date === dayKey(new Date()));

  const ROWS: { key: SegKey; label: string; options: Opt[] }[] = [
    { key: 'sleep', label: 'Come hai dormito?', options: CHECKIN.sleep },
    { key: 'stress', label: 'Stress oggi', options: CHECKIN.stress },
    { key: 'meals', label: 'Pasti', options: CHECKIN.meals },
    { key: 'water', label: 'Acqua', options: CHECKIN.water },
    { key: 'caffeine', label: 'Caffè', options: CHECKIN.caffeine }
  ];

  function save() {
    const checkin: CheckIn = { ...c, prodromes: prodromes.length ? [...prodromes] : undefined, at: nowIso() };
    saveDay({ ...(getDay(date) ?? { date }), checkin });
  }

  function pick(key: SegKey, id: string) {
    haptic();
    (c as Record<SegKey, string | undefined>)[key] = c[key] === id ? undefined : id;
    save();
  }

  function flip(key: 'alcohol' | 'exercise') {
    haptic();
    c[key] = !c[key];
    save();
  }

  function finish() {
    haptic();
    collapsed = true;
  }
</script>

<section class="card checkin" aria-labelledby="checkin-title">
  <div class="row head">
    <h2 id="checkin-title" class="grow">{isToday ? 'Check-in di oggi' : 'Check-in del giorno'}</h2>
    {#if done}<span class="badge" aria-label="Check-in completato">Fatto ✓</span>{/if}
    {#if collapsed}
      <button type="button" class="btn link" aria-expanded="false" aria-controls="checkin-body" onclick={() => (collapsed = false)}>Modifica</button>
    {/if}
  </div>

  {#if collapsed}
    <p class="small muted summary">Grazie! Ogni check-in ti aiuta a scoprire i tuoi fattori scatenanti.</p>
  {:else}
    <div id="checkin-body" class="stack">
      <p class="small muted">Un tocco per riga, si salva da solo.</p>
      {#each ROWS as r (r.key)}
        <div class="line" role="group" aria-labelledby={'ci-' + r.key}>
          <span class="label" id={'ci-' + r.key}>{r.label}</span>
          <div class="seg">
            {#each r.options as o (o.id)}
              <button type="button" class="chip" aria-pressed={c[r.key] === o.id} onclick={() => pick(r.key, o.id)}>{o.label}</button>
            {/each}
          </div>
        </div>
      {/each}

      <div class="chips" role="group" aria-label="Oggi">
        <button type="button" class="chip" aria-pressed={!!c.alcohol} onclick={() => flip('alcohol')}>Alcol</button>
        <button type="button" class="chip" aria-pressed={!!c.exercise} onclick={() => flip('exercise')}>Movimento</button>
      </div>

      <div class="prod">
        <button type="button" class="btn link toggle-prod" aria-expanded={prodOpen} aria-controls="ci-prodromes" onclick={() => (prodOpen = !prodOpen)}>
          Segnali premonitori?{prodromes.length ? ` (${prodromes.length})` : ''}
          <span aria-hidden="true">{prodOpen ? '▴' : '▾'}</span>
        </button>
        {#if prodOpen}
          <div id="ci-prodromes">
            <Chips options={PRODROMES} bind:value={prodromes} onchange={save} />
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
