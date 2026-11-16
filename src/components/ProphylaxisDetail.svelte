<script lang="ts">
  import { FREQUENCIES, KNOWN_PROPHYLAXIS, SIDE_EFFECTS, STOP_REASONS, labelOf } from '../lib/catalog';
  import { dayKey } from '../lib/clinic';
  import { data, deleteProphylaxis, saveProphylaxis } from '../lib/db.svelte';
  import { go } from '../lib/router.svelte';
  import type { Prophylaxis } from '../lib/types';
  import { haptic, toast } from '../lib/ui.svelte';
  import Chips from './Chips.svelte';
  import ProphylaxisEfficacy from './ProphylaxisEfficacy.svelte';

  let { id }: { id: string } = $props();

  const orig = data.prophylaxis.find((x) => x.id === id);
  // Copia locale modificabile con salvataggio automatico
  let p = $state<Prophylaxis | null>(orig ? $state.snapshot(orig) : null);
  let saved = $state(false);
  let lastJson = JSON.stringify(orig ?? null);
  let timer: ReturnType<typeof setTimeout>;
  let stopping = $state(false);
  const today = dayKey(new Date());

  $effect(() => {
    const json = JSON.stringify(p);
    if (!p || json === lastJson) return;
    lastJson = json;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await saveProphylaxis(JSON.parse(json));
      saved = true;
      setTimeout(() => (saved = false), 1500);
    }, 300);
  });

  const fmtDate = (k: string) => new Date(k + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

  function onName() {
    const k = p && KNOWN_PROPHYLAXIS.find((x) => x.name.toLowerCase() === p!.name.trim().toLowerCase());
    if (k && p && !p.frequency) p.frequency = k.freq;
  }

  function startStop() {
    stopping = true;
    if (p && !p.endDate) p.endDate = today;
  }
  function resume() {
    if (!p) return;
    const before = { endDate: p.endDate, stopReason: p.stopReason };
    p.endDate = undefined;
    p.stopReason = undefined;
    stopping = false;
    toast('Terapia di nuovo attiva', { label: 'Annulla', run: () => p && Object.assign(p, before) });
  }

  const hasToday = (eid: string) => !!p?.sideEffects.some((s) => s.id === eid && s.date === today);
  function toggleEffect(eid: string) {
    if (!p) return;
    haptic();
    if (hasToday(eid)) p.sideEffects = p.sideEffects.filter((s) => !(s.id === eid && s.date === today));
    else p.sideEffects = [...p.sideEffects, { id: eid, date: today }];
  }
  function removeEffect(i: number) {
    if (!p) return;
    const removed = p.sideEffects[i];
    p.sideEffects = p.sideEffects.filter((_, j) => j !== i);
    toast('Effetto rimosso', { label: 'Annulla', run: () => p && (p.sideEffects = [...p.sideEffects, removed]) });
  }

  async function del() {
    if (!p) return;
    clearTimeout(timer);
    const before = $state.snapshot(p);
    lastJson = JSON.stringify(null);
    p = null;
    await deleteProphylaxis(before.id);
    toast(`${before.name} eliminata`, { label: 'Annulla', run: () => saveProphylaxis(before) });
    go('/prophylaxis');
  }

  const effects = $derived(p ? [...p.sideEffects.map((s, i) => ({ ...s, i }))].sort((a, b) => b.date.localeCompare(a.date)) : []);
</script>

{#if !p}
  <p class="muted">Terapia non trovata.</p>
  <a class="btn" href="#/prophylaxis">Torna all'elenco</a>
{:else}
  <p class="small muted saved" aria-live="polite">{saved ? 'Salvato' : ' '}</p>

  <section class="card">
    <div class="field">
      <label for="pn">Farmaco</label>
      <input id="pn" type="text" list="proph-known" bind:value={p.name} oninput={onName} autocomplete="off" />
      <datalist id="proph-known">
        {#each KNOWN_PROPHYLAXIS as k (k.name)}<option value={k.name}>{k.group}</option>{/each}
      </datalist>
    </div>
    <div class="field">
      <label for="pd">Dose</label>
      <input id="pd" type="text" bind:value={p.dose} placeholder="es. 40 mg" />
    </div>
    <div class="field">
      <span class="label">Frequenza</span>
      <Chips options={FREQUENCIES} bind:value={() => p?.frequency, (v) => p && (p.frequency = (v as string) ?? '')} multi={false} seg />
    </div>
    <div class="field">
      <label for="ps">Iniziata il</label>
      <input id="ps" type="date" max={today} value={p.startDate} onchange={(e) => p && e.currentTarget.value && (p.startDate = e.currentTarget.value)} />
    </div>
  </section>

  <section class="card">
    <h3 style="margin-top:0">Funziona?</h3>
    <ProphylaxisEfficacy p={p} />
  </section>

  <section class="card">
    <h3 style="margin-top:0">Stato</h3>
    {#if p.endDate || stopping}
      <div class="field">
        <label for="pe">Interrotta il</label>
        <input id="pe" type="date" min={p.startDate} max={today} value={p.endDate ?? today} onchange={(e) => p && e.currentTarget.value && (p.endDate = e.currentTarget.value)} />
      </div>
      <div class="field">
        <span class="label">Perché?</span>
        <Chips options={STOP_REASONS} bind:value={() => p?.stopReason, (v) => p && (p.stopReason = v as string | undefined)} multi={false} />
      </div>
      <button class="btn link" onclick={resume}>La sto ancora prendendo</button>
    {:else}
      <p>In corso dal {fmtDate(p.startDate)}{p.frequency ? ` · ${labelOf(FREQUENCIES, p.frequency).toLowerCase()}` : ''}.</p>
      <button class="btn block" onclick={startStop}>Interrompi</button>
    {/if}
  </section>

  <section class="card">
    <h3 style="margin-top:0">Effetti collaterali</h3>
    <p class="small muted">Tocca per segnarlo oggi.</p>
    <div class="chips">
      {#each SIDE_EFFECTS as o (o.id)}
        <button class="chip" aria-pressed={hasToday(o.id)} onclick={() => toggleEffect(o.id)}>{o.label}</button>
      {/each}
    </div>
    {#if effects.length}
      <ul class="effects">
        {#each effects as s (s.i)}
          <li class="list-item">
            <span class="grow">{labelOf(SIDE_EFFECTS, s.id)}</span>
            <span class="small muted">{fmtDate(s.date)}</span>
            <button class="btn ghost" aria-label="Rimuovi {labelOf(SIDE_EFFECTS, s.id)} del {fmtDate(s.date)}" onclick={() => removeEffect(s.i)}>✕</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card">
    <h3 style="margin-top:0">Note</h3>
    <textarea bind:value={p.notes} placeholder="Qualcosa da dire al medico…"></textarea>
  </section>

  <p class="alert small">Non iniziare, modificare o sospendere una terapia senza il tuo medico.</p>

  <button class="btn block ghost danger" onclick={del}>Elimina questa terapia</button>
{/if}

<style>
  .saved { height: 1.2em; margin: -8px 0 4px; text-align: right; }
  .effects { list-style: none; padding: 0; margin: 12px 0 0; }
  .danger { color: var(--i3); margin-top: 8px; }
</style>
