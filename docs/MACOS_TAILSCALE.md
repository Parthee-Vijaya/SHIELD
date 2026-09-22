# Lokal fremvisning med macOS og Tailscale

Denne vejledning dokumenterer den lokale SHIELD-installation, der blev genetableret og kontrolleret den 22. september 2026. To bruger-LaunchAgents holder backend og frontend kørende. Tailscale Serve giver privat HTTPS-adgang til den samme installation fra andre tilladte enheder på netværket.

## Forbindelsen

```text
Browser på en tilladt Tailscale-enhed
  → https://<Mac'ens fulde Tailscale-DNS-navn>:9443/
  → Tailscale Serve
  → http://127.0.0.1:8090 (frontend og API-proxy)
  → http://127.0.0.1:8001 (backend og sagsdatabase)
```

Mac'en skal være tændt og vågen, og brugeren med LaunchAgents skal være logget ind. Begge applikationsservere lytter på `127.0.0.1`. Tailscale Serve videresender trafikken til frontend, som også håndterer `/api`, `/readyz`, `/health` og `/metrics`.

Installationen bruger udviklingsidentiteten **Lokal bruger**. Besøgende deler dermed identitet og rettigheder i appen. Tailscale begrænser netværksadgangen, men giver ikke individuelle brugeridentiteter i SHIELD. Organisationslogin beskrives i [Entra ID-vejledningen](ENTRA_ID_SETUP.md).

## Opstart uafhængigt af terminalen

Den lokale installation har følgende filer. De indeholder absolutte stier til den konkrete Mac og ligger uden for Git:

| Fil eller mappe | Funktion |
| --- | --- |
| `~/Library/LaunchAgents/dk.parthee.shield.backend.plist` | Starter Python og `main.py`. |
| `~/Library/LaunchAgents/dk.parthee.shield.frontend.plist` | Starter Node og `frontend/serve_prod.js`. |
| `~/Library/Application Support/SHIELD/runtime/venv/` | Python-miljø med backendens afhængigheder. |
| `~/Library/Logs/SHIELD/` | Separate stdout- og stderr-logfiler for begge tjenester. |

Ved genskabelse skal begge plist-filer bruge følgende indstillinger:

| Nøgle | Værdi |
| --- | --- |
| `Label` | Henholdsvis `dk.parthee.shield.backend` og `dk.parthee.shield.frontend`. |
| `WorkingDirectory` | Den absolutte sti til SHIELD-repositoryet. |
| `ProgramArguments` | Backend: Python-miljøets `bin/python` og den absolutte sti til `main.py`. Frontend: den installerede Node-binær og den absolutte sti til `frontend/serve_prod.js`. Hvert argument skal være et selvstændigt array-element. |
| `RunAtLoad` | `true` |
| `KeepAlive` | `true` |
| `ThrottleInterval` | `15` sekunder |
| `ExitTimeOut` | `30` sekunder |
| `StandardOutPath` / `StandardErrorPath` | Absolutte stier til henholdsvis `backend.stdout.log`, `backend.stderr.log`, `frontend.stdout.log` og `frontend.stderr.log` i logmappen. |

