<script lang="ts">
  import { AURAS, RED_FLAGS_SOON, RED_FLAGS_URGENT, SIDE_EFFECTS, SIDES, STOP_REASONS, SYMPTOMS, THRESHOLDS, TRIGGERS, FREQUENCIES, classLabel, labelOf } from '../lib/catalog';
  import { CLASS_LABEL, chronicStatus, computeStats, cycleCorrelation, dayKey, formatDuration, hit6Impact, midasGrade, mohStatus, prophylaxisEfficacy, type ClassId } from '../lib/clinic';
  import { dayInfoMap, dayMarks, effectiveWindow, firstRecord, fmt1, fmtDay, monthsIn, pct, prevalentSide, rollingWindow, tally } from '../lib/analytics';
  import { data, saveProfile } from '../lib/db.svelte';
  import { clock } from '../lib/episodes.svelte';
  import { settings } from '../lib/settings.svelte';
  import { haptic } from '../lib/ui.svelte';
  import MonthGrid from '../components/MonthGrid.svelte';
  import PageHeader from '../components/PageHeader.svelte';

  const PERIODS = [1, 3, 6];
  let months = $state(3);

  const today = $derived(dayKey(clock.now));
  const range = $derived(rollingWindow(today, months));
  const first = $derived(firstRecord(data.episodes, data.days));
  const eff = $derived(effectiveWindow(range.from, range.to, first));
  const s = $derived(computeStats(data.episodes, eff.from, eff.to, clock.now));
  const generated = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

  // 2. Mini-calendari
  const cal = $derived(monthsIn(range.from, range.to));
  const marks = $derived(dayMarks(data.episodes, range.from, range.to, clock.now));
  const days = $derived(dayInfoMap(data.days));
  const showPeriod = $derived(settings.trackCycle || data.days.some((d) => d.period || d.periodStart));

  // 3. Metriche per mese (ogni mese ritagliato sul periodo)
  const monthly = $derived(
    cal.map((m) => {
      const f = m.from < eff.from ? eff.from : m.from;
      const t = m.to > eff.to ? eff.to : m.to;
      const st = f <= t ? computeStats(data.episodes, f, t, clock.now) : null;
      const partial = m.from < eff.from || m.to > eff.to;
      return { m, st, partial, f, t };
    })
  );
  const usedClasses = $derived(
    Object.keys(s.medDaysByClass).sort((a, b) => (s.medDaysByClass[b] ?? 0) - (s.medDaysByClass[a] ?? 0))
  );
  const byClass = (st: { medDaysByClass: Record<string, number> }) =>
    usedClasses.filter((c) => st.medDaysByClass[c]).map((c) => `${shortClass(c)} ${st.medDaysByClass[c]}`).join(', ') || '–';
  const shortClass = (c: string) => classLabel(c).split(' /')[0];

  // 5. MOH e cronicità
  const moh = $derived(mohStatus(data.episodes, today).filter((r) => r.days > 0 || r.status !== 'ok'));
  const MOH_LABEL = { ok: 'nei limiti', warn: 'vicino alla soglia', over: 'oltre la soglia' } as const;
  const chronic = $derived(chronicStatus(data.episodes, clock.now));

  // 6. Fenotipo
  const classes = $derived((Object.entries(s.classes) as [ClassId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]));
  const side = $derived(prevalentSide(s.sides));
  const auraTypes = $derived(tally(s.episodes.map((e) => e.aura), s.episodes.length));
  const cycle = $derived(data.days.some((d) => d.period || d.periodStart) ? cycleCorrelation(s.episodes, data.days, clock.now) : null);

  // 7. Questionari
  const midas = $derived(data.questionnaires.filter((q) => q.type === 'midas'));
  const hit6 = $derived(data.questionnaires.filter((q) => q.type === 'hit6'));

  // 8. Profilassi
  const proph = $derived(
    data.prophylaxis
      .map((p) => ({ p, r: prophylaxisEfficacy(p, data.episodes, clock.now), current: !p.endDate || p.endDate >= today }))
      .sort((a, b) => Number(b.current) - Number(a.current) || b.p.startDate.localeCompare(a.p.startDate))
  );

  // 9. Red flags e note per il medico
  const flagLabel = (id: string) => labelOf([...RED_FLAGS_URGENT, ...RED_FLAGS_SOON], id);
  const flagged = $derived(s.episodes.filter((e) => e.redFlags.length));
  const notes = $derived(s.episodes.filter((e) => e.forDoctor && e.notes.trim()));

  let nameTimer: ReturnType<typeof setTimeout>;
  function setName(v: string) {
    data.profile.name = v;
    clearTimeout(nameTimer);
    nameTimer = setTimeout(saveProfile, 400);
  }
  const delta = (a: number, b?: number) => (b == null ? '' : ` (prima ${b}, ${a - b > 0 ? '+' : ''}${a - b})`);
