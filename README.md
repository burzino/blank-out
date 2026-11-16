# Blank Out — diario del mal di testa

PWA in Svelte 5 per registrare i mal di testa in 2 tocchi, anche durante un attacco. Funziona offline, si installa sul telefono e tiene tutti i dati **solo sul dispositivo** (IndexedDB): niente server, niente account, niente tracciamento.

## Funzioni
- **Log rapido**: "Ho mal di testa" → intensità → salvato. Dettagli facoltativi dopo (zone, qualità, sintomi, aura, trigger, farmaci con efficacia a 2 h, disabilità, note). "Come l'ultima volta" copia il quadro dell'episodio precedente.
- **Episodio in corso** con "È finito", farmaci in un tocco, domanda sull'efficacia dopo 2 h.
- **Calendario** mensile con intensità, farmaci, aura e ciclo.
- **Statistiche**: giorni di cefalea/emicrania al mese, farmaci per classe, efficacia, trigger, correlazione col ciclo, esito delle profilassi.
- **Avvisi clinici**: uso eccessivo di farmaci (MOH, 30 giorni mobili, con preavviso), cefalea cronica, segnali d'allarme SNOOP4 con chiamata al 112.
- **Classificazione indicativa ICHD-3** per episodio (non è una diagnosi).
- **Questionari** MIDAS e HIT-6 con storico.
- **Profilassi**: terapie, effetti collaterali, valutazione responder (≥50%).
- **Report di 1 pagina per il neurologo** (stampa / PDF).
- **Backup** JSON (export/import) ed export CSV per Excel.
- Tema scuro caldo pensato per la fotofobia, testo grande, vibrazione, promemoria serale.

Le soglie cliniche sono tutte in `src/lib/catalog.ts` (`THRESHOLDS`); la logica in `src/lib/clinic.ts` (coperta dai test).

## Sviluppo
```bash
npm install
npm run dev      # sviluppo
npm test         # test della logica clinica
npm run build    # build di produzione in dist/
```

## Deploy
Il workflow `.github/workflows/deploy.yml` pubblica su **GitHub Pages** a ogni push su `main`: https://burzi.eu/blank-out/
Nel repository: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
L'app usa percorsi relativi e routing con hash, quindi funziona in qualsiasi sottocartella (`utente.github.io/repo/`).

## Avvertenza
Blank Out non è un dispositivo medico e non sostituisce il parere del medico.
