<script lang="ts">
  import { DISCLAIMER, type Opt } from '../lib/catalog';
  import { data, saveProfile } from '../lib/db.svelte';
  import { notificationsSupported, requestNotifications } from '../lib/reminders';
  import { saveSettings, settings } from '../lib/settings.svelte';
  import { FAMILY_OPTS, HORMONAL_OPTS, SEX_OPTS, SMOKING_OPTS, parseOnset } from '../lib/profile';
  import type { Profile } from '../lib/types';
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
  const onsetValue = $derived(data.profile.onsetYear ?? data.profile.onsetAge ?? '');
  function setOnset(v: string) {
    const o = parseOnset(v, thisYear);
    data.profile.onsetYear = o.onsetYear;
    data.profile.onsetAge = o.onsetAge;
    profileChanged();
  }
  const showHormonal = $derived(data.profile.sex !== 'maschio' || !!data.profile.hormonal);
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
  </section>

  <section class="card">
    <h3 style="margin-top:0">Promemoria</h3>
    <Toggle bind:checked={settings.morningReminderEnabled} label="Check-in del mattino" hint="Ti ricorda di segnare come hai dormito" onchange={onReminder} />
    {#if settings.morningReminderEnabled}
      <div class="field fade" style="margin-top:12px">
        <label for="mt">Ora del promemoria del mattino</label>
        <input id="mt" type="time" value={settings.morningReminderTime} onchange={(e) => { if (e.currentTarget.value) { settings.morningReminderTime = e.currentTarget.value; settings.lastMorningReminderDate = null; saveSettings(); } }} />
      </div>
    {/if}
    <Toggle bind:checked={settings.reminderEnabled} label="Promemoria serale" hint="Ti ricorda il check-in della sera e di segnare com'è andata la giornata" onchange={onReminder} />
    {#if settings.reminderEnabled}
      <div class="field fade" style="margin-top:12px">
        <label for="rt">Ora del promemoria serale</label>
        <input id="rt" type="time" value={settings.reminderTime} onchange={(e) => { if (e.currentTarget.value) { settings.reminderTime = e.currentTarget.value; settings.lastReminderDate = null; saveSettings(); } }} />
      </div>
    {/if}
    {#if settings.reminderEnabled || settings.morningReminderEnabled}
      {#if permission === 'granted'}
        <p class="small muted">Riceverai una notifica se l'app è aperta o usata di recente. In ogni caso il check-in lo trovi nella schermata Oggi.</p>
      {:else}
        <p class="small muted">Le notifiche non sono attive: il check-in e la domanda "Oggi tutto bene?" li trovi comunque nella schermata Oggi.</p>
      {/if}
    {/if}
  </section>

  <section class="card">
    <h3 style="margin-top:0">Profilo</h3>
    <p class="small muted">Tutto facoltativo. Questi dati compaiono solo nel report per il medico e restano sul tuo dispositivo.</p>
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
    <div class="field" role="group" aria-labelledby="psex">
      <span class="label" id="psex">Sesso</span>
      <Chips options={SEX_OPTS} bind:value={() => data.profile.sex, (v) => (data.profile.sex = v as Profile['sex'])} multi={false} onchange={profileChanged} />
    </div>
    {#if showHormonal}
      <div class="field" role="group" aria-labelledby="phorm">
        <span class="label" id="phorm">Terapia ormonale (pillola, ecc.)</span>
        <Chips options={HORMONAL_OPTS} bind:value={() => data.profile.hormonal, (v) => (data.profile.hormonal = v as Profile['hormonal'])} multi={false} onchange={profileChanged} />
      </div>
      {#if data.profile.hormonal && data.profile.hormonal !== 'nessuna'}
        <div class="field fade">
          <label for="phnote">Quale (facoltativo)</label>
          <input id="phnote" type="text" maxlength="200" value={data.profile.hormonalNote ?? ''} oninput={(e) => { data.profile.hormonalNote = e.currentTarget.value || undefined; profileChanged(); }} />
        </div>
      {/if}
    {/if}
    <div class="field">
      <label for="ponset">Da quando hai mal di testa? (età o anno)</label>
      <input id="ponset" type="number" inputmode="numeric" min="0" max={thisYear} placeholder="es. 14 oppure 2005" value={onsetValue} oninput={(e) => setOnset(e.currentTarget.value)} />
    </div>
    <div class="field" role="group" aria-labelledby="pfam">
      <span class="label" id="pfam">Emicrania in famiglia (genitori, fratelli)?</span>
      <Chips options={FAMILY_OPTS} bind:value={() => data.profile.familyHistory, (v) => (data.profile.familyHistory = v as Profile['familyHistory'])} multi={false} seg onchange={profileChanged} />
    </div>
    <div class="field" role="group" aria-labelledby="psmoke">
      <span class="label" id="psmoke">Fumi?</span>
      <Chips options={SMOKING_OPTS} bind:value={() => data.profile.smoking, (v) => (data.profile.smoking = v as Profile['smoking'])} multi={false} seg onchange={profileChanged} />
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