</script>

<svelte:head><title>Diario cefalea – report</title></svelte:head>

<div class="page fade report-page">
  <PageHeader title="Report per il neurologo" fallback="/stats" />

  <div class="no-print controls">
    <div class="field">
      <label for="pname">Nome (facoltativo, compare sul report)</label>
      <input id="pname" type="text" autocomplete="name" value={data.profile.name ?? ''} oninput={(e) => setName(e.currentTarget.value)} />
    </div>
    <span class="label">Periodo</span>
    <div class="seg" role="group" aria-label="Periodo">
      {#each PERIODS as n (n)}
        <button class="chip" aria-pressed={months === n} onclick={() => ((months = n), haptic())}>{n === 1 ? '1 mese' : `${n} mesi`}</button>
      {/each}
    </div>
    <button class="btn primary block print-btn" onclick={() => window.print()}>Stampa o salva PDF</button>
    <p class="small muted">Il report è pensato per stare su un foglio A4. Nella finestra di stampa scegli "Salva come PDF" per condividerlo.</p>
  </div>

  <article class="doc">
    <!-- 1. Intestazione -->
    <header class="dochead">
      <div>
        <h1>Diario cefalea</h1>
        {#if data.profile.name}<div class="pname">{data.profile.name}</div>{/if}
      </div>
      <div class="meta">
        Periodo: <strong>{fmtDay(eff.from)} – {fmtDay(eff.to)}</strong> ({eff.days} giorni)<br />
        Generato il {generated} · {s.episodes.length} episodi
      </div>
    </header>

    {#if !data.episodes.length}
      <p class="muted">Nessun episodio registrato.</p>
    {/if}

    <!-- 2. Mini-calendari -->
    <section>
      <div class="cals" style="--cols:{Math.min(cal.length, 4)}">
        {#each cal as m (m.from)}
          <div class="cal">
            <div class="calt">{m.label}</div>
            <MonthGrid year={m.year} month={m.month} {marks} {days} {showPeriod} compact from={range.from} to={range.to} />
          </div>
        {/each}
      </div>
      <div class="legend">
        <span><i class="sq none"></i>nessuna</span>
        <span><i class="sq i1"></i>lieve 1–3</span>
        <span><i class="sq i2"></i>moderata 4–6</span>
        <span><i class="sq i3"></i>forte 7–10</span>
        <span>numero = intensità max</span>
        <span><i class="pd"></i> sintomatico</span>
        <span><b>A</b> aura</span>
        {#if showPeriod}<span><b>M</b> flusso mestruale</span>{/if}
      </div>
    </section>

    <!-- 3. Metriche per mese -->
    <section>
      <h2>Metriche</h2>
      <table>
        <thead>
          <tr>
            <th>Mese</th><th class="r">Gg cefalea</th><th class="r">Gg emicrania</th><th class="r">Gg sintomatici</th><th>per classe</th><th class="r">Int. media</th><th class="r">Durata media</th><th class="r">Gg a letto</th>
          </tr>
        </thead>
        <tbody>
          {#each monthly as { m, st, partial, f, t } (m.from)}
            {#if st}
              <tr>
                <td>{m.label}{#if partial}<span class="muted"> ({Number(f.slice(8))}–{Number(t.slice(8))})</span>{/if}</td>
                <td class="r">{st.headacheDays}</td>
                <td class="r">{st.migraineDays}</td>
                <td class="r">{st.medDays}</td>
                <td>{byClass(st)}</td>
                <td class="r">{fmt1(st.avgIntensity)}</td>
                <td class="r">{st.avgDurationMin == null ? '–' : formatDuration(st.avgDurationMin)}</td>
                <td class="r">{st.bedDays}</td>
              </tr>
            {/if}
          {/each}
          <tr class="tot">
            <td>Media ogni 30 giorni</td>
            <td class="r">{fmt1(s.per30(s.headacheDays))}</td>
            <td class="r">{fmt1(s.per30(s.migraineDays))}</td>
            <td class="r">{fmt1(s.per30(s.medDays))}</td>
            <td>{usedClasses.map((c) => `${shortClass(c)} ${fmt1(s.per30(s.medDaysByClass[c]))}`).join(', ') || '–'}</td>
            <td class="r">{fmt1(s.avgIntensity)}</td>
            <td class="r">{s.avgDurationMin == null ? '–' : formatDuration(s.avgDurationMin)}{s.medianDurationMin != null ? ` (med. ${formatDuration(s.medianDurationMin)})` : ''}</td>
            <td class="r">{fmt1(s.per30(s.bedDays))}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div class="cols">
      <!-- 4. Sintomatici -->
      <section>
        <h2>Farmaci sintomatici</h2>
        {#if s.efficacy.length}
          <table>
            <thead><tr><th>Farmaco</th><th class="r">Gg/30</th><th class="r">Risposta completa 2 h</th><th class="r">Recidiva 24 h</th></tr></thead>
            <tbody>
              {#each s.efficacy as r (r.name)}
                <tr>
                  <td>{r.name} <span class="muted">({shortClass(r.cls)})</span></td>
                  <td class="r">{fmt1(s.per30(r.days))}</td>
                  <td class="r">{r.n ? `${pct(r.complete / r.n)} (n=${r.n})` : '–'}</td>
                  <td class="r">{r.n ? pct(r.recurrence / r.n) : '–'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="muted">Nessun sintomatico registrato.</p>
        {/if}
      </section>

      <!-- 5. MOH e cronicità -->
      <section class="box">
        <h2>Uso eccessivo e cronicità</h2>
        <p class="sub">Ultimi 30 giorni (soglie: semplici {THRESHOLDS.mohSimple} gg, triptani/ergot/oppioidi/combinati {THRESHOLDS.mohComplex} gg)</p>
        {#if moh.length}
          <ul>
            {#each moh as r (r.key)}
              <li>
                <span class:strong={r.status !== 'ok'}>{r.status === 'ok' ? '' : r.status === 'over' ? '▲ ' : '△ '}{r.label}: {r.days}/{r.limit} gg, {MOH_LABEL[r.status]}{r.persistent ? ', da oltre 3 mesi' : ''}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p>Nessun sintomatico negli ultimi 30 giorni.</p>
        {/if}
        <p>
          ≥{THRESHOLDS.chronicDays} giorni di cefalea / 30: <strong>{chronic.chronic ? 'sì' : 'no'}</strong>{chronic.chronic ? `, da ${chronic.months} ${chronic.months === 1 ? 'mese' : 'mesi'} consecutivi` : ''}.
          {#if chronic.possibleChronicMigraine}<strong> Possibile emicrania cronica.</strong>{/if}
        </p>
      </section>
    </div>

    <div class="cols">
      <!-- 6. Fenotipo -->
      <section>
        <h2>Fenotipo</h2>
        {#if s.episodes.length}
          <ul>
            <li>Classificazione: {classes.map(([id, n]) => `${CLASS_LABEL[id].replace('Compatibile con ', '')} ${pct(n / s.episodes.length)}`).join('; ')}</li>
            <li>Lato prevalente: {side ? `${labelOf(SIDES, side.id).toLowerCase()} (${pct(side.count / s.episodes.length)})` : 'non indicato'}</li>
            <li>Sintomi: {s.symptoms.slice(0, 5).map((x) => `${labelOf(SYMPTOMS, x.id).toLowerCase()} ${pct(x.pct)}`).join(', ') || '–'}</li>
            <li>Aura: {s.auraCount ? `${s.auraCount} episodi (${pct(s.auraCount / s.episodes.length)}); ${auraTypes.map((a) => `${labelOf(AURAS, a.id).toLowerCase()} ${a.count}`).join(', ')}` : 'nessuna'}</li>
            <li>Trigger principali: {s.triggers.slice(0, 3).map((x) => `${labelOf(TRIGGERS, x.id).toLowerCase()} ${pct(x.pct)}`).join(', ') || '–'}</li>
            {#if cycle}
              <li>Attacchi di emicrania perimestruali (−2/+3 gg): {pct(cycle.pct)} ({cycle.perimenstrual}/{cycle.total}; atteso ~20%){cycle.pattern ? '. Pattern compatibile con emicrania correlata al ciclo.' : ''}</li>
            {/if}
          </ul>
        {:else}
          <p class="muted">Nessun episodio nel periodo.</p>
        {/if}
      </section>

      <!-- 7. Questionari -->
      <section>
        <h2>Questionari</h2>
        <ul>
          <li>
            MIDAS:
            {#if midas[0]}
              {@const g = midasGrade(midas[0].score)}
              <strong>{midas[0].score}</strong>, grado {g.grade} ({g.label.toLowerCase()}){midas[0].a != null ? `; A ${midas[0].a} gg` : ''}{midas[0].b != null ? `, B ${midas[0].b}/10` : ''} – {fmtDay(midas[0].date)}{delta(midas[0].score, midas[1]?.score)}
            {:else}non compilato{/if}
          </li>
          <li>
            HIT-6:
            {#if hit6[0]}
              <strong>{hit6[0].score}</strong> ({hit6Impact(hit6[0].score).toLowerCase()}) – {fmtDay(hit6[0].date)}{delta(hit6[0].score, hit6[1]?.score)}
            {:else}non compilato{/if}
          </li>
        </ul>
      </section>
    </div>

    <!-- 8. Profilassi -->
    <section>
      <h2>Profilassi</h2>
      {#if proph.length}
        <table>
          <thead><tr><th>Farmaco</th><th>Dose</th><th>Date</th><th>Stop / effetti collaterali</th><th class="r">Gg emicrania/30 prima → dopo</th><th class="r">Var.</th><th>Responder</th></tr></thead>
          <tbody>
            {#each proph as { p, r, current } (p.id)}
              <tr>
                <td>{p.name}{current ? '' : ' (sospeso)'}</td>
                <td>{[p.dose, p.frequency ? labelOf(FREQUENCIES, p.frequency).toLowerCase() : ''].filter(Boolean).join(', ') || '–'}</td>
                <td>{fmtDay(p.startDate)} – {p.endDate ? fmtDay(p.endDate) : 'in corso'}</td>
                <td>
                  {[p.stopReason ? labelOf(STOP_REASONS, p.stopReason) : '', [...new Set(p.sideEffects.map((x) => x.id))].map((x) => labelOf(SIDE_EFFECTS, x).toLowerCase()).join(', ')].filter(Boolean).join('; ') || '–'}
                </td>
                <td class="r">{fmt1(r.baseline)} → {fmt1(r.current)}</td>
                <td class="r">{r.change == null ? '–' : `${r.change > 0 ? '+' : ''}${Math.round(r.change * 100)}%`}</td>
                <td>{r.evaluable ? (r.responder ? 'sì (≥50%)' : r.responderChronic ? 'no (≥30%)' : 'no') : `da valutare (tra ${r.daysToEvaluation} gg)`}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="muted">Nessuna profilassi registrata.</p>
      {/if}
    </section>

    <!-- 9. Red flags e note -->
    {#if flagged.length || notes.length}
      <section>
        <h2>Segnalazioni e note per il medico</h2>
        <ul>
          {#each flagged as e (e.id)}
            <li><strong>▲ {fmtDay(dayKey(e.start))}</strong>: {e.redFlags.map(flagLabel).join('; ')}</li>
          {/each}
          {#each notes.slice(0, 8) as e (e.id)}
            <li><strong>{fmtDay(dayKey(e.start))}</strong>: {e.notes.trim().length > 220 ? e.notes.trim().slice(0, 220) + '…' : e.notes.trim()}</li>
          {/each}
          {#if notes.length > 8}<li class="muted">… altre {notes.length - 8} note nell'app.</li>{/if}
        </ul>
      </section>
    {/if}

    <!-- 10. Piè di pagina -->
    <footer>Dati auto-riferiti dal paziente; le classificazioni sono indicative e non costituiscono diagnosi. Generato con Blank Out.</footer>
  </article>
</div>

<style>
  .controls { margin-bottom: 20px; }
  .print-btn { margin: 16px 0 8px; }

  .doc { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; font-size: 0.72rem; line-height: 1.3; }
  .dochead { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid var(--text); padding-bottom: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .dochead h1 { font-size: 1.5rem; margin: 0; }
  .pname { font-size: 1.1rem; font-weight: 600; }
  .meta { text-align: right; color: var(--muted); }
  section { margin-bottom: 8px; break-inside: avoid; }
  h2 { font-size: 0.95rem; margin: 0 0 4px; border-bottom: 1px solid var(--border); padding-bottom: 2px; }
  .sub { color: var(--muted); margin: 0 0 2px; }
  p { margin: 2px 0; }
  ul { margin: 0; padding-left: 14px; }
  li { margin: 1px 0; }
  .strong { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--border); padding: 1px 4px 1px 0; vertical-align: bottom; }
  td { padding: 1px 4px 1px 0; border-bottom: 1px solid var(--border); vertical-align: top; }
  .r { text-align: right; }
  .tot td { font-weight: 700; border-bottom: none; }
  .cols { display: grid; grid-template-columns: 1fr; gap: 0 16px; }
  .box { border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; }
  .box h2 { border: none; }
  .cals { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 12px; }
  .calt { font-weight: 600; text-transform: capitalize; margin-bottom: 1px; }
  .legend { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 4px; color: var(--muted); align-items: center; }
  .legend span { display: inline-flex; align-items: center; gap: 3px; }
  .sq { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .sq.none { border: 1px solid var(--border); }
  .pd { width: 4px; height: 4px; border-radius: 50%; background: var(--text); display: inline-block; }
  footer { margin-top: 8px; padding-top: 4px; border-top: 1px solid var(--border); color: var(--muted); font-style: italic; }

  @media (min-width: 560px) {
    .cols { grid-template-columns: 1fr 1fr; }
    .cals { grid-template-columns: repeat(var(--cols), 1fr); }
  }

  @page { size: A4; margin: 12mm; }
  @media print {
    .report-page { padding: 0; }
    .doc { border: none; border-radius: 0; padding: 0; font-size: 7.5pt; background: #fff; color: #111; }
    .dochead h1 { font-size: 14pt; }
    .pname { font-size: 11pt; }
    h2 { font-size: 8.5pt; }
    .cols { grid-template-columns: 1fr 1fr; }
    .cals { grid-template-columns: repeat(var(--cols), 1fr); gap: 4px 8px; }
    .sq, :global(.compact .circle) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
