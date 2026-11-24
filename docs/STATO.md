# Blank Out — stato del progetto

> Riferimento per agenti di sviluppo: serve a orientarsi senza rileggere tutto il codice.
> **Ultimo aggiornamento: 2026-11-24** (HEAD `dd95116` + modifiche non committate, vedi §6).

PWA offline-first, diario del mal di testa. Svelte 5 (runes) + TypeScript + Vite 8 + vite-plugin-pwa + vitest. Unica dipendenza runtime: `idb`. Nessun server: dati solo sul dispositivo (IndexedDB + localStorage); unici servizi esterni opzionali: Google Drive (backup cifrato) e Open-Meteo (meteo). UI e testi in italiano. Deploy: GitHub Pages via `.github/workflows/deploy.yml` (push su `main` → `npm ci`, `npm test`, `npm run build` con `VITE_GOOGLE_CLIENT_ID` da `vars.GOOGLE_CLIENT_ID`), URL https://burzi.eu/blank-out/.

---

## 1. Mappa dei file

### Radice
| File | Ruolo |
|---|---|
| `vite.config.ts` | `base: './'`; VitePWA (`autoUpdate`, manifest it, shortcut `./#/log`, `workbox.importScripts: ['sw-notify.js']`); `test: { environment: 'node', include: ['src/**/*.test.ts'] }` |
| `public/sw-notify.js` | Importato nel SW generato: `notificationclick` → chiude la notifica, mette a fuoco una finestra dell'app o apre `./` |
| `index.html`, `README.md`, `.github/workflows/deploy.yml` | entry HTML, descrizione funzioni, CI/deploy |

### `src/`
| File | Ruolo / export |
|---|---|
| `main.ts` | `registerSW({ immediate: true })`, `mount(App)` |
| `App.svelte` | Gate: `Lock` → "Caricamento…" → `Onboarding` → pagina. `onMount`: `loadAll()` poi `startReminders()` + `startAutoBackup()`. Tabella `routes` (hash → componente), tabbar 5 tab (Oggi, Calendario, Assistente, Statistiche, Altro); `{#key pageKey}` ricrea la pagina se cambia la query |
| `app.css` | Token tema (`data-theme`, `data-large`), classi `.card .chip .seg .btn .field .stack .small .muted` |
| `vite-env.d.ts` | tipi Vite/PWA |

