# SHIELD — handoff til næste AI-agent

**Opdateret 25. september 2026 · produktversion v0.10.1.** Dette er en praktisk overdragelse af den eksisterende løsning, ikke en opgave om at bygge den på ny. Læs [AGENTS.md](AGENTS.md) for Parthees arbejdspræferencer og produktkrav.

## Fortsæt herfra

Repository: `Parthee-Vijaya/SHIELD` (privat). Arbejdsbranch ved overdragelsen: **`codex/technical-run-overview`**. GitHubs standardbranch er `main`; den har ikke automatisk denne branches seneste ændringer. Brug den angivne branch, og verificér seneste commit med Git. Der oprettes ikke automatisk PR eller merge som del af denne handoff.

På Parthees Mac bruges den eksisterende checkout:

```sh
cd /Users/parthee/Desktop/Claude/projekter/aktive/SHIELD
git status --short --branch
git fetch origin --prune
git log -5 --oneline
git rev-list --left-right --count HEAD...@{u}
npm run version:check
```

På en anden maskine, efter at adgang til det private repository er etableret:

```sh
git clone --branch codex/technical-run-overview https://github.com/Parthee-Vijaya/SHIELD.git
cd SHIELD
```

Læs derefter `AGENTS.md`, denne fil, `README.md`, `DESIGN.md` og den relevante drifts-/AI-vejledning. Kør ikke `git checkout`, `pull`, migrationer eller oprydning over lokale ændringer uden først at vurdere dem.

Den aktuelle overdragelsesopgave er at committe og pushe den færdige kode med instruktionerne. Start ikke en ny feature, ny modelanalyse, Vercel-deploy eller flytning af data alene fordi noget står som et muligt næste skridt her.

## Hvad Parthee bygger

SHIELD skal være et brugbart kommunalt arbejdsrum til **AI-løsninger og IT-løsninger med AI**. En bruger beskriver behovet og anvendelsen, vedlægger leverandørpræsentation, databehandleraftale, sikkerheds-/revisionsmateriale og links, gennemgår AI-forslag og får et dokumenteret grundlag til jura, DPO og ansvarlig godkender.

Konsekvensanalyse og risikovurdering følger den versionslåste Datatilsynet-struktur, gemmes under sagen og kan læses i løsningen samt downloades som Word/Excel. Dokumenteret viden, åbne afklaringer, mangler før godkendelse og anbefalinger skal kunne skelnes hurtigt, også af en leder uden juridisk baggrund.

GPT skriver og strukturerer. JEV kontrollerer udsagn mod medsendte kilder. Reglerne beregner grundstatus/risici. Mennesker gennemgår og beslutter. Ingen af de automatiske lag beviser juridisk korrekthed eller godkendelse.

Parthee har specifikt bedt om at bevare funktioner under redesign, samle overlappende funktioner, bruge kommunale termer og tydeligt vise systemnavn, organisation, ansvar, version og AI-handlinger. Brug ikke “test” og “eksempel” som unødige labels på almindelige kommunale arbejdssager, men skjul heller ikke testantagelser eller opfind en kommunal godkendelse.

## Senest leveret

| Version | Indhold |
| --- | --- |
| 0.9.1 | Lyst redesign inden for SHIELDs varme palette og Geist. Login, startside, søgning, procesoverblik, sagsfaner, formularer og læsevenlige vurderinger. Ingen ripple eller dekorativ animation. |
| 0.10.0 | Kompakt logo/navn/version; én profilmenu under Parthee med søgning, tema, øvrige værktøjer, guide og session. Forsidens introduktion er udfoldet. Historik viser seneste version pr. sag og type med foldbare ældre versioner og ansvar/tid. Kommunal behovsbeskrivelse kan vedlægges på første oprettelsestrin. |
| 0.10.1 | Repareret ENOENT ved ekstern åbning: frontend-build lå under `build 3`, mens serveren forventede `build`. Serverkode, afhængigheder og aktive builds ligger nu uden for Desktop/iCloud. Komplette releases publiceres atomisk, og gamle hashede filer bevares til åbne faner. |

Der er ingen migration i denne ændringsrunde. `needs_description` er en dokumentkategori i den eksisterende dokumentmodel. Dens oprindelse følger analyse, kildegrundlag og eksport: kommunens ønsker er ikke dokumentation for leverandørens faktiske implementering.

