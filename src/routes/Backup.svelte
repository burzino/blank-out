<script lang="ts">
  import { dayKey } from '../lib/clinic';
  import { downloadFile, episodesCsv, intakesCsv } from '../lib/csv';
  import { data, exportBackup, importBackup, isBackup, wipeAll } from '../lib/db.svelte';
  import { replaceSettings, saveSettings, settings, type Settings } from '../lib/settings.svelte';
  import type { BackupFile } from '../lib/types';
  import { haptic, toast } from '../lib/ui.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const fileName = () => `blank-out-backup-${dayKey(new Date())}.json`;
  const canShareFiles = (() => {
    try {
      return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });
    } catch {
      return false;
    }
  })();

  function backupJson() {
    return JSON.stringify(exportBackup($state.snapshot(settings) as unknown as Record<string, unknown>), null, 2);
  }
  function markBackup() {
    settings.lastBackupAt = new Date().toISOString();
    saveSettings();
  }

  function exportJson() {
    downloadFile(fileName(), backupJson(), 'application/json');
    markBackup();
    haptic();
    toast('Backup scaricato');
  }

  async function shareJson() {
    const file = new File([backupJson()], fileName(), { type: 'application/json' });
    try {
      await navigator.share({ files: [file], title: 'Backup Blank Out' });
      markBackup();
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast('Condivisione non riuscita: prova a scaricare il file');
    }
  }

  function exportCsv() {
    downloadFile(`blank-out-episodi-${dayKey(new Date())}.csv`, episodesCsv($state.snapshot(data.episodes)), 'text/csv;charset=utf-8');
    haptic();
    toast('CSV degli episodi scaricato');
  }
  function exportIntakesCsv() {
    downloadFile(`blank-out-farmaci-${dayKey(new Date())}.csv`, intakesCsv($state.snapshot(data.episodes)), 'text/csv;charset=utf-8');
    haptic();
    toast('CSV dei farmaci scaricato');
  }

  // ---- Import ----
  let pending = $state<BackupFile | null>(null);
  let importError = $state('');
  let fileInput: HTMLInputElement;

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    importError = '';
    pending = null;
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!isBackup(parsed)) throw new Error('not backup');
      pending = parsed;
    } catch {
      importError = 'Questo file non sembra un backup di Blank Out.';
    }
  }

  async function confirmImport() {
    if (!pending) return;
    const b = pending;
    await importBackup(b);
    if (b.settings) replaceSettings({ ...(b.settings as Partial<Settings>), onboarded: true });
    pending = null;
    haptic(20);
    toast('Dati ripristinati');
  }

  // ---- Cancella tutto ----
  let wipeOpen = $state(false);
  let wipeText = $state('');
  const wipeOk = $derived(wipeText.trim().toUpperCase() === 'CANCELLA');

  async function confirmWipe() {
    if (!wipeOk) return;
    await wipeAll();
    settings.lastBackupAt = null;
    saveSettings();
    wipeText = '';
    wipeOpen = false;
    haptic(30);
    toast('Tutti i dati sono stati cancellati');
  }
</script>

<div class="page fade">
  <PageHeader title="Backup" />
  <p class="muted">I tuoi dati restano solo su questo dispositivo. Fai un backup ogni tanto.</p>
  <p class="small muted">
    {settings.lastBackupAt ? `Ultimo backup: ${fmtDateTime(settings.lastBackupAt)}` : 'Non hai ancora fatto un backup.'}
  </p>

  <section class="card">
    <h3 style="margin-top:0">Backup completo</h3>
    <p class="small muted">Un file con tutto il diario, da conservare o da reimportare su un altro telefono.</p>
    <div class="stack">
      <button class="btn primary block" onclick={exportJson}><Icon name="save" /> Esporta backup (JSON)</button>
      {#if canShareFiles}
        <button class="btn block" onclick={shareJson}><Icon name="share" /> Condividi backup</button>
      {/if}
    </div>
  </section>

  <section class="card">
    <h3 style="margin-top:0">Tabelle per Excel</h3>
    <p class="small muted">File CSV leggibili con Excel o Fogli Google.</p>
    <div class="stack">
      <button class="btn block" onclick={exportCsv} disabled={!data.episodes.length}>Esporta CSV degli episodi</button>
      <button class="btn block" onclick={exportIntakesCsv} disabled={!data.episodes.some((e) => e.meds.length)}>Esporta CSV dei farmaci assunti</button>
    </div>
  </section>

  <section class="card">
    <h3 style="margin-top:0">Importa backup</h3>
    <p class="small muted">Ripristina un file esportato in precedenza.</p>
    <input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" onchange={onFile} />
    {#if !pending}
      <button class="btn block" onclick={() => fileInput.click()}><Icon name="upload" /> Scegli il file…</button>
    {/if}
    {#if importError}<p class="alert small" style="margin:12px 0 0">{importError}</p>{/if}
    {#if pending}
      <div class="alert danger fade" style="margin:12px 0 0">
        <strong>Sostituire i dati attuali?</strong>
        <p class="small">
          Il backup del {fmtDateTime(pending.exportedAt)} contiene {pending.episodes.length} episodi{pending.questionnaires?.length ? `, ${pending.questionnaires.length} questionari` : ''}{pending.prophylaxis?.length ? `, ${pending.prophylaxis.length} terapie` : ''}.
          I {data.episodes.length} episodi presenti ora su questo dispositivo verranno sostituiti.
        </p>
        <div class="stack">
          <button class="btn block danger-btn" onclick={confirmImport}>Sostituisci i dati attuali</button>
          <button class="btn block" onclick={() => (pending = null)}>Lascia stare</button>
        </div>
      </div>
    {/if}
  </section>

  <section class="card">
    <h3 style="margin-top:0">Cancella tutti i dati</h3>
    {#if !wipeOpen}
      <p class="small muted">Elimina definitivamente diario, farmaci, terapie e questionari da questo dispositivo.</p>
      <button class="btn block ghost danger" onclick={() => (wipeOpen = true)}><Icon name="trash" /> Cancella tutti i dati</button>
    {:else}
      <div class="alert danger fade" style="margin:0">
        <strong>Non si può annullare.</strong>
        <p class="small">Se non hai un backup, i dati andranno persi per sempre. Per confermare scrivi <strong>CANCELLA</strong>.</p>
        <div class="field">
          <input type="text" bind:value={wipeText} autocomplete="off" autocapitalize="characters" aria-label="Scrivi CANCELLA per confermare" placeholder="CANCELLA" />
        </div>
        <div class="stack">
          <button class="btn block danger-btn" disabled={!wipeOk} onclick={confirmWipe}>Cancella definitivamente</button>
          <button class="btn block" onclick={() => { wipeOpen = false; wipeText = ''; }}>Lascia stare</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .hidden { display: none; }
  .danger { color: var(--i3); }
  .danger-btn { background: var(--i3); color: var(--on-i); border-color: var(--i3); }
</style>
