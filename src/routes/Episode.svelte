<script lang="ts">
  import { AURAS, AUTONOMIC, CLASSIFY_NOTE, DISABILITY, EFFICACY, LEVEL_LABEL, LOCATIONS, QUALITIES, SIDES, SYMPTOMS, classLabel, intensityLevel, type Opt } from '../lib/catalog';
  import { classify, durationMin, formatDuration } from '../lib/clinic';
  import { addCustomTrigger, getEpisode, saveEpisode } from '../lib/db.svelte';
  import { clock, intakeFrom, rankedTriggers, redFlagFor, rememberMed, removeEpisode } from '../lib/episodes.svelte';
  import { back, go, route } from '../lib/router.svelte';
  import type { Episode } from '../lib/types';
  import Chips from '../components/Chips.svelte';
  import MedPicker from '../components/MedPicker.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import TimeChips from '../components/TimeChips.svelte';

  const id = route.params.get('id') ?? '';
  const orig = getEpisode(id);
  // Copia locale modificabile: ogni modifica viene salvata in automatico
  let ep = $state<Episode | null>(orig ? JSON.parse(JSON.stringify(orig)) : null);
  let saved = $state(false);
  let lastJson = JSON.stringify(ep);
  let timer: ReturnType<typeof setTimeout>;

  $effect(() => {
    const json = JSON.stringify(ep);
    if (!ep || json === lastJson) return;
    lastJson = json;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await saveEpisode(JSON.parse(json));
      saved = true;
      setTimeout(() => (saved = false), 1500);
    }, 300);
  });

  const cls = $derived(ep ? classify(ep, clock.now) : null);
  const flag = $derived(ep ? redFlagFor(ep) : null);
  let auraYes = $state((orig?.aura.length ?? 0) > 0);
  let open = $state<Record<string, boolean>>({});
  let newTrigger = $state('');
  const trigOpts = $derived<Opt[]>([...rankedTriggers(), ...(ep?.triggers ?? []).filter((t) => !rankedTriggers().some((o) => o.id === t)).map((t) => ({ id: t, label: t }))]);

  const toLocal = (iso: string) => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const fromLocal = (v: string) => new Date(v).toISOString();

  function setAura(yes: boolean) {
    auraYes = yes;
    if (!yes && ep) {
      ep.aura = [];
      ep.auraDurationMin = undefined;
    }
  }
  async function addTrigger() {
    const t = newTrigger.trim();
    if (!t || !ep) return;
    await addCustomTrigger(t);
    if (!ep.triggers.includes(t)) ep.triggers.push(t);
    newTrigger = '';
  }
  async function addMed(m: Parameters<typeof intakeFrom>[0]) {
    ep?.meds.push(intakeFrom(m));
    await rememberMed(m);
  }
  async function del() {
    if (!ep) return;
    clearTimeout(timer);
    lastJson = JSON.stringify(null);
    const copy = ep;
    ep = null;
    await removeEpisode(copy);
    back('/');
  }
  const toggle = (k: string) => (open[k] = !open[k]);
</script>

