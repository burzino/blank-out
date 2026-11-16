<script lang="ts">
  import { QUICK_INTENSITY } from '../lib/catalog';
  import { getEpisode, saveEpisode } from '../lib/db.svelte';
  import { rankedTriggers, redFlagFor, startEpisode, takeMed } from '../lib/episodes.svelte';
  import { go } from '../lib/router.svelte';
  import type { Episode } from '../lib/types';
  import Chips from './Chips.svelte';
  import MedPicker from './MedPicker.svelte';
  import Sheet from './Sheet.svelte';
  import TimeChips from './TimeChips.svelte';

  // Log rapido: tap 1 = apri, tap 2 = intensità (salvato). Poi dettagli facoltativi.
  let { open = $bindable(false), copyFrom }: { open: boolean; copyFrom?: Episode } = $props();

  let start = $state(new Date().toISOString());
  let id = $state<string | null>(null);
  const ep = $derived(id ? getEpisode(id) : undefined);
  let triggers = $state<string[]>([]);
  let moreTriggers = $state(false);
  const trigOpts = $derived(moreTriggers ? rankedTriggers() : rankedTriggers().slice(0, 5));
  const flag = $derived(ep ? redFlagFor(ep) : null);

  $effect(() => {
    if (open && !id) {
      start = new Date().toISOString();
      triggers = copyFrom ? [...copyFrom.triggers] : [];
    }
  });

  async function pickIntensity(v: number) {
    const e = await startEpisode(start, v, copyFrom);
    id = e.id;
  }

  async function saveTriggers() {
    const e = id && getEpisode(id);
    if (e) await saveEpisode({ ...JSON.parse(JSON.stringify(e)), triggers });
  }

  function reset() {
    id = null;
    moreTriggers = false;
  }
  function done() {
    open = false;
    reset();
  }
  function details() {
    const target = id;
    done();
    go('/episode?id=' + target);
  }
</script>

<Sheet bind:open title={id ? 'Aggiungi dettagli' : 'Quanto è forte?'} onclose={reset}>
  {#if !id}
    <TimeChips bind:value={start} label="Quando è iniziato?" />
    {#if copyFrom}<p class="small muted">Copio zone, sintomi e trigger dall'ultimo episodio.</p>{/if}
    <div class="stack" style="margin-top:8px">
      {#each QUICK_INTENSITY as q (q.level)}
        <button class="btn big block i{q.level} intensity" aria-label="Intensità {q.label.toLowerCase()}, {q.level} su 3" onclick={() => pickIntensity(q.value)}>
          <span>{q.label}</span>
          <span class="small hint">{q.hint}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="muted small">Salvato. Tutto il resto è facoltativo.</p>

    {#if flag}
      <div class="alert danger">
        <strong>{flag}</strong>
        <a href={'#/redflags?id=' + id}>Controlla i segnali d'allarme</a>
      </div>
    {/if}

    <h3>Hai preso qualcosa?</h3>
    {#if ep && ep.meds.length}
      <p class="small muted">Registrati: {ep.meds.map((m) => m.name).join(', ')}</p>
    {/if}
    <MedPicker onpick={(m) => ep && takeMed(m, ep)} limit={3} />

    <h3>Cosa può averlo scatenato?</h3>
    <Chips options={trigOpts} bind:value={triggers} onchange={saveTriggers} />
    {#if !moreTriggers}
      <button class="btn link" onclick={() => (moreTriggers = true)}>Altri…</button>
    {/if}

    <div class="stack" style="margin-top:20px">
      <button class="btn primary big block" onclick={done}>Fatto</button>
      <button class="btn block" onclick={details}>Tutti i dettagli (zone, sintomi, aura…)</button>
      <a class="btn link" href={'#/redflags?id=' + id} onclick={done}>Questo mal di testa è diverso dal solito?</a>
    </div>
  {/if}
</Sheet>

<style>
  .intensity { flex-direction: column; gap: 2px; border: none; }
  .hint { font-weight: 400; opacity: 0.85; }
</style>
