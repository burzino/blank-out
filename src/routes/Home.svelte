<script lang="ts">
  import { EFFICACY, LEVEL_LABEL, THRESHOLDS, intensityLevel } from '../lib/catalog';
  import { addDays, computeAlerts, computeStats, dayKey, durationMin, episodeDays, formatDuration, pendingEfficacy, questionnaireDue } from '../lib/clinic';
  import { activeEpisode, data, getDay, saveDay, saveEpisode } from '../lib/db.svelte';
  import { clock, daysSinceLast, endEpisode, takeMed } from '../lib/episodes.svelte';
  import { go, route } from '../lib/router.svelte';
  import { settings } from '../lib/settings.svelte';
  import { haptic, toast } from '../lib/ui.svelte';
  import type { Episode, MedIntake } from '../lib/types';
  import LogSheet from '../components/LogSheet.svelte';
  import MedPicker from '../components/MedPicker.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { drive, reauth } from '../lib/drive.svelte';
  import CheckIn from '../components/CheckIn.svelte';
  import { forecast, riskFactorsToday } from '../lib/advisor/forecast';
  import { personalTriggers } from '../lib/advisor/triggers';
  import { attackPlan, dailyPlan } from '../lib/advisor/coach';
  import type { AdvisorContext } from '../lib/advisor/types';
  import { loadCachedWeather } from '../lib/advisor/weather';

  // Scorciatoia #/log: apre lo sheet una volta sola (tornando indietro non deve riaprirlo)
  // e non apre un secondo episodio se ce n'è già uno in corso
  let logOpen = $state(route.path === '/log' && !activeEpisode());
  if (route.path === '/log') history.replaceState(history.state, '', '#/');
  let copyFrom = $state<Episode | undefined>();
  let medOpen = $state(false);

  const active = $derived(activeEpisode());
  const last = $derived(data.episodes.find((e) => e.end));
  const since = $derived(daysSinceLast());
  const alerts = $derived(computeAlerts(data.episodes, clock.now));
  const pending = $derived(pendingEfficacy(data.episodes, clock.now));
  const today = $derived(dayKey(clock.now));
  const from = $derived(addDays(today, -29));
  const stats = $derived(computeStats(data.episodes, from, today, clock.now));
  const stuck = $derived(active && durationMin(active, clock.now) > THRESHOLDS.stuckEpisodeHours * 60);

  // Striscia di 30 giorni: intensità massima del giorno
  const strip = $derived.by(() => {
    const max = new Map<string, number>();
    for (const e of stats.episodes)
      for (const k of episodeDays(e, clock.now)) max.set(k, Math.max(max.get(k) ?? 0, intensityLevel(Math.max(e.intensity, e.peak ?? 0))));
    return Array.from({ length: 30 }, (_, i) => {
      const k = addDays(from, i);
      return { k, level: max.get(k) ?? 0 };
    });
  });

  // "Oggi tutto bene?": dopo l'ora del promemoria, se oggi non c'è nulla di registrato
  const [rh, rm] = $derived(settings.reminderTime.split(':').map(Number));
  const askToday = $derived(
    settings.reminderEnabled &&
      clock.now.getHours() * 60 + clock.now.getMinutes() >= rh * 60 + rm &&
      !strip[29].level &&
      !active &&
      !getDay(today)?.headacheFree
  );

  const dueQ = $derived(data.episodes.length >= 5 && (questionnaireDue(data.questionnaires, 'midas', clock.now) || questionnaireDue(data.questionnaires, 'hit6', clock.now)));
  const backupDue = $derived(data.episodes.length >= 3 && (!settings.lastBackupAt || Date.now() - new Date(settings.lastBackupAt).getTime() > 30 * 86400000));

  function openLog(copy?: Episode) {
    copyFrom = copy;
    logOpen = true;
  }

  async function setEfficacy(e: Episode, m: MedIntake, value: string) {
    const copy: Episode = JSON.parse(JSON.stringify(e));
    const med = copy.meds.find((x) => x.id === m.id);
    if (med) med.efficacy = value as MedIntake['efficacy'];
    await saveEpisode(copy);
    haptic();
    toast('Grazie, annotato', { label: 'Annulla', run: () => saveEpisode(e) });
  }

  async function markFree() {
    await saveDay({ ...(getDay(today) ?? { date: today }), headacheFree: true });
    haptic();
    toast('Giornata segnata senza mal di testa', { label: 'Annulla', run: () => saveDay({ ...getDay(today)!, headacheFree: false }) });
  }

  // Piano di oggi: previsione + trigger personali + fattori presenti oggi (tutto sul dispositivo)
  const actx = $derived<AdvisorContext>({
    episodes: data.episodes,
    days: data.days,
    questionnaires: data.questionnaires,
    prophylaxis: data.prophylaxis,
    medications: data.medications,
    now: clock.now,
    weather: settings.weatherEnabled ? loadCachedWeather() : undefined
  });
  const plan = $derived(active ? null : dailyPlan(actx, forecast(actx), personalTriggers(actx), riskFactorsToday(actx)));
  const duringAttack = $derived(active ? attackPlan(actx) : []);
  const LEVEL_TXT = { basso: 'Rischio basso', medio: 'Rischio medio', alto: 'Rischio alto' };

  const avg = $derived(stats.avgIntensity == null ? '–' : stats.avgIntensity.toFixed(1));
