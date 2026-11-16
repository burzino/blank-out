<script lang="ts">
  import { untrack } from 'svelte';
  import { overallDiagnosis } from '../lib/advisor/diagnosis';
  import { ADVISOR_DISCLAIMER, recommendations } from '../lib/advisor/recommendations';
  import { findPatterns } from '../lib/advisor/patterns';
  import { forecast } from '../lib/advisor/forecast';
  import { fetchWeather, getLocation, loadCachedWeather } from '../lib/advisor/weather';
  import type { AdviceCategory, AdvisorContext, WeatherDay } from '../lib/advisor/types';
  import { addDays, dayKey } from '../lib/clinic';
  import { data } from '../lib/db.svelte';
  import { clock } from '../lib/episodes.svelte';
  import { saveSettings, settings } from '../lib/settings.svelte';
  import { toast } from '../lib/ui.svelte';

  let weather = $state<WeatherDay[] | undefined>(settings.weatherEnabled ? loadCachedWeather() : undefined);
  let loadingWeather = $state(false);

  const ctx = $derived<AdvisorContext>({
    episodes: data.episodes,
    days: data.days,
    questionnaires: data.questionnaires,
    prophylaxis: data.prophylaxis,
    medications: data.medications,
    now: clock.now,
    weather
  });
  const dx = $derived(overallDiagnosis(ctx));
  const advice = $derived(recommendations(ctx, dx));
  const patterns = $derived(findPatterns(ctx));
  const fc = $derived(forecast(ctx));

  const CAT: Record<AdviceCategory, string> = {
    urgente: 'Importante',
    visita: 'Dal medico',
    terapia_acuta: "Farmaci per l'attacco",
    prevenzione: 'Prevenzione',
    stile_di_vita: 'Abitudini',
    diario: 'Diario'
  };
  const pct = (p?: number) => (p == null ? '–' : `${Math.round(p * 100)}%`);

  async function refreshWeather() {
    if (settings.weatherLat == null || settings.weatherLon == null) return;
    const first = data.episodes.length ? dayKey(data.episodes[data.episodes.length - 1].start) : dayKey(new Date());
    const from = first < addDays(dayKey(new Date()), -365) ? addDays(dayKey(new Date()), -365) : first;
    weather = await fetchWeather(settings.weatherLat, settings.weatherLon, from, addDays(dayKey(new Date()), 2));
  }

  async function enableWeather() {
    loadingWeather = true;
    try {
      const pos = await getLocation();
      settings.weatherEnabled = true;
      settings.weatherLat = pos.lat;
      settings.weatherLon = pos.lon;
      saveSettings();
      await refreshWeather();
      toast('Meteo collegato');
    } catch {
      toast('Non riesco a ottenere la posizione o il meteo. Riprova più tardi.');
    } finally {
      loadingWeather = false;
    }
  }

  function disableWeather() {
    settings.weatherEnabled = false;
    saveSettings();
    weather = undefined;
  }

  // Aggiorna il meteo una volta all'apertura (untrack: non rieseguire a ogni modifica del diario)
  $effect(() => {
    if (settings.weatherEnabled) untrack(() => refreshWeather().catch(() => {}));
  });
</script>