<div class="page fade">
  <PageHeader title="Episodio" fallback="/" />

  {#if !ep}
    <p class="muted">Episodio non trovato.</p>
    <button class="btn" onclick={() => go('/')}>Torna a Oggi</button>
  {:else}
    <p class="small muted saved" aria-live="polite">{saved ? 'Salvato' : ' '}</p>

    {#if flag}
      <div class="alert danger"><strong>{flag}</strong><a href="#/redflags">Controlla i segnali d'allarme</a></div>
    {/if}

    <section class="card">
      <h3 style="margin-top:0">Orari</h3>
      <div class="field">
        <label for="start">Inizio</label>
        <input id="start" type="datetime-local" value={toLocal(ep.start)} max={toLocal(new Date().toISOString())} onchange={(e) => ep && (ep.start = fromLocal(e.currentTarget.value))} />
      </div>
      {#if ep.end}
        <div class="field">
          <label for="end">Fine</label>
          <input id="end" type="datetime-local" value={toLocal(ep.end)} min={toLocal(ep.start)} max={toLocal(new Date().toISOString())} onchange={(e) => ep && (ep.end = fromLocal(e.currentTarget.value))} />
        </div>
        <p class="small muted">Durata: {formatDuration(durationMin(ep))}</p>
        <button class="btn link" onclick={() => ep && (ep.end = null)}>È ancora in corso</button>
      {:else}
        <p class="small muted">In corso da {formatDuration(durationMin(ep, clock.now))}</p>
        <TimeChips label="Quando è finito?" unset min={ep.start} bind:value={() => ep?.end ?? new Date().toISOString(), (v) => ep && (ep.end = v)} />
      {/if}
    </section>

    <section class="card">
      <h3 style="margin-top:0">Intensità <span class="muted small">{ep.intensity}/10 · {LEVEL_LABEL[intensityLevel(ep.intensity)]}</span></h3>
      <div class="grid10" role="group" aria-label="Intensità da 0 a 10">
        {#each Array(11) as _, i (i)}
          <button class="chip n" class:i1={i > 0 && i <= 3 && ep.intensity === i} class:i2={i >= 4 && i <= 6 && ep.intensity === i} class:i3={i >= 7 && ep.intensity === i} aria-pressed={ep.intensity === i} onclick={() => ep && (ep.intensity = i)}>{i}</button>
        {/each}
      </div>
      <div class="field" style="margin-top:12px">
        <span class="label">Picco massimo (se diverso)</span>
        <div class="grid10">
          {#each Array(11) as _, i (i)}
            <button class="chip n" aria-pressed={ep.peak === i} onclick={() => ep && (ep.peak = ep.peak === i ? undefined : i)}>{i}</button>
          {/each}
        </div>
      </div>
    </section>

    <section class="card">
      <h3 style="margin-top:0">Dove fa male?</h3>
      <Chips options={SIDES} bind:value={ep.side} multi={false} seg />
      <div style="height:12px"></div>
      <Chips options={LOCATIONS} bind:value={ep.locations} />
    </section>

    <section class="card">
      <h3 style="margin-top:0">Com'è il dolore?</h3>
      <Chips options={QUALITIES} bind:value={ep.quality} />
    </section>

    <section class="card">
      <h3 style="margin-top:0">Sintomi</h3>
      <Chips options={SYMPTOMS} bind:value={ep.symptoms} />
      <button class="btn link" onclick={() => toggle('auto')}>{open.auto ? '▾' : '▸'} Occhio / naso dal lato del dolore</button>
      {#if open.auto || ep.autonomic.length}
        <Chips options={AUTONOMIC} bind:value={ep.autonomic} />
      {/if}
    </section>

    <section class="card">
      <h3 style="margin-top:0">Aura</h3>
      <div class="seg">
        <button class="chip" aria-pressed={!auraYes} onclick={() => setAura(false)}>No</button>
        <button class="chip" aria-pressed={auraYes} onclick={() => setAura(true)}>Sì</button>
      </div>
      {#if auraYes}
        <div style="height:12px"></div>
        <Chips options={AURAS} bind:value={ep.aura} />
        <div class="field" style="margin-top:12px">
          <label for="auradur">Quanto è durata l'aura? (minuti)</label>
          <input id="auradur" type="number" inputmode="numeric" min="0" max="1440" value={ep.auraDurationMin ?? ''} oninput={(e) => ep && (ep.auraDurationMin = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))} />
        </div>
      {/if}
    </section>

    <section class="card">
      <h3 style="margin-top:0">Fattori scatenanti</h3>
      <Chips options={trigOpts} bind:value={ep.triggers} />
      <div class="row" style="margin-top:12px">
        <input type="text" placeholder="Aggiungi un altro…" bind:value={newTrigger} onkeydown={(e) => e.key === 'Enter' && addTrigger()} />
        <button class="btn" onclick={addTrigger} disabled={!newTrigger.trim()}>Aggiungi</button>
      </div>
    </section>

    <section class="card">
      <h3 style="margin-top:0">Farmaci presi</h3>
      {#each ep.meds as m, i (m.id)}
        <div class="med">
          <div class="row">
            <strong class="grow">{m.name}</strong>
            <span class="small muted">{classLabel(m.cls)}</span>
            <button class="btn ghost" aria-label="Rimuovi {m.name}" onclick={() => ep && ep.meds.splice(i, 1)}>✕</button>
          </div>
          <div class="row">
            <input type="datetime-local" aria-label="Ora" value={toLocal(m.time)} onchange={(e) => (m.time = fromLocal(e.currentTarget.value))} />
            <input type="text" aria-label="Dose" placeholder="Dose" style="width:40%" bind:value={m.dose} />
          </div>
          <span class="label">Effetto dopo 2 ore</span>
          <Chips options={EFFICACY} bind:value={m.efficacy} multi={false} seg />
          <label class="check"><input type="checkbox" bind:checked={m.recurrence24h} /> Il dolore è tornato entro 24 h</label>
        </div>
      {/each}
      <MedPicker onpick={addMed} limit={4} />
    </section>

    <section class="card">
      <h3 style="margin-top:0">Quanto ti ha limitato?</h3>
      <Chips options={DISABILITY} bind:value={ep.disability} multi={false} seg />
    </section>

    <section class="card">
      <h3 style="margin-top:0">Note</h3>
      <textarea bind:value={ep.notes} placeholder="Qualcosa da ricordare…"></textarea>
      <label class="check"><input type="checkbox" bind:checked={ep.forDoctor} /> Da mostrare al medico (comparirà nel report)</label>
    </section>

    {#if cls}
      <section class="card">
        <h3 style="margin-top:0">Classificazione indicativa</h3>
        <p><strong>{cls.label}</strong>{cls.incomplete ? ' · dati incompleti' : ''}</p>
        {#if cls.atypicalAura}<p class="small">Aura atipica: discutine col neurologo.</p>{/if}
        <p class="small muted">{CLASSIFY_NOTE}</p>
      </section>
    {/if}

    <a class="btn link block" href="#/redflags">Questo mal di testa è diverso dal solito?</a>
    <button class="btn block ghost danger" onclick={del}>Elimina episodio</button>
  {/if}
</div>

<style>
  .saved { height: 1.2em; margin: -8px 0 4px; text-align: right; }
  .grid10 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  .n { padding: 0; text-align: center; border-radius: var(--radius-sm); }
  .n[aria-pressed='true']::before { content: ''; }
  .med { border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; }
  .check { display: flex; gap: 10px; align-items: center; min-height: 48px; }
  .check input { width: 22px; height: 22px; }
  .danger { color: var(--i3); margin-top: 8px; }
</style>