Historikgruppering bruger sag/type eller eksplicit versionsrelation; to vurderinger med samme titel er ikke automatisk samme sag. Ukendt igangsættelsestid og aktør vises som ikke registreret. Rapportversioner er ikke det samme som appens produktversion.

## Skills til næste agent

Læs relevante skill-instruktioner før brug og nævn kort anvendelsen for Parthee. Navne nedenfor er fra den tilgængelige Codex-opsætning; andre værter kan bruge tilsvarende værktøjer. Kopiér ikke hele skill-pakker ind i Git, og installer ikke noget alene for at gennemføre et simpelt check.

| Opgave | Skill / arbejdsgang |
| --- | --- |
| Genoptag projekt | `load-project`: kanonisk workspace, projektinstruktioner, Git/upstream og relevant live health. På denne Mac: `~/.codex/skills/load-project/SKILL.md`. |
| Overdrag/afslut session | `shutdown-project`: verificér Git, dokumentér ændringer, begrænsninger og næste skridt. `~/.codex/skills/shutdown-project/SKILL.md`. Dette betyder ikke stop af appen. |
| Find en fejl | `investigate` til rodårsag; lav reproduktion før rettelse. ENOENT kræver kontrol af faktisk filsti og HTTP, ikke kun `/readyz`. |
| UI og brugerflow | `design-review` og `qa` ved passende omfang; `qa-only` ved ren undersøgelse. Følg `DESIGN.md`, test faktisk UI, tastatur og mobil. Brug værtens tilladte browsermetode; i denne session blev Codex' CUA brugt. |
| Ændring af AI-flow | `vercel:ai-sdk` og `vercel:ai-gateway`; ved relevant persistence `vercel:ai-generation-persistence`. Læs også lokale kontrakter og tests. Ingen modelsubstitution uden eksplicit valg og korrekt proveniens. |
| Nye bilag/skabeloner | `pdf:pdf`, `documents:documents`, `presentations:Presentations` eller `spreadsheets:Spreadsheets` efter filtype. Bevar originaler; inspicér/render relevante artefakter. |
| Reel Vercel-opsætning | `vercel:deployments-cicd` / `vercel:vercel-cli`, og storage/auth efter behov. Kun ved en konkret deploymentopgave. |
| Commit/release | `review` eller relevant lokal review; `ship` hvis dens fulde releaseforløb ønskes. Opret ikke merge/deploy/PR alene fordi en skill beskriver det som et senere trin. |

Brugerens konkrete instruktioner går foran vejledende lokale konventioner; værtens system- og sikkerhedsregler gælder fortsat. Når en skill kræver godkendelse, forklar præcis hvilken regel og hvorfor. En manglende valgfri skill er ikke grund til at opgive arbejdet.

## Kørende installation på Parthees Mac

| Del | Verificeret placering / port |
| --- | --- |
| Kanonisk kode | `/Users/parthee/Desktop/Claude/projekter/aktive/SHIELD` |
| Lokal build-/testkopi | `~/.cache/shield-redesign-runtime` (hydraterede filer, ikke kanonisk kildekode) |
| Backend | `http://127.0.0.1:8001`, LaunchAgent `dk.parthee.shield.backend` |
| Frontend + API-proxy | `http://127.0.0.1:8090`, LaunchAgent `dk.parthee.shield.frontend` |
| Backend-venv | `~/Library/Application Support/SHIELD/runtime/venv` |
| Frontend-server | `~/Library/Application Support/SHIELD/runtime/frontend-server/serve_prod.js` med lokale afhængigheder |
| Aktiv frontend | `~/Library/Application Support/SHIELD/frontend/current` → komplet mappe under `releases/` |
| Lokal sagsdatabase | `data/shield-review.db`, eksisterende konfiguration skal bevares |
| Lokal dokumentbank | `data/document-bank/` og relateret konfigureret lager, udeladt fra Git |
| Maskinens konfiguration | `~/Library/LaunchAgents/dk.parthee.shield.*.plist`, udeladt fra Git |

Tailscale Serve har den eksisterende private HTTPS-rute på port **9443** til frontendens **8090**. Find den konkrete adresse med `tailscale serve status`; bevar andre ruter. Mac'en skal være vågen, brugeren logget ind og den besøgende enhed have netværksadgang. Dette er ikke en offentligt deployet SaaS.