<div class="page fade">
  <h1>Assistente</h1>
  <p class="small muted">Analisi fatte sul tuo telefono: i dati non escono dal dispositivo.</p>

  {#each advice.filter((a) => a.category === 'urgente') as a (a.id)}
    <section class="alert danger">
      <strong>{a.title}</strong>
      <span class="small">{a.text}</span>
    </section>
  {/each}

  <section class="card">
    <div class="row between">
      <h2 class="t">Il tuo quadro</h2>
      <span class="conf c-{dx.confidence}">affidabilità {dx.confidence}</span>
    </div>
    <p class="dx">{dx.label}</p>
    {#if dx.reasons.length}
      <ul class="small">
        {#each dx.reasons as r (r)}<li>{r}</li>{/each}
      </ul>
    {/if}
    {#each dx.secondary as s (s.label)}
      <p class="small"><strong>{s.label}</strong> · <span class="muted">{s.reason}</span></p>
    {/each}
    {#if dx.missing.length}
      <details>
        <summary class="small link">Come renderlo più preciso</summary>
        <ul class="small muted">
          {#each dx.missing as m (m)}<li>{m}</li>{/each}
        </ul>
      </details>
    {/if}
  </section>

  <section class="card">
    <h2 class="t">Rischio di attacco</h2>
    {#if fc.available}
      <div class="risk">
        <div><span class="kpi num">{pct(fc.today)}</span><span class="small muted">oggi</span></div>
        <div><span class="kpi num">{pct(fc.tomorrow)}</span><span class="small muted">domani</span></div>
        {#if fc.level}<span class="lvl l-{fc.level}">{fc.level}</span>{/if}
      </div>
      {#if fc.drivers.length}
        <ul class="small">
          {#each fc.drivers as d (d.label)}<li>{d.label} <span class="muted">({d.effect} il rischio)</span></li>{/each}
        </ul>
      {/if}
      {#if fc.reason}<p class="small muted">{fc.reason}</p>{/if}
      {#if fc.quality}<p class="small muted">Modello allenato sui tuoi {fc.quality.samples} giorni · accuratezza (AUC) {fc.quality.auc.toFixed(2)}</p>{/if}
    {:else}
      <p class="small muted">{fc.reason}</p>
    {/if}
    <div class="weather">
      {#if settings.weatherEnabled}
        <span class="small muted grow">Meteo della tua zona incluso nell'analisi{weather ? '' : ' (in caricamento…)'}</span>
        <button class="btn ghost small" onclick={disableWeather}>Disattiva</button>
      {:else}
        <span class="small muted grow">Aggiungi il meteo (pressione, temperatura) per analisi più precise. Viene inviata solo la posizione approssimativa a Open-Meteo, nessun dato sanitario.</span>
        <button class="btn small" onclick={enableWeather} disabled={loadingWeather}>{loadingWeather ? '…' : 'Attiva'}</button>
      {/if}
    </div>
  </section>

  {#if advice.some((a) => a.category !== 'urgente')}
    <h2>Consigli per te</h2>
    {#each advice.filter((a) => a.category !== 'urgente') as a (a.id)}
      <details class="card advice" open={a.priority === 1}>
        <summary>
          <span class="cat">{CAT[a.category]}</span>
          <strong>{a.title}</strong>
        </summary>
        <p class="small">{a.text}</p>
        <p class="small muted"><strong>Perché:</strong> {a.why}{a.source ? ` · Fonte: ${a.source}` : ''}</p>
      </details>
    {/each}
  {/if}

  {#if patterns.length}
    <h2>Cosa emerge dai tuoi dati</h2>
    {#each patterns as p (p.id)}
      <section class="card">
        <div class="row between">
          <strong>{p.title}</strong>
          <span class="conf c-{p.strength}">{p.strength}</span>
        </div>
        <p class="small muted" style="margin-top:6px">{p.detail}</p>
        {#if p.chart?.length}
          {@const max = Math.max(...p.chart.map((c) => c.value), 1)}
          <div class="bars">
            {#each p.chart as c (c.label)}
              <div class="bar-row">
                <span class="small bl">{c.label}</span>
                <span class="bar"><span style="width:{(c.value / max) * 100}%"></span></span>
                <span class="small num bv">{Number.isInteger(c.value) ? c.value : c.value.toFixed(1)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  {:else}
    <p class="small muted">I pattern compaiono quando ci sono abbastanza episodi registrati (almeno 8).</p>
  {/if}

  <p class="small muted disclaimer">{ADVISOR_DISCLAIMER}</p>
  <a class="btn primary block" href="#/report">Prepara il report per il neurologo</a>
</div>

<style>
  .t { margin: 0; }
  .between { justify-content: space-between; }
  .dx { font-size: 1.15rem; font-weight: 700; margin: 12px 0 8px; }
  ul { margin: 0 0 8px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .conf { font-size: 0.75rem; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); white-space: nowrap; }
  .c-alta { background: var(--i1); color: var(--on-i); border-color: var(--i1); }
  .c-media { background: var(--i2); color: var(--on-i); border-color: var(--i2); }
  .link { color: var(--accent); cursor: pointer; min-height: 40px; display: flex; align-items: center; }
  .risk { display: flex; align-items: center; gap: 24px; margin: 12px 0; }
  .risk div { display: flex; flex-direction: column; }
  .kpi { font-size: 2rem; font-weight: 700; line-height: 1.1; }
  .lvl { margin-left: auto; padding: 6px 14px; border-radius: 999px; font-weight: 700; text-transform: capitalize; }
  .l-basso { background: var(--i1); color: var(--on-i); }
  .l-medio { background: var(--i2); color: var(--on-i); }
  .l-alto { background: var(--i3); color: var(--on-i); }
  .weather { display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 8px; }
  .advice summary { list-style: none; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
  .advice summary::-webkit-details-marker { display: none; }
  .advice p { margin: 10px 0 0; }
  .cat { font-size: 0.75rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; }
  .bars { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
  .bar-row { display: grid; grid-template-columns: 96px 1fr 40px; gap: 8px; align-items: center; }
  .bl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 10px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
  .bv { text-align: right; }
  .disclaimer { margin: 24px 0 12px; }
</style>
