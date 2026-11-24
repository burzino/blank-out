<script lang="ts">
  import { LEVEL_LABEL, intensityLevel } from '../lib/catalog';
  import { dayKey, keyToDate } from '../lib/clinic';
  import { dayInfoMap, dayMarks, fmtTime, monthSpan } from '../lib/analytics';
  import { data, deleteEpisode, getDay, newEpisode, saveDay, saveEpisode } from '../lib/db.svelte';
  import { clock } from '../lib/episodes.svelte';
  import { go } from '../lib/router.svelte';
  import { settings } from '../lib/settings.svelte';
  import { haptic, toast } from '../lib/ui.svelte';
  import type { DayInfo, Episode } from '../lib/types';
  import CheckIn from '../components/CheckIn.svelte';
  import Icon from '../components/Icon.svelte';
  import MonthGrid from '../components/MonthGrid.svelte';
  import Sheet from '../components/Sheet.svelte';

  const today = $derived(dayKey(clock.now));
  const t0 = new Date();
  let year = $state(t0.getFullYear());
  let month = $state(t0.getMonth());
  let selected = $state<string | undefined>();
  let sheetOpen = $state(false);

  const span = $derived(monthSpan(year, month));
  const marks = $derived(dayMarks(data.episodes, span.from, span.to, clock.now));
  const days = $derived(dayInfoMap(data.days));
  const showPeriod = $derived(settings.trackCycle || data.days.some((d) => d.period || d.periodStart));
  const isCurrent = $derived(year === clock.now.getFullYear() && month === clock.now.getMonth());

  const summary = $derived.by(() => {
    let headache = 0;
    let med = 0;
    for (const m of marks.values()) {
      if (m.level || m.episodes.length) headache++;
      if (m.med) med++;
    }
    return { headache, med };
  });

  function shift(n: number) {
    const d = new Date(year, month + n, 1);
    year = d.getFullYear();
    month = d.getMonth();
    haptic();
  }
  function goToday() {
    year = clock.now.getFullYear();
    month = clock.now.getMonth();
    haptic();
  }
  function pick(k: string) {
    selected = k;
    sheetOpen = true;
    checkinOpen = false;
  }

  // Check-in di un giorno passato (o di oggi). Compilato a posteriori: le ore registrate sono successive a un
  // eventuale attacco di quel giorno, quindi i fattori della giornata non verranno usati come "prima dell'attacco".
  let checkinOpen = $state(false);
  const selCheckin = $derived(selected ? days.get(selected)?.checkin : undefined);

  const sel = $derived(selected ? marks.get(selected) : undefined);
  const selInfo = $derived<DayInfo>(selected ? (days.get(selected) ?? { date: selected }) : { date: '' });
  const selTitle = $derived(selected ? keyToDate(selected).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '');

  function span2(e: Episode) {
    const sameDay = (iso: string) => dayKey(iso) === selected;
    const f = (iso: string) => (sameDay(iso) ? fmtTime(iso) : new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    return `${f(e.start)} – ${e.end ? f(e.end) : 'in corso'}`;
  }

  async function toggleDay(field: 'period' | 'periodStart' | 'headacheFree') {
    if (!selected) return;
    const next: DayInfo = { ...(getDay(selected) ?? { date: selected }) };
    next[field] = !next[field];
    // Il primo giorno del ciclo è anche un giorno di flusso
    if (field === 'periodStart' && next.periodStart) next.period = true;
    if (field === 'period' && !next.period) next.periodStart = false;
    await saveDay(next);
    haptic();
  }

  async function addEpisode() {
    if (!selected || selected > today) return;
    const base = keyToDate(selected);
    let start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9, 0);
    let end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 11, 0);
    // Oggi: l'episodio non può finire nel futuro
    if (end > clock.now) {
      end = new Date();
      start = new Date(end.getTime() - 2 * 3600000);
    }
    const e = newEpisode({ start: start.toISOString(), end: end.toISOString(), intensity: 5 });
    await saveEpisode(e);
    haptic();
    toast('Episodio aggiunto', { label: 'Annulla', run: () => deleteEpisode(e.id) });
    sheetOpen = false;
    go('/episode?id=' + e.id);
  }
</script>