**Lokal identitet:** Parthee er backendens fælles udviklingsidentitet. Loginvisningen er ikke et personligt kommunalt login. Entra ID-understøttelse findes, men reel tenant/roller og SaaS-drift skal opsættes og verificeres særskilt.

Fuld runbook: [docs/MACOS_TAILSCALE.md](docs/MACOS_TAILSCALE.md). Frontendens `FRONTEND_BUILD_DIR` peger på den stabile `current`. `frontend/build` i repositoryet må ikke være et symlink til denne aktive release. En tidligere midlertidig symlink er fjernet.

Build i en separat lokal outputmappe, efter at kanoniske kildefiler er synkroniseret. Kopiér aldrig ukritisk cachekoden tilbage over nyere arbejde. Ved iCloud-pladsholdere: undgå at sidde fast i gentagne filoperationer, og bevar alle originale ændringer.

```sh
# Fra den synkroniserede lokale arbejdskopi
npm run version:check
npm run build:frontend
npm run deploy:frontend -- /absolut/sti/til/frontend/build
```

Publicering ændrer kun frontendrelease. Ved ændring af `serve_prod.js` skal den lokale serverkopi opdateres og frontend-LaunchAgent genstartes. Ved plist-ændring skal LaunchAgent genindlæses; `kickstart` læser ikke nyt plist-miljø. Start ikke de gamle `start_tyr.sh`-scripts parallelt med LaunchAgents.

## Ny maskine og data