</script>

<div class="page fade">
  <h1>Oggi</h1>

  {#if active}
    <section class="card status">
      <div class="row">
        <span class="badge i{intensityLevel(active.intensity)}">{LEVEL_LABEL[intensityLevel(active.intensity)]}</span>
        <span class="muted">In corso da <strong class="num">{formatDuration(durationMin(active, clock.now))}</strong></span>
      </div>
      {#if stuck}
        <p class="small" style="margin-top:12px">È ancora in corso? Se è finito da tempo, imposta l'ora corretta nei dettagli.</p>
      {/if}
      <div class="stack" style="margin-top:16px">
        <button class="btn primary big block" onclick={() => { const a = active; endEpisode(a, () => go('/episode?id=' + a.id)); }}>È finito</button>
        <div class="row">
          <button class="btn grow" onclick={() => (medOpen = true)}>Ho preso un farmaco</button>
          <a class="btn grow" href={'#/episode?id=' + active.id}>Dettagli</a>
        </div>
      </div>
    </section>
  {:else}
    <p class="muted lead">
      {#if since === null}Nessun episodio registrato.{:else if since === 0}Ultimo mal di testa: oggi.{:else}Nessun mal di testa da <strong class="num">{since}</strong> {since === 1 ? 'giorno' : 'giorni'}.{/if}
    </p>
    <div class="cta">
      <button class="btn primary big block huge" onclick={() => openLog()}>Ho mal di testa</button>
      <div class="row">
        {#if last}<button class="btn link grow" onclick={() => openLog(last)}>Come l'ultima volta</button>{/if}
        <button class="btn link grow" onclick={() => (medOpen = true)}>Ho preso un farmaco</button>
      </div>
    </div>
  {/if}

  {#if drive.enabled && drive.needsReauth}
    <button class="card nav sync" onclick={() => reauth().then((ok) => ok && toast('Backup salvato su Google Drive'), () => toast('Collegamento a Google non completato'))}>
      <span class="grow">Backup in sospeso · <strong>tocca per sincronizzare</strong></span><span aria-hidden="true">›</span>
    </button>
  {/if}

  {#if active && duringAttack.length}
    <details class="card plan" open>
      <summary><h2 class="t">Cosa fare adesso</h2></summary>
      <ul>
        {#each duringAttack as a (a.id)}<li>{a.text}</li>{/each}
      </ul>
    </details>
  {/if}

  {#if plan}
    <section class="card plan">
      <div class="row between">
        <h2 class="t">Il piano di oggi</h2>
        <span class="lvl l-{plan.level}">{LEVEL_TXT[plan.level]}</span>
      </div>
      <p class="small" style="margin:8px 0 4px">{plan.headline}</p>
      <ul>
        {#each plan.actions as a (a.id)}
          <li><span>{a.text}</span><span class="small muted why">{a.why}</span></li>
        {/each}
      </ul>
    </section>
    <CheckIn />
  {/if}

  {#each pending as p (p.med.id)}
    <section class="card">
      <p><strong>Com'è andata con {p.med.name}?</strong></p>
      <p class="small muted">Preso alle {new Date(p.med.time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
      <div class="seg">
        {#each EFFICACY as o (o.id)}
          <button class="chip" onclick={() => setEfficacy(p.episode, p.med, o.id)}>{o.label}</button>
        {/each}
      </div>
    </section>
  {/each}

  {#if askToday}
    <section class="card">
      <p><strong>Oggi tutto bene?</strong></p>
      <div class="row">
        <button class="btn grow" onclick={markFree}>Nessun mal di testa</button>
        <button class="btn grow" onclick={() => openLog()}>Registra</button>
      </div>
    </section>
  {/if}

  {#each alerts as a (a.id)}
    <details class="alert" class:danger={a.level === 'danger'}>
      <summary><strong>{a.title}</strong><span class="small more">Leggi</span></summary>
      <p class="small" style="margin:8px 0 0">{a.text}</p>
    </details>
  {/each}

  <section class="card">
    <div class="row between">
      <h2 style="margin:0">Ultimi 30 giorni</h2>
      <a class="small" href="#/stats">Dettagli</a>
    </div>
    <div class="kpis">
      <div><span class="kpi num">{stats.headacheDays}</span><span class="small muted">giorni con mal di testa</span></div>
      <div><span class="kpi num">{stats.medDays}</span><span class="small muted">giorni con farmaci</span></div>
      <div><span class="kpi num">{avg}</span><span class="small muted">intensità media /10</span></div>
    </div>
    <div class="strip" aria-label="Intensità degli ultimi 30 giorni">
      {#each strip as d (d.k)}
        <span class="cell" class:i1={d.level === 1} class:i2={d.level === 2} class:i3={d.level === 3} title={d.k}></span>
      {/each}
    </div>
  </section>

  {#if dueQ}
    <a class="card nav" href="#/questionnaires"><span class="grow">È il momento di compilare MIDAS / HIT-6</span><span aria-hidden="true">›</span></a>
  {/if}
  {#if backupDue}
    <a class="card nav" href="#/backup"><span class="grow">Fai un backup dei tuoi dati</span><span aria-hidden="true">›</span></a>
  {/if}


  <a class="btn link block" href="#/redflags">Segnali d'allarme: quando chiamare il medico</a>
</div>

<LogSheet bind:open={logOpen} {copyFrom} />

<Sheet bind:open={medOpen} title="Cosa hai preso?">
  <MedPicker
    onpick={(m, t) => {
      takeMed(m, undefined, t);
      medOpen = false;
    }}
    limit={6}
  />
</Sheet>

<style>
  .lead { font-size: 1.1rem; margin-bottom: 16px; }
  .badge { padding: 4px 12px; border-radius: 999px; font-weight: 700; }
  .between { justify-content: space-between; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0; }
  .kpis div { display: flex; flex-direction: column; }
  .kpi { font-size: 2rem; font-weight: 700; line-height: 1.1; }
  .strip { display: grid; grid-template-columns: repeat(30, 1fr); gap: 3px; }
  .cell { aspect-ratio: 1; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border); }
  .cell.i1 { background: var(--i1); border-color: var(--i1); }
  .cell.i2 { background: var(--i2); border-color: var(--i2); }
  .cell.i3 { background: var(--i3); border-color: var(--i3); }
  details summary { list-style: none; display: flex; align-items: center; gap: 8px; cursor: pointer; min-height: 32px; }
  details summary::-webkit-details-marker { display: none; }
  details summary strong { margin: 0; flex: 1; }
  .more { color: var(--accent); }
  details[open] .more { display: none; }
  .t { margin: 0; }
  .plan summary { list-style: none; cursor: pointer; }
  .plan summary::-webkit-details-marker { display: none; }
  .plan ul { margin: 10px 0 0; padding-left: 20px; }
  .plan li { margin-bottom: 10px; }
  .why { display: block; margin-top: 2px; }
  .lvl { font-size: 0.8rem; padding: 3px 12px; border-radius: 999px; font-weight: 700; white-space: nowrap; }
  .l-basso { background: var(--i1); color: var(--on-i); }
  .l-medio { background: var(--i2); color: var(--on-i); }
  .l-alto { background: var(--i3); color: var(--on-i); }
  .sync { width: 100%; text-align: left; font: inherit; color: var(--text); cursor: pointer; }
  .cta { margin: 0 0 24px; }
  .huge { min-height: 88px; font-size: 1.35rem; }
  .nav { display: flex; align-items: center; text-decoration: none; color: var(--text); min-height: 56px; }
</style>
