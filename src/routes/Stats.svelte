<script lang="ts">
  import { CLASSIFY_NOTE, LEVEL_LABEL, SIDES, SYMPTOMS, THRESHOLDS, TRIGGERS, classLabel, labelOf } from '../lib/catalog';
  import { CLASS_LABEL, chronicStatus, computeStats, cycleCorrelation, dayKey, formatDuration, mohStatus, prophylaxisEfficacy, type ClassId } from '../lib/clinic';
  import { effectiveWindow, firstRecord, fmt1, fmtDay, lastMonths, monthAxisPos, pct, prevalentSide, rollingWindow } from '../lib/analytics';
  import { data } from '../lib/db.svelte';
  import { clock } from '../lib/episodes.svelte';
  import { haptic } from '../lib/ui.svelte';
  import BarChart, { type BarMarker } from '../components/BarChart.svelte';

  const PERIODS = [1, 3, 6, 12];
  let months = $state(3);

  const today = $derived(dayKey(clock.now));
  const first = $derived(firstRecord(data.episodes, data.days));
  const win = $derived.by(() => {
    const w = rollingWindow(today, months);
    return effectiveWindow(w.from, w.to, first);
  });
  const s = $derived(computeStats(data.episodes, win.from, win.to, clock.now));
  const few = $derived(!first || win.days < 14);
  const per30 = (n: number) => fmt1(s.per30(n));

  // Barre per mese di calendario (conteggi reali; il mese in corso è parziale)
  const cal = $derived(lastMonths(today, Math.max(3, months)));
  const groups = $derived(
    cal.map((m) => {
      const to = m.to > today ? today : m.to;
      const st = computeStats(data.episodes, m.from, to, clock.now);
      return { label: m.short, values: [st.headacheDays, st.medDays], note: m.to > today ? 'mese in corso' : undefined };
    })
  );
  const markers = $derived.by(() => {
    const out: BarMarker[] = [];
    for (const p of data.prophylaxis) {
      const a = monthAxisPos(cal, p.startDate);
      if (a != null) out.push({ pos: a, label: `Inizio ${p.name} (${fmtDay(p.startDate)})`, kind: 'start' });
      if (p.endDate) {
        const b = monthAxisPos(cal, p.endDate);
        if (b != null) out.push({ pos: b + 1 / 31, label: `Fine ${p.name} (${fmtDay(p.endDate)})`, kind: 'end' });
      }
    }
    return out;
  });

  const levelTotal = $derived(s.levelDist[0] + s.levelDist[1] + s.levelDist[2]);
  const moh = $derived(mohStatus(data.episodes, today).filter((r) => r.days > 0 || r.status !== 'ok'));
  const MOH_LABEL = { ok: 'ok', warn: 'preavviso', over: 'superata' } as const;
  const efficacy = $derived(s.efficacy.filter((r) => r.n >= THRESHOLDS.efficacyMinIntakes));
  const classes = $derived(
    (Object.entries(s.classes) as [ClassId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  );
  const side = $derived(prevalentSide(s.sides));
  const hasCycle = $derived(data.days.some((d) => d.period || d.periodStart));
  const cycle = $derived(hasCycle ? cycleCorrelation(s.episodes, data.days, clock.now) : null);
  const chronic = $derived(chronicStatus(data.episodes, clock.now));
  const proph = $derived(data.prophylaxis.map((p) => ({ p, r: prophylaxisEfficacy(p, data.episodes, clock.now) })).sort((a, b) => b.p.startDate.localeCompare(a.p.startDate)));

  function setPeriod(n: number) {
    months = n;
    haptic();
  }
</script>

<div class="page fade">
  <h1>Statistiche</h1>

  <div class="seg" role="group" aria-label="Periodo">
    {#each PERIODS as n (n)}
      <button class="chip" aria-pressed={months === n} onclick={() => setPeriod(n)}>{n === 1 ? '1 mese' : `${n} mesi`}</button>
    {/each}
  </div>
  <p class="small muted period">
    {#if first}Dal {fmtDay(win.from)} a oggi ({win.days} giorni). Valori riportati a 30 giorni.{:else}Nessun dato registrato.{/if}
  </p>

  {#if few}
    <p class="alert">Servono almeno 2 settimane di dati per vedere delle tendenze.</p>
  {/if}

  {#if chronic.chronic}
    <section class="alert">
      <strong>Mal di testa in almeno {THRESHOLDS.chronicDays} giorni al mese{chronic.months > 1 ? ` da ${chronic.months} mesi` : ''}</strong>
      <span class="small">
        {#if chronic.possibleChronicMigraine}Il quadro è compatibile con una possibile emicrania cronica.{:else}Se continua per più di 3 mesi può trattarsi di una cefalea cronica.{/if}
        Parlane con il neurologo: esistono terapie di prevenzione efficaci.
      </span>
    </section>
  {/if}

  <section class="card">
    <h2 class="first">In media ogni 30 giorni</h2>
    <div class="kpis">
      <div><span class="kpi num">{per30(s.headacheDays)}</span><span class="small muted">giorni con mal di testa</span></div>
      <div><span class="kpi num">{per30(s.migraineDays)}</span><span class="small muted">giorni di emicrania</span></div>
      <div><span class="kpi num">{per30(s.medDays)}</span><span class="small muted">giorni con farmaci sintomatici</span></div>
      <div><span class="kpi num">{per30(s.bedDays)}</span><span class="small muted">giorni a letto</span></div>
      <div><span class="kpi num">{fmt1(s.avgIntensity)}</span><span class="small muted">intensità media /10</span></div>
      <div>
        <span class="kpi num dur">{s.avgDurationMin == null ? '–' : formatDuration(s.avgDurationMin)}</span>
        <span class="small muted">durata media{s.medianDurationMin != null ? ` · mediana ${formatDuration(s.medianDurationMin)}` : ''}</span>
      </div>
    </div>
    <p class="small muted" style="margin:0">{s.episodes.length} {s.episodes.length === 1 ? 'episodio' : 'episodi'} nel periodo.</p>
  </section>

  <section class="card">
    <h2 class="first">Mese per mese</h2>
    <BarChart
      {groups}
      series={[
        { label: 'Giorni con mal di testa', color: 'var(--accent)' },
        { label: 'Giorni con farmaci', color: 'var(--muted)' }
      ]}
      {markers}
    />
    {#if groups.some((g) => g.note)}<p class="small muted note">* mese in corso, ancora parziale.</p>{/if}
    {#if markers.length}
      <ul class="plain small muted">
        {#each markers as m, i (i)}<li>{m.kind === 'start' ? '▼' : '■'} {m.label}</li>{/each}
      </ul>
    {/if}
  </section>

  {#if levelTotal}
    <section class="card">
      <h2 class="first">Intensità degli episodi</h2>
      <div class="segbar" role="img" aria-label={s.levelDist.map((n, i) => `${LEVEL_LABEL[i + 1]} ${n}`).join(', ')}>
        {#each s.levelDist as n, i (i)}
          {#if n}<span class="i{i + 1}" style="flex:{n}">{n}</span>{/if}
        {/each}
      </div>
      <div class="seglegend small">
        {#each s.levelDist as n, i (i)}
          <span class="row"><span class="dot i{i + 1}"></span>{LEVEL_LABEL[i + 1]} <strong class="num">{n}</strong> <span class="muted">({pct(n / levelTotal)})</span></span>
        {/each}
      </div>
    </section>
  {/if}

  <section class="card">
    <h2 class="first">Farmaci sintomatici</h2>
    {#if Object.keys(s.medDaysByClass).length}
      <table>
        <thead><tr><th>Classe</th><th class="r">Giorni</th><th class="r">Ogni 30 gg</th></tr></thead>
        <tbody>
          {#each Object.entries(s.medDaysByClass).sort((a, b) => b[1] - a[1]) as [c, n] (c)}
            <tr><td>{classLabel(c)}</td><td class="r num">{n}</td><td class="r num">{per30(n)}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Nessun farmaco registrato nel periodo.</p>
    {/if}

    <h3>Uso eccessivo (ultimi 30 giorni)</h3>
    {#if moh.length}
      <ul class="plain">
        {#each moh as r (r.key)}
          <li class="mohrow">
            <span class="grow">{r.label}</span>
            <span class="num">{r.days}/{r.limit} gg</span>
            <span class="tag {r.status}">{r.status === 'ok' ? '✓' : '!'} {MOH_LABEL[r.status]}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small muted">Nessun antidolorifico negli ultimi 30 giorni.</p>
    {/if}
    <p class="small muted note">Soglie: antidolorifici semplici {THRESHOLDS.mohSimple} giorni, triptani e simili {THRESHOLDS.mohComplex} giorni ogni 30.</p>
  </section>

  <section class="card">
    <h2 class="first">Quanto funzionano</h2>
    {#if efficacy.length}
      {#each efficacy as r (r.name)}
        <div class="eff">
          <div class="row"><strong class="grow">{r.name}</strong><span class="small muted">{r.n} valutazioni</span></div>
          <div class="segbar thin" role="img" aria-label="Passato {pct(r.complete / r.n)}, parziale {pct(r.partial / r.n)}, nessun effetto {pct(r.none / r.n)}">
            {#if r.complete}<span class="i1" style="flex:{r.complete}"></span>{/if}
            {#if r.partial}<span class="i2" style="flex:{r.partial}"></span>{/if}
            {#if r.none}<span class="i3" style="flex:{r.none}"></span>{/if}
          </div>
          <p class="small">
            Passato <strong class="num">{pct(r.complete / r.n)}</strong> · parziale <strong class="num">{pct(r.partial / r.n)}</strong> · nessun effetto <strong class="num">{pct(r.none / r.n)}</strong> · ritorno entro 24 h <strong class="num">{pct(r.recurrence / r.n)}</strong>
          </p>
        </div>
      {/each}
    {:else}
      <p class="small muted">Servono almeno {THRESHOLDS.efficacyMinIntakes} valutazioni "com'è andata dopo 2 ore" per lo stesso farmaco.</p>
    {/if}
  </section>

  {#if s.episodes.length}
    <section class="card">
      <h2 class="first">Fattori e sintomi</h2>
      {#if s.triggers.length}
        <h3>Fattori scatenanti più frequenti</h3>
        <ul class="plain bars">
          {#each s.triggers.slice(0, 5) as t (t.id)}
            <li><span class="grow">{labelOf(TRIGGERS, t.id)}</span><span class="num">{pct(t.pct)}</span><span class="track"><span style="width:{t.pct * 100}%"></span></span></li>
          {/each}
        </ul>
      {/if}
      {#if s.symptoms.length}
        <h3>Sintomi più frequenti</h3>
        <ul class="plain bars">
          {#each s.symptoms.slice(0, 5) as t (t.id)}
            <li><span class="grow">{labelOf(SYMPTOMS, t.id)}</span><span class="num">{pct(t.pct)}</span><span class="track"><span style="width:{t.pct * 100}%"></span></span></li>
          {/each}
        </ul>
      {/if}
      <p class="small muted note">Percentuale sugli episodi del periodo.</p>
    </section>

    <section class="card">
      <h2 class="first">Che tipo di mal di testa</h2>
      <ul class="plain">
        {#each classes as [id, n] (id)}
          <li class="mohrow"><span class="grow">{CLASS_LABEL[id]}</span><span class="num">{n} ({pct(n / s.episodes.length)})</span></li>
        {/each}
      </ul>
      <p class="small">
        Aura in <strong class="num">{s.auraCount}</strong> {s.auraCount === 1 ? 'episodio' : 'episodi'}.
        {#if side}Lato prevalente: <strong>{labelOf(SIDES, side.id).toLowerCase()}</strong> ({side.count} episodi).{/if}
      </p>
      <p class="small muted note">{CLASSIFY_NOTE}</p>
    </section>
  {/if}

  {#if cycle}
    <section class="card">
      <h2 class="first">Ciclo mestruale</h2>
      <p>
        <strong class="num">{pct(cycle.pct)}</strong> degli attacchi di emicrania ({cycle.perimenstrual} su {cycle.total}) è iniziato tra 2 giorni prima e 3 giorni dopo l'inizio del ciclo.
        <span class="muted">Per caso ci si aspetterebbe circa il 20%.</span>
      </p>
      {#if cycle.pattern}
        <p class="alert" style="margin:0">Pattern compatibile con emicrania correlata al ciclo mestruale: parlane con il neurologo.</p>
      {/if}
    </section>
  {/if}

  {#if proph.length}
    <section class="card">
      <h2 class="first">Profilassi</h2>
      {#each proph as { p, r } (p.id)}
        <div class="eff">
          <div class="row"><strong class="grow">{p.name}</strong><span class="small muted">dal {fmtDay(p.startDate)}{p.endDate ? ` al ${fmtDay(p.endDate)}` : ''}</span></div>
          <p class="small">
            Giorni di emicrania al mese: <strong class="num">{fmt1(r.baseline)}</strong> prima → <strong class="num">{fmt1(r.current)}</strong> {p.endDate ? 'a fine terapia' : 'ora'}
            {#if r.change != null}(<span class="num">{r.change > 0 ? '+' : ''}{Math.round(r.change * 100)}%</span>){/if}
          </p>
          {#if !r.evaluable}
            <p class="small muted">Valutabile tra {r.daysToEvaluation} giorni.</p>
          {:else if r.responder}
            <p class="small"><span class="tag ok">✓ Responder</span> riduzione di almeno il 50%.</p>
          {:else}
            <p class="small"><span class="tag warn">Non responder</span> riduzione inferiore al 50%{r.responderChronic ? ' (almeno 30%: significativa in caso di emicrania cronica)' : ''}.</p>
          {/if}
        </div>
      {/each}
    </section>
  {/if}

  <a class="btn primary block" href="#/report">Report per il neurologo</a>
</div>

<style>
  .period { margin: 8px 0 16px; }
  h2.first { margin-top: 0; }
  .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 12px; margin-bottom: 12px; }
  .kpis div { display: flex; flex-direction: column; }
  .kpi { font-size: 1.8rem; font-weight: 700; line-height: 1.1; }
  .kpi.dur { font-size: 1.3rem; }
  .note { margin: 8px 0 0; }
  .plain { list-style: none; padding: 0; margin: 0; }
  .plain li { padding: 4px 0; }
  .segbar { display: flex; gap: 2px; height: 32px; border-radius: var(--radius-sm); overflow: hidden; }
  .segbar span { display: flex; align-items: center; justify-content: center; font-weight: 700; min-width: 24px; }
  .segbar.thin { height: 12px; margin: 6px 0; }
  .segbar.thin span { min-width: 4px; }
  .seglegend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  th { text-align: left; font-weight: 600; color: var(--muted); font-size: 0.8rem; padding: 4px 0; }
  td { padding: 6px 0; border-top: 1px solid var(--border); }
  .r { text-align: right; }
  .mohrow { display: flex; gap: 12px; align-items: center; border-top: 1px solid var(--border); padding: 8px 0 !important; }
  .mohrow:first-child { border-top: none; }
  .tag { font-size: 0.8rem; font-weight: 700; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); white-space: nowrap; }
  .tag.warn { background: var(--warn-bg); border-color: var(--warn-border); }
  .tag.over { background: var(--danger-bg); border-color: var(--danger-border); }
  .eff { padding: 8px 0; border-top: 1px solid var(--border); }
  .eff:first-of-type { border-top: none; }
  .eff p { margin: 4px 0 0; }
  .bars li { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; }
  .track { grid-column: 1 / -1; height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
  .track span { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
</style>
