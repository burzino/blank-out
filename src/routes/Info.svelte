<script lang="ts">
  import { DISCLAIMER } from '../lib/catalog';
  import { APP_VERSION } from '../lib/version';
  import PageHeader from '../components/PageHeader.svelte';
</script>

<div class="page fade">
  <PageHeader title="Info e privacy" />

  <section class="card">
    <h3 style="margin-top:0">Cos'è Blank Out</h3>
    <p>Un diario del mal di testa pensato per essere usato anche durante un attacco: pochi tocchi, colori tenui, niente distrazioni.</p>
    <p style="margin:0">Registra gli episodi, i farmaci e le terapie, ti avvisa quando conviene parlare con il medico e prepara un report da portare al neurologo.</p>
  </section>

  <section class="card">
    <h3 style="margin-top:0">Avvertenze</h3>
    <p style="margin:0">{DISCLAIMER}</p>
  </section>

  <section class="card">
    <h3 style="margin-top:0">Privacy</h3>
    <ul>
      <li>Nessun server, nessun account, nessuna pubblicità.</li>
      <li>Nessun tracciamento o statistica d'uso.</li>
      <li>I dati sono salvati solo su questo dispositivo, nel database locale del browser (IndexedDB).</li>
      <li>Escono dal telefono solo se sei tu a esportarli o condividerli.</li>
    </ul>
    <p class="small muted" style="margin:0">Se cancelli l'app o i dati del browser, il diario va perso: <a href="#/backup">fai un backup</a> ogni tanto.</p>
  </section>

  <section class="card">
    <h3 style="margin-top:0">Installala sul telefono</h3>
    <p><strong>Android (Chrome):</strong> apri il menu ⋮ e scegli "Installa app" (o "Aggiungi a schermata Home").</p>
    <p style="margin:0"><strong>iPhone (Safari):</strong> tocca Condividi, poi "Aggiungi alla schermata Home".</p>
    <p class="small muted" style="margin:12px 0 0">Una volta installata funziona anche senza connessione.</p>
  </section>

  <section class="card">
    <h3 style="margin-top:0">Crediti</h3>
    <ul class="small">
      <li>Classificazione indicativa basata sui criteri ICHD-3 (International Classification of Headache Disorders, 3ª edizione, International Headache Society).</li>
      <li>Segnali d'allarme secondo lo schema SNOOP4.</li>
      <li>MIDAS (Migraine Disability Assessment), questionario di W. F. Stewart e R. B. Lipton.</li>
      <li>HIT-6 (Headache Impact Test) © QualityMetric Incorporated e GlaxoSmithKline.</li>
    </ul>
    <p class="small muted" style="margin:0">Blank Out · versione {APP_VERSION}</p>
  </section>
</div>

<style>
  ul { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 6px; }
</style>