<div class="page fade">
  <h1>Calendario</h1>

  {#if data.episodes.length === 0}
    <p class="card muted">Ancora nessun episodio. Quando arriva, basta un tocco.</p>
  {/if}

  <div class="nav row">
    <button class="btn ghost" onclick={() => shift(-1)} aria-label="Mese precedente"><Icon name="back" /></button>
    <h2 class="grow">{span.label}</h2>
    {#if !isCurrent}<button class="btn ghost" onclick={goToday}>Oggi</button>{/if}
    <button class="btn ghost" onclick={() => shift(1)} aria-label="Mese successivo"><Icon name="chevron" /></button>
  </div>

  <p class="summary small">
    <span><strong class="num">{summary.headache}</strong> {summary.headache === 1 ? 'giorno' : 'giorni'} con mal di testa</span>
    <span><strong class="num">{summary.med}</strong> {summary.med === 1 ? 'giorno' : 'giorni'} con farmaci</span>
  </p>

  <section class="card grid-card">
    <MonthGrid {year} {month} {marks} {days} {showPeriod} {today} selected={sheetOpen ? selected : undefined} onpick={pick} />
  </section>

  <ul class="legend small muted" aria-label="Legenda">
    <li><span class="dot i1"></span>Lieve 1–3</li>
    <li><span class="dot i2"></span>Moderato 4–6</li>
    <li><span class="dot i3"></span>Forte 7–10</li>
    <li><b class="num">7</b> intensità massima</li>
    <li><span class="pill"><Icon name="pill" size={14} /></span>Farmaco</li>
    <li><b>A</b> Aura</li>
    {#if showPeriod}<li><span class="flow"><Icon name="drop" size={14} /></span>Ciclo</li>{/if}
    <li><span class="free">✓</span>Nessun mal di testa</li>
  </ul>
</div>

<Sheet bind:open={sheetOpen} title={selTitle}>
  {#if sel?.episodes.length}
    <div class="stack">
      {#each sel.episodes as e (e.id)}
        {@const pain = Math.max(e.intensity, e.peak ?? 0)}
        {@const lvl = intensityLevel(pain)}
        <a class="list-item" href={'#/episode?id=' + e.id}>
          <span class="badge num" class:i1={lvl === 1} class:i2={lvl === 2} class:i3={lvl === 3}>{pain}</span>
          <span class="grow">
            <strong class="num">{span2(e)}</strong><br />
            <span class="small muted">{LEVEL_LABEL[lvl]}{e.meds.length ? ' · ' + e.meds.map((m) => m.name).join(', ') : ''}{e.aura.length ? ' · aura' : ''}</span>
          </span>
          <Icon name="chevron" />
        </a>
      {/each}
    </div>
  {:else}
    <p class="muted">Nessun episodio registrato in questo giorno.</p>
  {/if}

  {#if selected && selected <= today}
    <button class="btn block" style="margin-top:12px" onclick={addEpisode}><Icon name="plus" /> Aggiungi episodio per questo giorno</button>

    <div class="toggles">
      {#if !sel?.episodes.length}
        <button class="chip" aria-pressed={!!selInfo.headacheFree} onclick={() => toggleDay('headacheFree')}>Nessun mal di testa</button>
      {/if}
      {#if showPeriod}
        <button class="chip" aria-pressed={!!selInfo.period} onclick={() => toggleDay('period')}>Ciclo (flusso)</button>
        <button class="chip" aria-pressed={!!selInfo.periodStart} onclick={() => toggleDay('periodStart')}>Primo giorno del ciclo</button>
      {/if}
    </div>

    {#if checkinOpen}
      <div class="day-checkin">
        {#key selected}<CheckIn date={selected} />{/key}
      </div>
    {:else}
      <button class="btn block" style="margin-top:16px" aria-expanded="false" onclick={() => (checkinOpen = true)}>
        {selCheckin ? 'Vedi o modifica il check-in del giorno' : 'Compila il check-in del giorno'}
      </button>
    {/if}
  {:else}
    <p class="small muted">Questo giorno non è ancora arrivato.</p>
  {/if}
</Sheet>

<style>
  .nav { margin: 0 -8px 4px; }
  .nav h2 { margin: 0; text-align: center; text-transform: capitalize; font-size: 1.15rem; }
  .nav .btn { padding: 8px 12px; border: none; }
  .summary { display: flex; flex-wrap: wrap; gap: 4px 16px; justify-content: center; color: var(--muted); }
  .summary strong { color: var(--text); font-size: 1.05rem; }
  .grid-card { padding: 8px 6px; }
  .legend { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-wrap: wrap; gap: 8px 16px; }
  .legend li { display: flex; align-items: center; gap: 6px; }
  .pill { color: var(--accent); display: inline-flex; }
  .flow { color: var(--i3); display: inline-flex; }
  .free { color: var(--i1); font-weight: 700; }
  .badge { min-width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; background: var(--surface-2); }
  .day-checkin { margin-top: 16px; }
  .toggles { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
</style>