Følg [README — lokal opstart](README.md#lokal-opstart) og [AI-opsætning](docs/AI_GATEWAY.md). Der kræves Node 22.18+ og et Python-miljø med `requirements.txt`. Koden er et npm-workspace med React/CRA og FastAPI; det er ikke en Next.js-app.

Private sager, katalogimport, uploads, miljøfiler, maskinspecifikke LaunchAgents og CLI-login følger **ikke** med en kloning. En tom lokal database er derfor forventelig på en ny maskine. Overfør kun nødvendige data særskilt efter konkret autorisation; brug aldrig Git til det. Originale Gentofte-bilag, lokale Excel-kataloger og modelkildepakker må ikke inkluderes i repositoryet.

De tidligere Vercel-designpreviews er separate præsentationer. At frontend kan vises på Vercel beviser ikke, at FastAPI, database, uploads, baggrundsarbejde, modelkald og organisationslogin fungerer dér. En rigtig hostingopgave kræver et særskilt vedvarende data- og backendsetup.

## AI, modeller og kvalitet

- Standardmodel til materialeanalyse og rapportudkast: `openai/gpt-5.5` via serverens AI Gateway. Evaluator: `typesafe-ai/jev`.
- `AI_GATEWAY_API_KEY` opbevares i lokal ignoreret `.env.local`. Brugeren indtaster den lokalt. Nøglen må aldrig læses, udskrives, logges eller committes.
- `npm run ai:example` og `npm run ai:jev-example` er rigtige netværks-/modelkald med muligt forbrug. Kør dem ved en autoriseret forbindelsestest, ikke som en skjult del af docs/commit.
- Parthee har tilladt midlertidig afprøvning via GPT-5.6 Sol eller GPT-6 Astra i agentmiljøet. Det er ikke en automatisk erstatning for Gateway eller JEV, og en anden agent må ikke attestere, at en model kørte, hvis det ikke skete.
- Manuel rapportimport og backendens valgfrie lokale tekstassistent er forskellige veje. `SHIELD_ENABLE_CODEX_LOCAL=true` aktiverer den lokale CLI-vej for bestemte juridiske assistentfunktioner; det gør ikke alle knapper til et Codex-backend. Se README og AI-runbook før ændring.
- Teknisk revisionsspor skal bevare faktisk provider/model, kildebelæg og kontrolresultater, selv om rapportens læsevenlige del kun viser relevant modelnavn.
- JEVs tærskel er ikke kalibreret som juridisk godkendelse. Planlagt kontrol, testantagelse, leverandørudsagn og gennemført lokal foranstaltning er forskellige ting.
- Der er **ikke** kørt nye live GPT/JEV-analyser i v0.9.1–v0.10.1-runderne. Testsucces og readiness må ikke beskrives som verificeret aktuel modeladgang.

## Kontrolgrundlag ved overdragelsen

| Kontrol | Senest verificeret |
| --- | --- |
| Frontend | 438 tests i 44 suites bestået for v0.10.0-produktændringerne. |
| Backend | 897 tests bestået med eksternt netværk blokeret, separat testdata. |
| AI Gateway | 49 tests og TypeScript-kontrol bestået; kontrollerede modelresultater, ikke livekald. |
| Frontendserver og publicering | 10 tests bestået for v0.10.1: index, proxy, kontrolleret 404/503, invalid build, hashede assets, sourcemaps og atomisk versionsskift. |
| Produktionsbuild/version | v0.10.1 build, `version:check` og diff-kontrol bestået. |
| Faktisk drift | Tailscale: alle 70 manifestfiler HTTP 200 med korrekte checksums; direkte ruter og readiness OK. Browser viste v0.10.1 og Krisp-sagens vurderinger. Frontendgenstart verificeret. |

Ved selve commit-/handoff-kontrollen bestod yderligere 81 målrettede frontendtests, 10 server-/publiceringstests, 49 Gateway-tests og AI-typekontrollen. Alle 63 ændrede kode-/pakkefiler matchede den verificerede lokale testkopi byte-for-byte. Der blev ikke kørt live modelkald.

Disse er daterede resultater, ikke evige garantier. [QA v0.10.0](docs/QA_V010_MENU_HISTORY_NEEDS.md), [QA redesign](docs/QA_V091_LIGHT_REDESIGN.md) og [driftsnoterne](docs/MACOS_TAILSCALE.md) beskriver omfanget. UI er også prøvet ved 320/390 px. Behovsupload er testet i separat SQLite-lager og localhost:8093/8003; de midlertidige servere er stoppet.

Kommandoer til relevante kontroller fra en opsat arbejdskopi:

```sh
npm run version:check
CI=true npm run test:frontend -- --watchAll=false --runInBand
npm run ai:typecheck
npm run ai:test
npm run test:frontend-server
# Brug separat testdatabase/miljø; ikke den aktive fremvisnings konfiguration:
python -m pytest tests/
```

Den generelle Python-mypy-kørsel har kendte baselinefejl, og ældre frontendkode har build-lintadvarsler. Hæv ikke dette til en påstand om fejlfri samlet lint/typecheck. Undgå gentagelse af hele testpakken, når kun dokumentation er ændret; kør de kontroller ændringen kræver.

## Før næste produktændring

1. Bekræft ønsket næste opgave og live tilstand. `git status` og dokumentationen skal stemme med runtime; start ikke en gammel checkout.
2. Kontrollér hovedarbejdsgangen: login → sag/materiale → kildegennemgang → vurdering → læsevenlig udgave → eksport/historik. Brug isolerede testdata ved oprettelse eller AI-kald.
3. Bevar organisation, navngivet ansvar og ukendte metadata sandfærdigt. Historiske data må ikke omskrives for at se pænere ud.
4. Ved funktionelle ændringer: relevant regression, produktversionsløft, build og faktisk browserkontrol. Tjek også Tailscale, hvis det er den adresse Parthee bruger.
5. Ved afslutning: dokumentér resultat, hvad der ikke blev afprøvet, branch/commit/push-status og eventuelle lokale rester. Bevar den kørende app.

`data/news_fallback.json` og `data/ticker_fallback.json` kan være ændret af lokale baggrundsopdateringer. De er genererede cacheændringer og skal ikke blandes ind i produkt-/handoff-committet. Bevar dem lokalt, hvis de ikke udtrykkeligt indgår i opgaven.

## Startbesked til en ny agent

> Fortsæt arbejdet på Parthee-Vijaya/SHIELD, branch codex/technical-run-overview. Læs AGENTS.md og HANDOFF.md først, og verificér Git og runtime før ændringer. Bevar den eksisterende løsning og dens data. Kommunikér på dansk, arbejd autonomt inden for opgaven, brug relevante skills og kontrollér resultatet i den faktiske brugerflade. Produktet samler dokumentation og udarbejder kommunale konsekvensanalyser og risikovurderinger for AI-løsninger; GPT, JEV og menneskelig godkendelse skal holdes tydeligt adskilt. Giv kort status og fortsæt derefter med min næste konkrete anmodning.
