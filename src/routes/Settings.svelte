<script lang="ts">
  import { DISCLAIMER, type Opt } from '../lib/catalog';
  import { data, saveProfile } from '../lib/db.svelte';
  import { notificationsSupported, requestNotifications } from '../lib/reminders';
  import { saveSettings, settings } from '../lib/settings.svelte';
  import Chips from '../components/Chips.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import Toggle from '../components/Toggle.svelte';

  const THEMES: Opt[] = [
    { id: 'dark', label: 'Scuro' },
    { id: 'light', label: 'Chiaro' }
  ];

  let permission = $state(notificationsSupported() ? Notification.permission : 'unsupported');

  async function onReminder(on: boolean) {
    saveSettings();
    if (on && permission === 'default') {
      await requestNotifications();
      permission = Notification.permission;
    }
  }

  // Profilo: salvataggio con un piccolo ritardo mentre si scrive
  let timer: ReturnType<typeof setTimeout>;
  function profileChanged() {
    clearTimeout(timer);
    timer = setTimeout(saveProfile, 400);
  }
  const thisYear = new Date().getFullYear();
</script>

<div class="page fade">
  <PageHeader title="Impostazioni" />

  <section class="card">
    <h3 style="margin-top:0">Aspetto</h3>
    <div class="field">
      <span class="label">Tema</span>
      <Chips options={THEMES} bind:value={() => settings.theme, (v) => v && (settings.theme = v as 'dark' | 'light')} multi={false} seg onchange={saveSettings} />
    </div>
    <Toggle bind:checked={settings.largeText} label="Testo grande" onchange={saveSettings} />
    <Toggle bind:checked={settings.haptics} label="Vibrazione al tocco" onchange={saveSettings} />
  </section>

  <section class="card">
    <h3 style="margin-top:0">Diario</h3>
    <Toggle bind:checked={settings.trackCycle} label="Traccia il ciclo mestruale" hint="Per vedere se gli attacchi sono legati al ciclo" onchange={saveSettings} />
    <Toggle bind:checked={settings.reminderEnabled} label="Promemoria serale" hint="Ti chiede com'è andata la giornata" onchange={onReminder} />
    {#if settings.reminderEnabled}
      <div class="field fade" style="margin-top:12px">
        <label for="rt">Ora del promemoria</label>
        <input id="rt" type="time" value={settings.reminderTime} onchange={(e) => { if (e.currentTarget.value) { settings.reminderTime = e.currentTarget.value; settings.lastReminderDate = null; saveSettings(); } }} />
      </div>
      {#if permission === 'granted'}
        <p class="small muted">Riceverai una notifica se l'app è aperta o usata di recente. In ogni caso lo trovi nella schermata Oggi.</p>
      {:else}
        <p class="small muted">Le notifiche non sono attive: troverai la domanda "Oggi tutto bene?" nella schermata Oggi.</p>
      {/if}
    {/if}
  </section>

  <section class="card">
    <h3 style="margin-top:0">Profilo</h3>
    <p class="small muted">Facoltativo, compare solo nel report per il medico.</p>
    <div class="field">
      <label for="pname">Nome e cognome</label>
      <input id="pname" type="text" autocomplete="name" value={data.profile.name ?? ''} oninput={(e) => { data.profile.name = e.currentTarget.value || undefined; profileChanged(); }} />
    </div>
    <div class="field">
      <label for="pyear">Anno di nascita</label>
      <input
        id="pyear"
        type="number"
        inputmode="numeric"
        min="1900"
        max={thisYear}
        value={data.profile.birthYear ?? ''}
        oninput={(e) => {
          const v = Number(e.currentTarget.value);
          data.profile.birthYear = e.currentTarget.value && v >= 1900 && v <= thisYear ? v : undefined;
          profileChanged();
        }}
      />
    </div>
  </section>

  <section class="card list">
    <a class="list-item" href="#/backup"><span class="grow">Backup ed esportazione</span><span class="muted" aria-hidden="true">›</span></a>
    <a class="list-item" href="#/info"><span class="grow">Info e privacy</span><span class="muted" aria-hidden="true">›</span></a>
  </section>

  <p class="small muted">Le modifiche si salvano da sole.</p>
  <p class="small muted disclaimer">{DISCLAIMER}</p>
</div>

<style>
  .list { padding-top: 4px; padding-bottom: 4px; }
  .disclaimer { margin-top: 16px; }
</style>
