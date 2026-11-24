<script lang="ts">
  import { DISCLAIMER } from '../lib/catalog';
  import { data, deleteMedication } from '../lib/db.svelte';
  import { rememberMed } from '../lib/episodes.svelte';
  import { COMMON_ACUTE } from '../lib/meds';
  import { requestNotifications } from '../lib/reminders';
  import { go } from '../lib/router.svelte';
  import { saveSettings, settings } from '../lib/settings.svelte';
  import { haptic } from '../lib/ui.svelte';

  const LAST = 3;
  let step = $state(0);

  const mine = (name: string) => data.medications.find((m) => m.name.toLowerCase() === name.toLowerCase());

  async function toggleMed(k: (typeof COMMON_ACUTE)[number]) {
    haptic();
    const m = mine(k.name);
    if (m) await deleteMedication(m.id);
    else await rememberMed(k);
  }

  async function setReminder(on: boolean) {
    haptic();
    settings.reminderEnabled = on;
    settings.morningReminderEnabled = on;
    saveSettings();
    if (on) await requestNotifications();
  }
  function setCycle(on: boolean) {
    haptic();
    settings.trackCycle = on;
    saveSettings();
  }

  function next() {
    haptic();
    step = Math.min(LAST, step + 1);
    window.scrollTo(0, 0);
  }
  function finish() {
    haptic(20);
    settings.onboarded = true;
    saveSettings();
    go('/');
  }
</script>

<div class="page onb">
  <div class="row top">
    <div class="dots grow" aria-label="Passo {step + 1} di {LAST + 1}">
      {#each Array(LAST + 1) as _, i (i)}
        <span class="dot" class:on={i === step}></span>
      {/each}
    </div>
    {#if step < LAST}
      <button class="btn ghost" onclick={() => (step = LAST)}>Salta</button>
    {/if}
  </div>

  {#key step}
    <div class="fade content">
      {#if step === 0}
        <h1>Registra un attacco in 2 tocchi</h1>
        <p>Tocca <strong>"Ho mal di testa"</strong>, poi scegli quanto è forte. È già salvato.</p>
        <p class="muted">Tutto il resto (farmaci, sintomi, cause) è facoltativo e puoi aggiungerlo dopo, quando stai meglio. Colori tenui e testi grandi ti aiutano anche con la luce che dà fastidio.</p>
      {:else if step === 1}
        <h1>Aggiungi i tuoi farmaci</h1>
        <p class="muted">Facoltativo. Tocca quelli che usi: li troverai pronti quando servono. Puoi cambiarli quando vuoi.</p>
        <div class="chips">
          {#each COMMON_ACUTE as k (k.name)}
            <button class="chip" aria-pressed={!!mine(k.name)} onclick={() => toggleMed(k)}>{k.name} <span class="small">{k.dose}</span></button>
          {/each}
        </div>
      {:else if step === 2}
        <h1>Vuoi dei promemoria?</h1>
        <p class="muted">Al mattino per segnare come hai dormito, la sera per il check-in e "Oggi tutto bene?". Aiutano a non dimenticare nulla.</p>
        <div class="seg">
          <button class="chip" aria-pressed={settings.reminderEnabled} onclick={() => setReminder(true)}>Sì</button>
          <button class="chip" aria-pressed={!settings.reminderEnabled} onclick={() => setReminder(false)}>No</button>
        </div>
        {#if settings.reminderEnabled}
          <div class="field fade" style="margin-top:12px">
            <label for="ob-mtime">Mattino</label>
            <input id="ob-mtime" type="time" value={settings.morningReminderTime} onchange={(e) => { if (e.currentTarget.value) { settings.morningReminderTime = e.currentTarget.value; saveSettings(); } }} />
          </div>
          <div class="field fade" style="margin-top:12px">
            <label for="ob-time">Sera</label>
            <input id="ob-time" type="time" value={settings.reminderTime} onchange={(e) => { if (e.currentTarget.value) { settings.reminderTime = e.currentTarget.value; saveSettings(); } }} />
          </div>
        {/if}

        <h2>Tieni traccia del ciclo?</h2>
        <p class="muted">Utile per capire se il mal di testa è legato al ciclo mestruale.</p>
        <div class="seg">
          <button class="chip" aria-pressed={settings.trackCycle} onclick={() => setCycle(true)}>Sì</button>
          <button class="chip" aria-pressed={!settings.trackCycle} onclick={() => setCycle(false)}>No</button>
        </div>
      {:else}
        <h1>Prima di iniziare</h1>
        <div class="card"><p style="margin:0">{DISCLAIMER}</p></div>
      {/if}
    </div>
  {/key}

  <div class="foot">
    {#if step < LAST}
      <button class="btn primary big block" onclick={next}>Avanti</button>
    {:else}
      <button class="btn primary big block" onclick={finish}>Ho capito, iniziamo</button>
    {/if}
    {#if step > 0}
      <button class="btn link block" onclick={() => (step -= 1)}>Indietro</button>
    {/if}
  </div>
</div>

<style>
  .onb { display: flex; flex-direction: column; min-height: 100dvh; padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
  .top { min-height: 48px; margin-bottom: 16px; }
  .dots { display: flex; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); }
  .dot.on { background: var(--accent); width: 24px; border-radius: 999px; }
  .content { flex: 1; }
  .foot { margin-top: 24px; display: flex; flex-direction: column; gap: 8px; }
</style>
