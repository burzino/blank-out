# Istruzioni per Claude

## Modo di lavorare

- Delega sempre tutto il lavoro a degli agenti (strumento Agent): analisi, ricerca nel codice, implementazione, test e verifica.
  Il tuo ruolo è coordinare: spiega il compito all'agente con tutto il contesto necessario, controlla il risultato e riferiscilo all'utente.

## Stato del progetto (`docs/STATO.md`)

- Leggi `docs/STATO.md` prima di esplorare il codice e usalo per orientarti invece di rileggere tutto.
- Passa agli agenti delegati le parti di `docs/STATO.md` rilevanti per il loro compito.
- Dopo ogni modifica ad architettura, modello dati, feature del modello predittivo o lavori aperti, aggiorna la sezione interessata di `docs/STATO.md` e la sua data.
- Questo file contiene regole e convenzioni; i dettagli (mappa dei file, elenco delle feature, ricette) stanno in `docs/STATO.md`.

## Il progetto

- **Blank Out**: PWA offline-first, diario del mal di testa/emicrania. Svelte 5 (runes), TypeScript strict, Vite, vite-plugin-pwa (workbox, `autoUpdate`), vitest. Unica dipendenza runtime: `idb`.
- Nessun server, nessun account. Dati su IndexedDB, preferenze in localStorage. Non è un dispositivo medico.
- Deploy: GitHub Pages via `.github/workflows/deploy.yml` a ogni push su `main` (il CI esegue `npm test` e `npm run build`, non `svelte-check`). `base: './'` e routing con hash: niente percorsi assoluti (`/foo`), usare sempre percorsi relativi.
- `VITE_GOOGLE_CLIENT_ID` (in `.env` o variabile del repo) serve solo al backup su Drive; è pubblico, non un segreto.

## Comandi

Ambiente Windows: shell PowerShell 5.1 (niente `&&`, usare `;` / `if ($?) { ... }`), disponibile anche Git Bash.

- `npm run dev` — server di sviluppo
- `npx vitest run` (= `npm test`) — test (`src/**/*.test.ts`, ambiente node)
- `npx svelte-check` (= `npm run check`) — controllo tipi TS + Svelte
- `npm run build` — build in `dist/` (genera anche il service worker); `npm run preview` per provarla

## Punti fermi dell'architettura

(Mappa dettagliata dei file, flussi e feature in `docs/STATO.md`.)

- `src/lib/db.svelte.ts` è l'unico accesso a IndexedDB: la UI legge dallo stato in memoria `data` e scrive con le funzioni `save*`. Backup: `exportBackup` / `isBackup` / `importBackup`.
- `src/lib/settings.svelte.ts`: preferenze per-dispositivo in localStorage, caricate come `{ ...defaults, ...salvate }`.
- `src/lib/catalog.ts`: cataloghi clinici, soglie (`THRESHOLDS`), opzioni del check-in e testi fissi (disclaimer, messaggi d'allarme).
- Logica pura in `src/lib/` (`clinic.ts`, `analytics.ts`, `advisor/`), coperta da test; i componenti in `src/routes/` e `src/components/` restano sottili.
- Notifiche solo locali (niente Web Push, nessun server): funzionano ad app aperta o in background da poco; `public/sw-notify.js` è importato nel SW generato. Tutto ciò che conta va mostrato anche in-app.
- Routing a hash (`src/lib/router.svelte.ts`); nuove pagine vanno registrate nella tabella delle route di `App.svelte`.

## Dati e compatibilità all'indietro

- Dati già salvati e backup vecchi (file JSON, Drive) devono **sempre** continuare a caricarsi.
- Campi nuovi solo **facoltativi** (`?:`) e letti con un fallback; mai rinominare o cambiare significato a un campo esistente.
- Valori legacy: lasciarli nel tipo come `@deprecated` e convertirli con una funzione dedicata (es. `CheckIn.exercise` booleano → `activityOf()` in `catalog.ts`); usare sempre la funzione, mai il campo grezzo.
- `BackupFile` resta `version: 1` compatibile: `importBackup` deve accettare file senza i campi nuovi (`?? []`, `{ ...newEpisode(), ...e }`). Nuove impostazioni: aggiungerle a `defaults` in `settings.svelte.ts`.
- Cambi di schema IndexedDB (nuovi store/indici) richiedono un aumento di versione con `upgrade` incrementale, senza perdere dati.

## Convenzioni

- Testi dell'interfaccia e commenti del codice in **italiano**; tono semplice, pensato per chi sta male.
- Accessibilità: target di tocco ≥ 44px (pulsanti principali 48px+), `aria-label` sui controlli solo-icona, contrasto adeguato in entrambi i temi; colori solo tramite variabili CSS di `app.css`, mai valori fissi nei componenti; rispettare `prefers-reduced-motion`.
- Soglie e cataloghi clinici solo in `catalog.ts`; logica pura fuori dai componenti (in `lib/`) e coperta da test.
- Assistente: ogni prior o soglia nuova deve citare la fonte di letteratura in un commento (stile di `LIT`). Il coach non nomina mai farmaci specifici né dosi. Diagnosi e consigli sono sempre "indicativi, da discutere col medico", con i disclaimer di `catalog.ts`.
- Privacy: nessun dato sanitario lascia il dispositivo, salvo il backup su Drive (cifrato, attivato dall'utente). Il meteo invia a Open-Meteo solo coordinate arrotondate e date. Niente analytics, tracciamento o nuove chiamate di rete senza chiederlo.

## Prima di dire "fatto"

- `npx vitest run`, `npx svelte-check` e `npm run build` devono passare senza errori.
- Per modifiche al modello dati, verificare che un backup vecchio si importi ancora (aggiungere un test se serve).

## Git

- Messaggi di commit in italiano: titolo breve e descrittivo, senza prefissi (es. "Registrazione farmaci più rapida", "Google Drive: niente login ripetuti, popup solo da un tocco").
- Fare commit o push solo quando l'utente lo chiede. Non committare `.env` né file di dati personali (es. CSV esportati).