### `src/lib/`
| File | Ruolo / export principali |
|---|---|
| `types.ts` | Tipi dati persistiti (vedi §2) |
| `db.svelte.ts` | Store reattivo `data` ($state) + IndexedDB `blank-out` v1. `loadAll()`, `uid()`, `nowIso()`, `newEpisode(partial)`, `saveEpisode(e)`, `deleteEpisode(id)`, `addEpisodes(list)`, `getEpisode(id)`, `activeEpisode()`, `saveMedication/deleteMedication`, `saveProphylaxis/deleteProphylaxis`, `saveQuestionnaire/deleteQuestionnaire`, `getDay(date)`, `saveDay(day)` (cancella il record se vuoto), `addCustomTrigger(label)`, `saveProfile()`, `exportBackup(settings): BackupFile`, `isBackup(x)`, `importBackup(b)` (clear + put in una transazione, abort su errore), `wipeAll()` |
| `settings.svelte.ts` | `Settings` in localStorage `blankout.settings` (merge con `defaults`). `settings`, `saveSettings()`, `replaceSettings(next)`, `applySettings()` (tema, testo grande, meta theme-color) |
| `router.svelte.ts` | Router hash: `route {path, params}`, `go(path)`, `back(fallback)` |
| `catalog.ts` | Cataloghi `Opt {id,label}` e soglie: `THRESHOLDS`, `QUICK_INTENSITY`, `intensityLevel(v)`, `LEVEL_LABEL`, `LOCATIONS SIDES QUALITIES SYMPTOMS AUTONOMIC AURAS TYPICAL_AURAS TRIGGERS DISABILITY EFFICACY`, `MedClass`, `MED_CLASSES` (+ gruppo MOH), `classLabel()`, `mohGroup()`, `KNOWN_ACUTE`, `KNOWN_PROPHYLAXIS`, `FREQUENCIES STOP_REASONS SIDE_EFFECTS`, `RED_FLAGS_URGENT/SOON`, `URGENT_MSG SOON_MSG DISCLAIMER CLASSIFY_NOTE`, **`CHECKIN`** (opzioni check-in), **`activityOf(c)`**, **`checkinDone(c)`**, **`flagOf(c, key)`** (chip sì/no), `PRODROMES`, `labelOf(list,id)` |
| `clinic.ts` | Logica clinica pura. Date locali: `dayKey(d)`, `keyToDate(k)`, `addDays(k,n)`, `daysBetween(a,b)`, `rangeKeys(from,to)`, `episodeDays(e)`, `durationMin(e)`, `formatDuration(min)`. `classify(e)` (ICHD-3 per episodio, `CLASS_LABEL`), `isMigraineEpisode`, `computeStats(all,from,to)`, `mohStatus`, `computeAlerts`, `chronicStatus`, `periodStarts(days)`, `cycleCorrelation`, `midasGrade`, `hit6Impact`, `questionnaireDue`, `prophylaxisEfficacy`, `autoRedFlag`, `rankRecent`, `pendingEfficacy(episodes, now)` |
| `episodes.svelte.ts` | Azioni UI con toast "Annulla": `clock` (tick 30 s), `startEpisode(start,intensity,copyFrom?)`, `endEpisode(e,onChangeTime?)`, `removeEpisode(e)`, `rankedMeds()`, `intakeFrom(m,time)`, `takeMed(m,target?,time?)` (apre un episodio se non ce n'è uno attivo), `rememberMed(m)`, `knownMedClass(name)`, `rankedTriggers()`, `daysSinceLast()`, `redFlagFor(e)` |
| `meds.ts` | `COMMON_ACUTE_NAMES`, `COMMON_ACUTE`, `findKnownAcute(name)`, `medUseDays(episodes,name,now,days)` |
| `analytics.ts` | Helper per Calendario/Statistiche/Report: `dayMarks`, `dayInfoMap`, `monthSpan`, `lastMonths`, `monthsIn`, `monthCells`, `rollingWindow`, `firstRecord`, `effectiveWindow`, `monthAxisPos`, `fmtDay fmtDayShort fmtTime fmt1 pct`, `tally`, `prevalentSide`, `checkinSummary`, `reportFactors` |
| `profile.ts` | Profilo clinico: `SEX_OPTS HORMONAL_OPTS FAMILY_OPTS SMOKING_OPTS`, `normalizeProfile` (leggere SEMPRE il profilo con questa), `parseOnset`, `onsetAgeOf`, `profileLines`, `auraWithCombinedPill` |
| `driveSync.ts` | Logica pura del sync Drive: `parseStoredToken`, `tokenUsable`, `tokenExpiry`, `shouldShowSyncBanner` (`BANNER_AFTER_MS` = 48 h), `fingerprint` |
| `reminders.ts` | Notifiche locali: `notificationsSupported()`, `requestNotifications()`, `eveningMessage(now)`, `checkDailyReminder(now)`, `checkMorningReminder(now)`, `notifyPendingEfficacy(now)`, `startReminders()` |
| `drive.svelte.ts` | Backup cifrato su Google Drive appDataFolder: stato `drive`, `prepareGoogle()`, `connectGoogle()`, `reauth()`, `backupNow()`, `backupFromTap()`, `startAutoBackup()`, `passwordProblem(pw,confirm)`, `enableAutoBackup(pw)`, `disconnect()`, `listBackups()`, `restore(fileId,pw)`, `applyRestore(b)` |
| `crypto.ts` | PBKDF2-SHA256 (250k iter) → AES-GCM 256: `deriveKey`, `encryptJson`, `decryptJson`, `decryptWithKey`, `isEncryptedFile`, `WrongPasswordError`, `saveLocalKey/loadLocalKey/clearLocalKey` (CryptoKey non estraibile in IndexedDB `blank-out-keys`, store `keys`, chiave `backup`), `MIN_PASSWORD = 6` |
| `csv.ts` | Export Excel-it (`;` + BOM): `localDateTime`, `episodesCsv`, `intakesCsv`, `downloadFile(name,content,type)` |
| `migraineBuddy.ts` | Import CSV Migraine Buddy: `parseCsv(text)` (RFC 4180), `parseMed(raw)`, `parseMigraineBuddy(text): {episodes, skippedRows}` (lancia se non riconosciuto) |
| `lock.svelte.ts` | Blocco dissuasivo a password (SHA-256 confrontato con hash fisso, flag in localStorage `blankout.unlocked`): `lock`, `tryUnlock(pw)` |
| `ui.svelte.ts` | `toasts`, `toast(text, action?, ms)`, `dismiss(id)`, `haptic(ms)` |
| `config.ts` | `GOOGLE_CLIENT_ID` da `import.meta.env.VITE_GOOGLE_CLIENT_ID` (pubblico) |
| `version.ts` | `APP_VERSION = '1.0.0'` (allineare a package.json) |
| `*.test.ts` | `clinic.test.ts` (classify, MOH, metriche, questionari), `migraineBuddy.test.ts`, `driveSync.test.ts`, `report.test.ts` |

### `src/lib/advisor/` (tutto on-device)
| File | Ruolo / export |
|---|---|
| `types.ts` | `AdvisorContext {episodes, days, questionnaires, prophylaxis, medications, now, weather?}`, `Diagnosis`, `Advice`, `AdviceCategory`, `Pattern`, `WeatherDay`, `Forecast`, `TriggerRisk`, `DailyPlan`, `WeeklyGoal`, `Confidence` |
| `triggers.ts` | `LIT` (prior letteratura), `Timeline`, `buildTimeline(ctx)`, `CONSEQUENCE_PRONE`, `fieldTime(c,f)`, `exposureOf(c,attackStartMs)`, `periAt(tl,k)`, `isWeekend(k)`, `posteriorRR(a,n1,c,n0,prior)`, `basisOf(w)`, `prodromeExposure(tl,i,id?)`, `personalTriggers(ctx, tl?)` |
| `forecast.ts` | Regressione logistica bayesiana MAP: `MIN_DAYS=60`, `MIN_ATTACKS=8`, `trainLogistic(X,y,{sd})`, `predictLogistic(m,x)`, `auc(scores,y)`, `forecast(ctx): Forecast`, `riskFactorsToday(ctx)` |
| `coach.ts` | Consigli NON medici: `dailyPlan(ctx, fc, triggers, todayFactors)`, `attackPlan(ctx)`, `weeklyGoals(ctx, triggers)` |
| `diagnosis.ts` | `ICHD_MIN`, `recentFrequency(ctx)`, `frequencyClass(perMonth)`, `overallDiagnosis(ctx)` |
| `recommendations.ts` | `ADVISOR_DISCLAIMER`, `recommendations(ctx, dx)` (linee guida, mai dosaggi) |
| `patterns.ts` | Statistica: `normCdf`, `twoProp`, `wilson`, `chi2Sf`, `chi2Rates`, `strengthFromP`, `dailyBase(ctx)`, `findPatterns(ctx)` (include pattern da `personalTriggers` e prodromi; `MIN_EPISODES=8`) |
| `weather.ts` | Open-Meteo, cache localStorage `blankout.weather`: `loadCachedWeather()`, `fetchWeather(lat,lon,from,to)`, `getLocation()` |
| `advisor.test.ts`, `ml.test.ts` | diagnosi, consigli, coach, logistica, forecast, patterns, personalTriggers, movimento, causalità inversa, chip sì/no e fattori nuovi |

### `src/components/`
| File | Ruolo (props) |
|---|---|
| `CheckIn.svelte` | Check-in giornaliero (`date?` default oggi; Home per oggi, Calendario per i giorni passati). `ROWS` (righe a scelta singola), chip sì/no Alcol / Sonno a orari diversi / Schermi (`flip(FlagKey)`), prodromi (Chips), pannello info "quando/come", salva a ogni tocco via `saveDay` e scrive l'ora del campo toccato in `times` |
| `LogSheet.svelte` | Log rapido (`open` bindable, `copyFrom?`): apri → intensità (salvato) → dettagli facoltativi |
| `MedPicker.svelte` | Scelta farmaco (`onpick(m,time)`, `limit`, `showTime`) |
| `DriveSync.svelte` | Card backup Google Drive (in Backup) |
| `MonthGrid.svelte` | Griglia mensile (Calendario e Report) |
| `BarChart.svelte` | Barre per mese con marcatori (`groups, series, markers, unit`) |
| `Chips.svelte` | Chip multi (array) o singola (string) |
| `TimeChips.svelte` | Adesso / −30 min / −1 h / −2 h / Altro (`value` bindable, `min`, `unset`) |
| `ProphylaxisDetail.svelte`, `ProphylaxisEfficacy.svelte` | Dettaglio profilassi (`id`); efficacia prima/dopo (`p, compact`) |
| `Sheet.svelte`, `Toggle.svelte`, `Toasts.svelte`, `Icon.svelte` (`name,size`), `PageHeader.svelte` (`title,fallback`), `Lock.svelte` | UI di base |

### `src/routes/` (hash → pagina, in `App.svelte`)
| Route | File | Contenuto |
|---|---|---|
| `/`, `/log` | `Home.svelte` | Episodio in corso / pulsante log, card "Oggi tutto bene?" (dopo `reminderTime`), efficacia farmaci pendente, avvisi, `<CheckIn />`, piano di oggi (`dailyPlan`) o piano attacco (`attackPlan`), "Ricollega Google". `/log` apre LogSheet una volta e riscrive l'hash in `#/` |
| `/episode?id=` | `Episode.svelte` | Dettaglio episodio, autosalvataggio + pulsante Salva |
| `/calendar` | `Calendar.svelte` | Mese, flusso/ciclo, giorno senza mal di testa, episodi; per oggi e i giorni passati pulsante "check-in del giorno" che apre `<CheckIn date={selected} />` nel foglio |
| `/assistant` | `Assistant.svelte` | Inquadramento, consigli, pattern, previsione, fattori (`rr ≥ 1.15`, max 6), obiettivi settimanali, meteo |
| `/stats` | `Stats.svelte` | Statistiche |
| `/more` | `More.svelte` | Menu "Altro" |
| `/meds`, `/prophylaxis`, `/questionnaires`, `/report`, `/backup`, `/settings`, `/redflags`, `/info` | omonimi | farmaci, profilassi, MIDAS/HIT-6, report stampabile (senza tabbar), backup/import/CSV/Drive/Migraine Buddy, impostazioni, segnali d'allarme, info |
| — | `Onboarding.svelte` | Mostrato finché `!settings.onboarded` (non è una route) |

---

## 2. Modello dati (`src/lib/types.ts`)

- **Episode**: `id`, `start` ISO, `end` ISO|null (null = in corso), `intensity` 0-10, `peak?`, `locations[] side? quality[] symptoms[] autonomic[] aura[] auraDurationMin?`, `triggers[]` (id catalogo o testo libero), `meds: MedIntake[]`, `disability?`, `redFlags[]`, `notes`, `forDoctor?`, `createdAt`, `updatedAt`.
- **MedIntake**: `id name cls time dose? efficacy?('nessuna'|'parziale'|'completa') recurrence24h?`.
- **Medication** (farmaci personali): `id name cls dose? archived?`.
- **Prophylaxis**: `id name dose frequency startDate endDate? stopReason? sideEffects[{id,date}] notes`.
- **Questionnaire**: `id type('midas'|'hit6') date answers[] score a? b?`.
- **DayInfo** (chiave `date` YYYY-MM-DD): `period? periodStart? headacheFree? checkin?`.
- **CheckIn**: `at` ISO dell'ultima modifica (riscritto a ogni salvataggio); `sleep?('poco'|'ok'|'troppo')` = notte precedente; `sleepIrregular?: boolean` (notte precedente a orari diversi dal solito); `stress?('basso'|'medio'|'alto')`; `meals?('regolari'|'saltato')`; `water?('poca'|'ok')`; `caffeine?('meno'|'solito'|'piu')`; `alcohol?: boolean`; `screens?: boolean` (molte ore di schermo / luce forte); `activity?: Activity` (`'nessuna'|'leggera'|'moderata'|'intensa'`); `prodromes?: string[]` (id `PRODROMES`); `times?: Partial<Record<CheckInField, string>>` = ISO di quando ogni campo è stato impostato l'ultima volta (assente nei check-in vecchi; campo senza ora → si usa `at`). Il check-in è "fatto" se `sleep && stress` (`checkinDone`).
- **Chip sì/no** (`alcohol`, `sleepIrregular`, `screens`): leggere SEMPRE con `flagOf(c, key)`. Non toccato = `undefined`; se il check-in è fatto vale `false` (per `sleepIrregular`/`screens` solo se esiste `times`, cioè check-in salvato da una versione che mostra quei chip). Motivo: senza giorni "no" il fattore non si stimerebbe mai (resterebbe sul prior); un chip dimenticato è un errore non differenziale che attenua la stima verso 1, non crea trigger falsi.
- **Campi legacy**: `CheckIn.exercise?: boolean` (deprecato) → leggere SEMPRE con `activityOf(c)` (catalog.ts): `activity` se presente, altrimenti `true → 'moderata'`, `false → 'nessuna'`. `CheckIn.svelte` converte al caricamento e scrive `activity` (senza `exercise`) alla prima modifica.

**Persistenza**
| Dove | Contenuto |
|---|---|
| IndexedDB `blank-out` v1 | store `episodes`, `medications`, `prophylaxis`, `questionnaires` (keyPath `id`), `days` (keyPath `date`), `meta` (chiavi `customTriggers`, `profile`: `Profile` tutto facoltativo — `name? birthYear? sex? hormonal? hormonalNote? onsetAge?/onsetYear? familyHistory? smoking?` — letto sempre via `normalizeProfile`) |
| IndexedDB `blank-out-keys` | chiave AES del backup Drive |
| localStorage | `blankout.settings` (Settings), `blankout.drive` (stato Drive senza token; ora anche `pendingSince`, `syncedHash`, `account`), `blankout.drive.token`, `blankout.weather` (cache meteo), `blankout.unlocked` |

Le scritture passano da `$state.snapshot()` (un proxy $state dà DataCloneError). La UI legge sempre da `data` in memoria.

**Settings** (`settings.svelte.ts`): `theme largeText haptics onboarded reminderEnabled reminderTime('21:00') morningReminderEnabled(false) morningReminderTime('08:30') trackCycle lastBackupAt lastReminderDate lastMorningReminderDate weatherEnabled weatherLat weatherLon`.

**Backup** (`BackupFile`): `{ app: 'blank-out', version: 1, exportedAt, episodes, medications, prophylaxis, questionnaires, days, customTriggers, settings?, profile?: Profile }` (profilo letto con `normalizeProfile`). Import: `isBackup()` → `importBackup()` (sostituisce tutto; gli episodi vengono uniti a `newEpisode()` per riempire i campi mancanti) → `replaceSettings({...b.settings, onboarded: true})`. Su Drive lo stesso JSON è cifrato (`EncryptedFile`).

---

## 3. Flussi principali

- **Registrare un episodio**: Home → `LogSheet` → `startEpisode()` (`newEpisode` + `saveEpisode` + toast Annulla) → dettagli facoltativi; `takeMed()` aggiunge un `MedIntake` all'episodio attivo o ne apre uno; `endEpisode()` chiude. Dettaglio completo in `/episode?id=`. Efficacia chiesta dopo `THRESHOLDS.efficacyAskAfterMin` (120 min) via `pendingEfficacy` (card in Home + notifica).
- **Check-in giornaliero**: `CheckIn.svelte` → `pick()/flip()/Chips onchange` → `save(campo)` → `saveDay({...getDay(date) ?? {date}, checkin: {...c, times: {...times, [campo]: ora}, at: ora}})`. `at` viene riscritto a ogni modifica; `times[campo]` solo per il campo toccato (tolto se la riga viene deselezionata). Da Home (oggi) o dal foglio del Calendario (oggi e giorni passati, mai futuri). I promemoria guardano solo il check-in di oggi.
- **Pipeline Assistente**: `AdvisorContext` costruito in Home/Assistant da `data` (+ `loadCachedWeather()` se `weatherEnabled`) → `buildTimeline(ctx)` → `personalTriggers` / `forecast` / `riskFactorsToday` → `coach.dailyPlan(ctx, fc, trig, factors)` (Home, se nessun episodio attivo; altrimenti `attackPlan`) e `weeklyGoals(ctx, trig)` (Assistant). Assistant inoltre: `overallDiagnosis` → `recommendations`, `findPatterns`. Tutto `$derived`: si ricalcola a ogni modifica dei dati.
- **Promemoria** (`reminders.ts`): `startReminders()` dopo `loadAll()`; controllo immediato + `setInterval(tick, 60000)`. `tick` = `checkMorningReminder` (dopo `morningReminderTime`, entro 4 h, solo se manca `checkin.sleep`, una volta al giorno via `lastMorningReminderDate`) + `checkDailyReminder` (dopo `reminderTime`, una volta al giorno, testo da `eveningMessage()`; null se giornata registrata e `checkin.stress` presente) + `notifyPendingEfficacy` (set in memoria). Notifiche via `reg.showNotification`; click gestito da `public/sw-notify.js`.
- **Drive sync** (`drive.svelte.ts`): attivazione con password → chiave derivata salvata localmente. `startAutoBackup()` osserva `data` con `$effect.root` (JSON diff) → debounce 20 s → `backupNow()` → `encryptJson` → upload di `blank-out-backup.enc.json` + snapshot giornaliero `blank-out-YYYY-MM-DD.enc.json` (tenuti 7). Flush su `visibilitychange: hidden` e `online`; backup all'avvio solo se i dati differiscono dall'ultimo backup (`fingerprint` vs `syncedHash`). Stato persistito: `pendingSince/syncedHash/account`; riautenticazione con `login_hint` e `prompt: ''`. Token scaduto → `drive.needsReauth`; il banner in Home compare solo dopo 48 h di modifiche non sincronizzate (`shouldShowSyncBanner`). Limite: senza backend non c'è refresh token; il popup GIS si apre solo dentro un tocco (`backupFromTap`, `reauth`). Ripristino: `listBackups` → `restore` → `applyRestore`.
- **Import Migraine Buddy** (`Backup.svelte`): `parseMigraineBuddy(text)` usa solo la tabella attacchi (intestazione `#`, "Iniziato"…), ora locale + offset, durata → `end`, mappa zone/sintomi/trigger/farmaci con efficacia, il resto in `notes`. Deduplica per minuto di inizio (`iso.slice(0,16)`), anteprima, poi `addEpisodes()` + `rememberMed()` per i farmaci.
- **Report medico** (`Report.svelte`): riga profilo (`profileLines`), nota aura + estroprogestinico (`auraWithCombinedPill`), risposta ai farmaci completa/parziale/nessuna, tempo all'assunzione (`intakeDelayMin`, `intakeTimingByDrug`, % entro 1 h), giorni con attività ridotta, durata mediana dell'aura (`auraDurationSummary`), sezione "Check-in giornaliero" (`checkinSummary`: aderenza; con ≥14 check-in quote sonno/stress e fattori `personalTriggers` con basis misto/personale e rr ≥ 1.2 con IC 90%; niente previsione). Profilo modificabile in Settings → Profilo.
- **Routing**: hash (`#/path?query`); `App.svelte` sceglie il componente, fallback Home; `go()`/`back()`.

---

## 4. Modello predittivo

### Linea temporale (`buildTimeline`)
Un indice per giorno dal primo dato (episodio o `DayInfo` con contenuto; max 3 anni) a OGGI. Array: `start` (attacco iniziato quel giorno), `startAt` (ms del primo attacco del giorno, NaN se nessuno), `checkin` (grezzo, usato da `riskFactorsToday` e prodromi), `exposure` (check-in "pulito" per i modelli: `exposureOf` → chip risolti con `flagOf`, movimento con `activityOf`, fattori soggetti a causalità inversa tolti), `duringAttack` (check-in con `at` dentro un attacco iniziato negli ultimi 3 giorni), `med` (sintomatico, antiemetici esclusi), `peri` (finestra −2/+2 dall'inizio flusso; −1 = ignoto), `weather`, `attacks` (fino a ieri), `checkinDays`.

### Finestre
- **forecast.ts**: un esempio per giorno da 0 a ieri, `y = 1` se quel giorno INIZIA un attacco. Feature del giorno da check-in di oggi + ieri, calendario, meteo, storia precedente. Mancanti → imputati (prevalenza personale se ≥10 valori, altrimenti `typical`); per "domani" `checkin_missing = 0`. Prior intercetta: `logit(4/30) − Σ log(rr)·typical`. Valutazione rolling-origin (AUC, Brier) se ≥60 giorni e ≥8 attacchi; Platt se ≥15 positivi fuori campione. `basis`: generale / misto / personale (≥180 gg, ≥20 attacchi, ≥60 check-in). Livello: `< 0.8×` base rate basso, `> 1.5×` alto. Drivers: max 3, contributo ≥ 0.08.
- **triggers.ts `personalTriggers`**: esposizione al giorno i, esito = attacco che inizia il giorno i **o i+1** (fino a `today−2`). `posteriorRR`: log-RR empirico (correzione +0.5) pesato con il prior LIT, varianza ×2 (`OVERLAP`) per finestre sovrapposte; IC 90%; `basis` da quota di informazione personale (<0.33 / <0.67).
- **Esclusione causalità inversa** (risolto 2026-11-24): `personalTriggers` e `rawRow` leggono `tl.exposure`. Nei giorni in cui inizia un attacco i fattori `CONSEQUENCE_PRONE` = `stress meals water caffeine alcohol screens activity` contano solo se registrati PRIMA del primo attacco del giorno (`fieldTime` = `times[campo]`, altrimenti `at`; dopo o ora illeggibile → non noto). Motivo: possono essere conseguenze del dolore (nausea → pasto saltato/meno caffè, caffè in più per alleviare, immobilità, si evitano alcol e schermi per fotofobia; lo stress percepito sale col dolore ed è giudicato a posteriori, Houle & Nash 2008). Restano validi `sleep`/`sleepIrregular` (notte prima) e i prodromi (gestiti da `duringAttack`). Check-in vecchi senza `times`: si usa `at` (≥ ora vera → conservativo). Check-in compilati a posteriori dal Calendario: ore successive all'attacco → nei giorni d'attacco quei fattori diventano non noti (accettato, conservativo). L'esclusione dipende dall'esito, non dall'esposizione: l'odds ratio resta corretto (logica caso-controllo, RR ≈ OR); nel forecast i valori mancanti sono imputati → attenuazione verso 0, non trigger falsi. I fattori di "ieri" (`cy`) usano lo stesso check-in pulito.

### Feature `SPECS` (forecast.ts) — prior `rr`, `sd` su log(rr), `typical`
| id | rr | sd | typ | significato |
|---|---|---|---|---|
| sleep_poco | 1.6 | 0.35 | 0.2 | sonno = poco (notte prima) |
| sleep_troppo | 1.3 | 0.4 | 0.1 | sonno = troppo |
| sleep_poco_ieri | 1.3 | 0.35 | 0.2 | poco sonno nel check-in di ieri |
| sleep_irregolare | 1.3 | 0.4 | 0.15 | sonno a orari diversi dal solito (notte prima) |
| screens | 1.15 | 0.45 | 0.25 | molte ore di schermo / luce forte oggi |
| stress_alto | 1.5 | 0.4 | 0.2 | stress alto oggi |
| stress_alto_ieri | 1.2 | 0.4 | 0.2 | stress alto ieri |
| stress_calo | 1.6 | 0.4 | 0.05 | ieri alto, oggi non alto ("let-down") |
| meals_saltato | 1.5 | 0.4 | 0.1 | pasto saltato |
| water_poca | 1.2 | 0.4 | 0.2 | poca acqua |
| caffeine_piu / caffeine_meno | 1.35 / 1.3 | 0.4 | 0.1 | caffè più / meno del solito |
| alcohol_ieri / alcohol | 1.4 / 1.15 | 0.4 | 0.1 | alcol ieri / oggi |
| no_exercise | 1.2 | 0.3 | 0.4 | sedentarietà a dose: nessuna 1, leggera 0.5, moderata/intensa 0 (`SEDENTARY`); unica con label `down` ("Hai fatto movimento") |
| exercise_intensa | 1.3 | 0.45 | 0.08 | movimento intenso oggi |
| exercise_intensa_ieri | 1.15 | 0.4 | 0.08 | movimento intenso ieri |
| prodrome / prodrome_ieri | 2.0 / 3.0 | 0.5 | 0.1 | prodromi oggi / ieri (non durante attacco) |
| checkin_missing | 1 | 0.5 | 0.5 | 1 se nel training manca il check-in |
| peri | 2.0 | 0.35 | 0.18 | finestra perimestruale (reale o stimata con `periAt`) |
| pressure_drop | 1.25 | 0.3 | 0.15 | Δ pressione ≤ −5 hPa oggi o ieri |
| heat | 1.15 | 0.3 | 0.1 | tempMax ≥ 30 °C |
| weekend | 1.1 | 0.3 | 2/7 | sabato/domenica |
| since | 1 | 0.5 | 0 | `log(1+giorni dall'ultimo attacco) − log 8` (max 60, default 30) |
| recent7 | 1 | 0.5 | 1 | attacchi negli ultimi 7 giorni |
| meds3 | 1 | 0.5 | 0.5 | giorni con sintomatico negli ultimi 3 |

### `LIT` (triggers.ts) — usati da `personalTriggers`
`sleep_poco 1.6/0.35`, `sleep_troppo 1.3/0.4`, `sleep_irregolare 1.3/0.4` (Kelman 2007, Houle 2012, Bertisch 2020, Couturier 1992: ordine di grandezza per analogia), `screens 1.15/0.45` (Kelman 2007 luce ~38%, Hougaard 2013 provocazione rara, Montagni 2016 trasversale OR ~1.4: prior debole), `stress_alto 1.5/0.4`, `meals_saltato 1.5/0.4`, `water_poca 1.2/0.4`, `caffeine_piu 1.35/0.4`, `caffeine_meno 1.3/0.4`, `alcohol 1.4/0.4`, `no_exercise 1.2/0.3` (confronto nessuna vs moderata/intensa, leggera = null), `exercise_intensa 1.3/0.45`, `prodrome 3.0/0.5`, `perimenstrual 2.0/0.35` (solo se ci sono cicli), `pressure_drop 1.25/0.3` (solo con meteo), `weekend 1.1/0.3`. Più `prodrome_<id>` per ogni prodromo con ≥3 giorni esposti (prior `SINGLE_PRODROME 2.0/0.6`). Fonti in commento sopra `LIT`.

Nota: gli id di `personalTriggers`/`riskFactorsToday`/coach sono "per fattore" (es. `alcohol`, `exercise_intensa`, `perimenstrual`), quelli di `SPECS` sono "per feature" (es. `alcohol_ieri`, `exercise_intensa_ieri`, `peri`). `riskFactorsToday` mappa ieri → id del fattore (alcol ieri → `alcohol`, sforzo ieri → `exercise_intensa`, calo stress → `stress_alto`).

### Checklist: aggiungere un fattore al check-in (verificata sul codice)
1. `types.ts` — campo in `CheckIn` (se cambia un campo esistente: tenere il vecchio come `@deprecated` + convertitore tipo `activityOf`).
2. `catalog.ts` — opzioni in `CHECKIN` (se a scelta singola).
3. `CheckIn.svelte` — tipo `SegKey` + voce in `ROWS` (scelta singola) oppure un chip sì/no (aggiungere a `FlagKey` per `flip`, e a `flagOf` in catalog.ts per la regola "non toccato = no a check-in fatto"); aggiungere il campo a `CheckInField` in `types.ts` (ora in `times`); valutare il testo del pannello info (mattino/sera).
4. `forecast.ts` — voce in `SPECS` (rr, sd, typical, up/down), lettura in `rawRow` (blocco `c` e, se serve, `cy` per "ieri": sono già `tl.exposure`), voce in `riskFactorsToday` (legge il check-in grezzo).
5. `triggers.ts` — prior in `LIT` (con fonte nel commento) + `estimate(...)` in `personalTriggers` (esposizione `null` se non noto); se è un fattore della giornata che può essere conseguenza del dolore, aggiungerlo a `CONSEQUENCE_PRONE`; se è un chip sì/no, risolverlo in `exposureOf`.
6. `coach.ts` — `ACTIONS[id]` (action/habit/generic, mai farmaci/dosi), posizione in `FACTOR_ORDER`, `MODIFIABLE` se modificabile, eventuale `GOALS` (trigger + `ok(c)`).
7. Test in `src/lib/advisor/ml.test.ts` (vedi blocco `describe('movimento')` come modello: legacy, personalTriggers impara, forecast domani, fattori di oggi) e `advisor.test.ts` per il coach (niente dosaggi).
8. Opzionale: `reminders.ts` `eveningMessage` (testo), `patterns.ts` lo riceve già via `personalTriggers`; Assistant lo mostra in automatico se `rr ≥ 1.15`.

---

## 5. Ricette rapide

- **Comandi** (PowerShell o Bash): `npx vitest run` (67 test, 6 file al 2026-11-24), `npx svelte-check` (0 errori, **2 warning preesistenti**: `TimeChips.svelte:12` `unset` e `Episode.svelte:18` `ep`, `state_referenced_locally` — ignorarli), `npx vite build`, `npm run dev`.
- **Nuova impostazione**: campo in `Settings` + `defaults` (`settings.svelte.ts`; il merge con i default copre gli utenti esistenti) → UI in `Settings.svelte` con `Toggle`/input + `saveSettings()` → eventuale passo in `Onboarding.svelte`. Viaggia già nel backup (`exportBackup(settings)`).
- **Nuova route**: componente in `src/routes/`, voce in `routes` di `App.svelte`, link (tab in `tabs` o voce in `More.svelte`), `PageHeader` con `fallback`. Parametri via `route.params` (la pagina si ricrea al cambio query).
- **Nuova opzione di catalogo**: aggiungere un `Opt` in `catalog.ts`; gli id sono persistiti: non rinominarli (eventualmente mappare in lettura). Per i trigger considerare `TRIGGER_RULES` in `migraineBuddy.ts`.
- **Nuovo campo persistito**: tipo opzionale in `types.ts` (i record vecchi non lo hanno); per `Episode` aggiungere il default in `newEpisode()` (usato anche da `importBackup`). Nessuna migrazione IndexedDB serve finché non cambiano gli store.
- **Nuovo test**: `src/**/*.test.ts`, ambiente `node` (niente DOM/IndexedDB): testare funzioni pure (`clinic`, `advisor/*`, `migraineBuddy`). Moduli `.svelte.ts` con $state funzionano se non toccano `window`.
- **Gotcha**: ambiente Windows (Git Bash + PowerShell 5.1; file con CRLF/LF, avvisi git innocui); nello strumento Bash gli heredoc con apostrofi (frequenti in italiano) si rompono → usare Edit/Write; testi UI con apostrofo tipografico `’` dentro stringhe `'...'`; date sempre come chiavi locali `dayKey()` (mai `toISOString().slice(0,10)`); `$state.snapshot` prima di IndexedDB; il popup Google deve partire dentro un gesto utente.

---

## 6. Stato attuale e lavori aperti (2026-11-24)

### Lavoro non committato (working tree su `dd95116`)
`git diff --stat`: 12 file, +253/−37; non tracciati: `public/sw-notify.js`, `CLAUDE.md`, CSV Migraine Buddy.
- **Movimento a 4 livelli** (`types.ts` `Activity`, `catalog.ts` `CHECKIN.activity` + `activityOf`, `CheckIn.svelte` riga con hint): feature `no_exercise` (dose 1/0.5/0), `exercise_intensa`, `exercise_intensa_ieri` (forecast); `no_exercise` e `exercise_intensa` in `LIT`/`personalTriggers`/`riskFactorsToday`; `coach.ts` `ACTIONS.exercise_intensa`, `FACTOR_ORDER`, `MODIFIABLE`, goal `movimento` (moderata/intensa). Test in `ml.test.ts` (`describe('movimento')`, 4 test).
- **Pannello info** nel check-in (pulsante ⓘ): quando (mattino sonno + prodromi, sera il resto) e come compilarlo.
- **Promemoria mattino + sera**: `morningReminderEnabled/Time/lastMorningReminderDate` (default 08:30, off), finestra 4 h, solo se manca il sonno; sera con messaggio contestuale `eveningMessage()`. Settings: nuova card "Promemoria"; Onboarding: "Sì" attiva entrambi e chiede le due ore.
- **`public/sw-notify.js`** + `importScripts` in `vite.config.ts`: tocco sulla notifica apre/porta in primo piano l'app.

- **Causalità inversa + ore per campo** (`CheckIn.times`, `exposureOf`, `CONSEQUENCE_PRONE`), **chip nuovi** `sleepIrregular` / `screens` (feature, LIT, coach `ACTIONS.sleep_irregolare`, `screens` e `sleep_irregolare` in `MODIFIABLE`, goal `sonno` include `sleep_irregolare` e richiede orari regolari), regola `flagOf` per i chip non toccati, **check-in dei giorni passati** dal Calendario, `.gitignore` con `*.csv`, `.env`, `.env.*`. Test in `ml.test.ts` (`causalita inversa`, `chip sì/no e fattori nuovi`); la fixture `movimento` ora ha l'attacco alle 21:00 (dopo il check-in delle 20:00), altrimenti il movimento dei giorni d'attacco sarebbe giustamente non noto.
- **Drive**: `driveSync.ts` + test; stato persistito `pendingSince/syncedHash/account`, backup all'avvio solo se i dati sono cambiati, `login_hint` con `prompt: ''`, banner Home solo dopo 48 h non sincronizzate.
- **Report/profilo**: `profile.ts`, `Profile` facoltativo in `meta.profile`/`BackupFile.profile`, nuove funzioni in `clinic.ts`/`analytics.ts`, sezioni nuove del report (§3), Settings → Profilo, `report.test.ts`.

### Problemi aperti / idee
- **(a) Causalità inversa** — RISOLTO 2026-11-24 (vedi §4). Residuo: un attacco notturno che sveglia può ancora far segnare "poco sonno" (il sonno non è escluso); i prodromi registrati a posteriori (dopo la fine dell'attacco, anche dal Calendario) non sono riconosciuti come `duringAttack`, perché `duringAttack` usa `at`.
- **(b)** Le notifiche funzionano solo con app aperta o usata di recente: niente Web Push né server. La Home mostra comunque tutto in-app.
- **(c)** `reminders.ts` non ha test (`eveningMessage`, finestre orarie, una-volta-al-giorno).
- **(d)** Utenti esistenti: `morningReminderEnabled` resta `false` (default) anche se avevano attivo il serale; serve attivarlo a mano in Impostazioni (o una migrazione).
- **(e)** Check-in dei giorni passati — RISOLTO 2026-11-24: dal foglio del giorno nel Calendario (oggi e passato, non futuro).
- **(f)** I fattori nel report usano tutta la storia, non solo il periodo del report.
- **Dati utente**: `MigraineBuddy_20260819_20261117_*.csv` nella radice è un'esportazione reale dell'utente: **non committarlo mai** (ora `.gitignore` esclude `*.csv`, `.env`, `.env.*`; usare comunque `git add` con percorsi espliciti).

---

## 7. Come mantenere questo file
Chi cambia architettura, modello dati, feature/prior del modello, flussi o apre/chiude un problema aggiorna la sezione relativa **e la data in cima**, nello stesso commit della modifica. Restare fattuali e sintetici: elenchi e tabelle, niente codice copiato oltre alle firme.
