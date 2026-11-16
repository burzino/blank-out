<script lang="ts">
  import { MIN_PASSWORD } from '../lib/crypto';
  import { data } from '../lib/db.svelte';
  import {
    applyRestore,
    backupNow,
    connectGoogle,
    disconnect,
    drive,
    enableAutoBackup,
    listBackups,
    passwordProblem,
    prepareGoogle,
    reauth,
    restore,
    type DriveBackupInfo
  } from '../lib/drive.svelte';
  import type { BackupFile } from '../lib/types';
  import { haptic, toast } from '../lib/ui.svelte';

  // Card "Backup su Google Drive" per la pagina Backup.
  const active = $derived(drive.enabled && drive.hasKey);

  // GIS precaricato: così il popup di Google parte subito dentro il tocco (Safari blocca i popup "in ritardo")
  $effect(() => {
    if (drive.configured) prepareGoogle().catch(() => {});
  });

  const pad = (n: number) => String(n).padStart(2, '0');
  function when(iso: string) {
    const d = new Date(iso);
    const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const diff = (start.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000;
    if (diff === 0) return `oggi alle ${t}`;
    if (diff === 1) return `ieri alle ${t}`;
    const sameYear = d.getFullYear() === start.getFullYear();
    return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })} alle ${t}`;
  }

  const errText = (e: unknown) => (e instanceof Error ? e.message : 'Qualcosa non ha funzionato. Riprova.');

  // ---- Attivazione ----
  let setupOpen = $state(false);
  let pw = $state('');
  let pw2 = $state('');
  let show = $state(false);
  let busy = $state(false);
  let setupError = $state('');

  async function activate() {
    const problem = passwordProblem(pw, pw2);
    if (problem) {
      setupError = problem;
      return;
    }
    setupError = '';
    busy = true;
    try {
      const ok = await enableAutoBackup(pw); // il popup Google parte subito, dentro il tocco
      pw = pw2 = '';
      setupOpen = false;
      haptic(20);
      toast(ok ? 'Backup automatico attivo' : 'Backup attivo: il primo invio verrà ritentato');
    } catch (e) {
      setupError = drive.connected ? errText(e) : 'Collegamento a Google non completato. Riprova quando vuoi.';
    } finally {
      busy = false;
    }
  }

  async function runNow() {
    haptic();
    const ok = await backupNow();
    if (ok) toast('Backup salvato su Google Drive');
  }

  async function relink() {
    try {
      const ok = await reauth();
      if (ok) toast('Google ricollegato');
    } catch {
      toast('Collegamento a Google non completato');
    }
  }

  async function turnOff() {
    busy = true;
    await disconnect();
    busy = false;
    haptic();
    toast('Backup su Google Drive disattivato. I file già salvati restano sul tuo Drive.');
  }

  // ---- Ripristino ----
  type Step = 'closed' | 'list' | 'password' | 'confirm';
  let step = $state<Step>('closed');
  let files = $state<DriveBackupInfo[]>([]);
  let chosen = $state<DriveBackupInfo | null>(null);
  let rpw = $state('');
  let pending = $state<BackupFile | null>(null);
  let restoreError = $state('');
  let loading = $state(false);

  function resetRestore() {
    step = 'closed';
    files = [];
    chosen = null;
    rpw = '';
    pending = null;
    restoreError = '';
  }

  async function openRestore() {
    restoreError = '';
    loading = true;
    try {
      await connectGoogle(); // primo await: il popup nasce dal tocco
      files = await listBackups();
      step = 'list';
    } catch (e) {
      restoreError = drive.connected ? errText(e) : 'Collegamento a Google non completato. Riprova quando vuoi.';
    } finally {
      loading = false;
    }
  }

  function choose(f: DriveBackupInfo) {
    chosen = f;
    rpw = '';
    restoreError = '';
    step = 'password';
  }

  async function unlock() {
    if (!chosen || !rpw) return;
    restoreError = '';
    loading = true;
    try {
      pending = await restore(chosen.id, rpw);
      step = 'confirm';
    } catch (e) {
      restoreError = errText(e);
    } finally {
      loading = false;
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    loading = true;
    try {
      await applyRestore(pending);
      haptic(20);
      toast('Dati ripristinati. Backup automatico attivo.');
      resetRestore();
    } catch (e) {
      restoreError = errText(e);
    } finally {
      loading = false;
    }
  }
</script>

{#if !drive.configured}
  <section class="card">
    <p class="small muted" style="margin:0">Backup su Google Drive non ancora configurato.</p>
  </section>
{:else}
  <section class="card">
    <h3 style="margin-top:0">Backup automatico su Google Drive</h3>

    {#if active}
      <p class="small muted">Cifrato con la tua password, in una cartella nascosta del tuo Drive.</p>
      <p class="status" aria-live="polite">
        {#if drive.syncing}
          In corso…
        {:else if drive.lastSyncAt}
          Ultimo backup: {when(drive.lastSyncAt)}
        {:else}
          Nessun backup ancora inviato.
        {/if}
      </p>
      {#if drive.lastError && !drive.syncing}
        <p class="alert small" style="margin:0 0 12px">{drive.lastError}</p>
      {/if}
      <div class="stack">
        {#if drive.needsReauth}
          <button class="btn primary block" onclick={relink}>Ricollega Google</button>
        {:else}
          <button class="btn block" onclick={runNow} disabled={drive.syncing}>Esegui ora</button>
        {/if}
        <button class="btn ghost block" onclick={turnOff} disabled={busy}>Disattiva</button>
      </div>
    {:else if !setupOpen}
      <p class="small muted">Salvato cifrato in una cartella nascosta del tuo Drive. Solo tu puoi leggerlo, con la tua password.</p>
      {#if drive.enabled && !drive.hasKey}
        <p class="alert small" style="margin:0 0 12px">Su questo dispositivo manca la password del backup: inseriscila di nuovo per riprendere.</p>
      {/if}
      <button class="btn primary block" onclick={() => (setupOpen = true)}>Attiva il backup automatico</button>
    {:else}
      <p class="small muted">Salvato cifrato in una cartella nascosta del tuo Drive. Solo tu puoi leggerlo, con la tua password.</p>
      <form class="fade" onsubmit={(e) => { e.preventDefault(); activate(); }}>
        <div class="field">
          <label for="ds-pw">Password del backup (almeno {MIN_PASSWORD} caratteri)</label>
          <input id="ds-pw" type={show ? 'text' : 'password'} bind:value={pw} autocomplete="new-password" minlength={MIN_PASSWORD} />
        </div>
        <div class="field">
          <label for="ds-pw2">Ripeti la password</label>
          <input id="ds-pw2" type={show ? 'text' : 'password'} bind:value={pw2} autocomplete="new-password" />
        </div>
        <button type="button" class="btn link" onclick={() => (show = !show)} aria-pressed={show}>
          {show ? 'Nascondi password' : 'Mostra password'}
        </button>
        <div class="alert">
          <strong>Conservala bene</strong>
          <span class="small">Se dimentichi questa password il backup non è recuperabile.</span>
        </div>
        {#if setupError}<p class="alert danger small" style="margin:0 0 12px">{setupError}</p>{/if}
        <div class="stack">
          <button type="submit" class="btn primary block" disabled={busy}>{busy ? 'Attivazione…' : 'Collega Google e attiva'}</button>
          <button type="button" class="btn ghost block" onclick={() => { setupOpen = false; pw = pw2 = ''; setupError = ''; }}>Annulla</button>
        </div>
      </form>
    {/if}
  </section>

  <section class="card">
    <h3 style="margin-top:0">Ripristina da Google Drive</h3>
    {#if step === 'closed'}
      <p class="small muted">Utile su un telefono nuovo: recupera il diario dal tuo backup cifrato.</p>
      <button class="btn block" onclick={openRestore} disabled={loading}>{loading ? 'Collegamento…' : 'Ripristina da Google Drive'}</button>
    {:else if step === 'list'}
      {#if files.length}
        <p class="small muted">Scegli il backup da recuperare.</p>
        <div class="files">
          {#each files as f (f.id)}
            <button class="list-item file" onclick={() => choose(f)}>
              <span class="grow">{when(f.modifiedTime)}</span>
              <span class="small muted">{f.daily ? 'copia del giorno' : 'più recente'}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="small muted">Nessun backup trovato su questo account Google.</p>
      {/if}
      <button class="btn ghost block" onclick={resetRestore}>Chiudi</button>
    {:else if step === 'password' && chosen}
      <form class="fade" onsubmit={(e) => { e.preventDefault(); unlock(); }}>
        <p class="small muted">Backup del {when(chosen.modifiedTime)}.</p>
        <div class="field">
          <label for="ds-rpw">Password del backup</label>
          <input id="ds-rpw" type="password" bind:value={rpw} autocomplete="current-password" />
        </div>
        <div class="stack">
          <button type="submit" class="btn primary block" disabled={!rpw || loading}>{loading ? 'Apertura…' : 'Apri il backup'}</button>
          <button type="button" class="btn ghost block" onclick={() => { step = 'list'; restoreError = ''; }}>Indietro</button>
        </div>
      </form>
    {:else if step === 'confirm' && pending}
      <div class="alert danger fade" style="margin:0">
        <strong>Sostituire i dati di questo dispositivo?</strong>
        <p class="small">
          Il backup del {when(pending.exportedAt)} contiene {pending.episodes.length} episodi{pending.questionnaires?.length ? `, ${pending.questionnaires.length} questionari` : ''}{pending.prophylaxis?.length ? `, ${pending.prophylaxis.length} terapie` : ''}.
          I {data.episodes.length} episodi presenti ora su questo dispositivo verranno sostituiti.
        </p>
        <div class="stack">
          <button class="btn block danger-btn" onclick={confirmRestore} disabled={loading}>Sostituisci i dati di questo dispositivo</button>
          <button class="btn block" onclick={resetRestore}>Lascia stare</button>
        </div>
      </div>
    {/if}
    {#if restoreError}<p class="alert danger small" style="margin:12px 0 0">{restoreError}</p>{/if}
  </section>
{/if}

<style>
  .status { margin: 0 0 12px; font-weight: 600; }
  input[type='password'] {
    min-height: 48px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    width: 100%;
  }
  .alert span { display: block; }
  .files { margin-bottom: 8px; }
  .file { width: 100%; background: none; border-left: none; border-right: none; border-top: none; text-align: left; cursor: pointer; font: inherit; }
  .danger-btn { background: var(--i3); color: var(--on-i); border-color: var(--i3); }
</style>