`EnvironmentVariables` i backendens plist skal sætte `API_HOST=127.0.0.1`, `API_PORT=8001`, `API_RELOAD=false`, `PYTHONUNBUFFERED=1` og `TYR_LOG_DIR` til den absolutte logmappe. Brug den eksisterende `DATABASE_URL` og de udviklingsindstillinger, som er beskrevet i [lokal opstart](../README.md#lokal-opstart). Den genetablerede installation bruger `sqlite:///./data/shield-review.db`; en anden databaseadresse åbner en anden samling sager. Tag en konsistent databasebackup før flytning eller ændring af adressen.

Frontendens miljø skal sætte `FRONTEND_HOST=127.0.0.1`, `FRONTEND_PORT=8090` og `API_BACKEND=http://127.0.0.1:8001`. Begge tjenester skal have en eksplicit `PATH`, der indeholder den installerede Node-binær, fordi backend også starter Node til AI-kald. Den midlertidige lokale modelforbindelse kræver desuden `SHIELD_ENABLE_CODEX_LOCAL=true` og en allerede indlogget CLI på denne sti; se [AI-opsætningen](AI_GATEWAY.md).

LaunchAgents indlæser ikke terminalens shellprofil. Brug absolutte stier, og opret logmappen før start. Opbevar nøgler i de eksisterende lokale miljøfiler; kopier dem ikke ind i plist-filerne. Python-runtime placeres uden for Dokumenter/iCloud-mapper. En ny runtime kan oprettes med Python 3.11 og projektets `requirements.txt`; ved genetableringen blev det eksisterende afhængighedsmiljø bevaret.

Valider og indlæs færdigkonfigurerede plist-filer, når ingen anden SHIELD-proces bruger portene:

```bash
plutil -lint "$HOME/Library/LaunchAgents/dk.parthee.shield.backend.plist"
plutil -lint "$HOME/Library/LaunchAgents/dk.parthee.shield.frontend.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/dk.parthee.shield.backend.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/dk.parthee.shield.frontend.plist"
```

Brug ikke de ældre `start_tyr.sh`-/`start_backend.sh`-/`start_frontend.sh`-scripts samtidig med disse LaunchAgents. De starter separate processer og bruger ældre runtime- og logstier.

## Privat Tailscale-rute

Kontrollér først de eksisterende ruter, så en anden tjenestes port ikke erstattes:

```bash
tailscale serve status
```

Når port 9443 er ledig eller allerede tilhører denne SHIELD-installation:

```bash
tailscale serve --bg --https=9443 http://127.0.0.1:8090
tailscale serve status
```

På macOS kan CLI'en ligge på `/Applications/Tailscale.app/Contents/MacOS/Tailscale`, hvis `tailscale` ikke findes på `PATH`. Brug hele HTTPS-adressen, som statuskommandoen viser, inklusive `:9443`. Opsætningen bruger Serve med privat netværksadgang; der er ikke oprettet en offentlig Funnel-rute. Andre eksisterende Serve-ruter skal bevares.

## Kontrol og genstart

```bash
launchctl print "gui/$(id -u)/dk.parthee.shield.backend"
launchctl print "gui/$(id -u)/dk.parthee.shield.frontend"
curl --fail --max-time 5 http://127.0.0.1:8001/readyz
curl --fail --max-time 5 http://127.0.0.1:8090/readyz
```

Åbn derefter Tailscale-adressen i browseren, åbn en eksisterende sag og hent en rapport. Kontrollér også `/readyz` på den fulde HTTPS-adresse. En klar `/readyz` kontrollerer database, vurderingslagring og skabelon; den beviser ikke, at et nyt GPT- eller JEV-kald lykkes.

En kontrolleret genstart af en indlæst tjeneste udføres med:

```bash
launchctl kickstart -k "gui/$(id -u)/dk.parthee.shield.backend"
launchctl kickstart -k "gui/$(id -u)/dk.parthee.shield.frontend"
```

Genstart af backend afbryder eventuelle igangværende AI-kørsler. Vent til den er klar, og gentag forbindelseskontrollen.

## Fejl fundet og afhjulpet den 22. september 2026

- **HTTP 502 gennem Tailscale:** Serve-ruten var korrekt, men både frontend og backend var stoppet. De tidligere processer havde ingen automatisk genstart. Årsagen til selve stoppet kunne ikke fastslås.
- **Backend blev hængende ved opstart under launchd:** Python blokerede ved en filåbning under initialisering, før applikationen blev indlæst. Flytning af runtime fra Dokumenter til Application Support fik opstarten til at lykkes. En bestemt macOS-rettighedsfejl blev ikke bevist.
- **Verificeret resultat:** Lokal og ekstern `/readyz` meldte klar. Krisp-sagen blev åbnet via HTTPS uden browserkonsolfejl, og en Word-eksport blev hentet og kontrolleret. Frontend blev afsluttet kontrolleret og genstartede automatisk med nyt proces-ID; Tailscale-adgangen fungerede derefter igen.

Denne dokumentation indeholder ingen sagsdatabase, uploads, miljøfiler eller maskinens private adgangsoplysninger. En ny kloning kræver sin egen runtime, konfiguration og eventuel særskilt dataoverførsel.
