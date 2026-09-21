# Changelog — Tyr (tidligere "Project Judge Dredd")

Alle bemærkelsesværdige ændringer til dette projekt dokumenteres her.

Formatet er baseret på [Keep a Changelog](https://keepachangelog.com/da/1.0.0/), og projektet følger [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0-alpha.18] - 2026-05-08 — Tyr-rebrand + Northern Modern design system

### Ændret (Changed)
- **Brand-navn skiftet til "Tyr"** (tidligere "Forseti" i alpha.15-17). Tyr er den nordiske retsguds-figur (Týr — gud for lov, ed, retfærdighed). Tiwaz-rune (ᛏ) som signatur-mærke. Passer ind i Mac Studio-konstellationen Bifrost / Odin / Saga / Skynet. Ord-skift på tværs af UI, docs, README, CHANGELOG, YAML-metadata, schema, manifest og PWA-strenge.
- **Komplet design system v2 (Northern Modern)** — droppet Design C ("editorial workspace" cream-paper). Ny direction: skandinavisk civic-tech sobriety (Snøhetta-rådhusgang). Off-white #f5f4ef, kongelig blå #0d2e54 primær, bronze #b08a4a signatur. **IBM Plex Sans + Mono + Serif italic** erstatter Lora + Source Serif Pro + Inter + JetBrains Mono. Hairline 1px-borders, lette varmlys-skygger, ingen glassmorphism.
- **Data-overview-pattern** — hver hovedside får clean drift-overblik ved bunden af canvas: 4-stat grid + ledger-tabel (seneste vurderinger) + citat-friskhed-panel + 5-cell status-bar. Sagsbehandlere kan altid se "hvor står vi" uden at skifte side.
- `theme.js` rewrite: ny palette + Plex-fonts + tighter motion-tokens (180ms ease-out default).
- `frontend/public/index.html` + `manifest.json` PWA-strenge → Tyr.

### Tilføjet (Added)
- **`DESIGN.md`** (256 linjer) — komplet design system med brand, typography, color, spacing, layout, motion, component patterns, anti-slop check, decisions log.
- `CLAUDE.md` peger på DESIGN.md som canonical reference.

## [3.0.0-alpha.15] - 2026-05-07 — Forseti-rebrand + LM Studio system-status

### Ændret (Changed)
- **Brand-navn skiftet til "Forseti"** (tidligere "Hjemmel" i alpha.13/14). Forseti var den oprindelige nordiske retsguds-pendant. (Skiftet senere til Tyr i alpha.18.) Ord-skift på tværs af UI, docs, README, CHANGELOG, YAML-metadata, schema og manifest. Den juridiske term "hjemmel" (med lille begyndelsesbogstav) er bevaret i fritekst da det stadig er korrekt fagterminologi.
- **`/api/compliance/test-llm` understøtter nu LM Studio som første provider** (var tidligere kun Azure → OpenAI). Probe-rækkefølgen matcher v3 signal_extractor: LM Studio → Azure → OpenAI. Hits `/v1/chat/completions` direkte med `httpx` og 5s timeout. LLM-feltet i forsidens system-status lyser derfor grønt når LM Studio kører lokalt — også uden Azure/OpenAI-nøgler.

### Fjernet (Removed)
- Brand-strenge "Project Judge Dredd" / "Hjemmel" i `frontend/public/index.html` + `manifest.json` (PWA-titel, beskrivelse, short_name).

## [3.0.0-alpha.13] - 2026-05-07 — Forside-rebrand + M1.5 + jurist-pakke

### Tilføjet (Added)
- **Predikat-extraction fra dokument (M1.5)** — `signal_extractor.extract_predicates_for_rule()` udtrækker også predikat-svar fra dokumenttekst, ikke kun trigger-signaler. Dokument-upload alene giver nu fuld BETINGET-GO/NO-GO uden manuel predikat-udfyldelse. Sample-test: 26 predikater udtrukket fra Borgerassistent-DOCX.
- **6 sektorlov-templates** klar til jurist-interview: 3 servicelov (§ 11, § 50, § 102), 2 beskæftigelseslov (§ 11, § 27), 1 sundhedslov (§ 23). Alle prefixet `_template_` så `RuleLoader` skipper dem indtil aktivering.
- **Jurist-pakke** under `docs/`: `JURIST_INTERVIEW.md` (struktureret 30-45 min interview-guide med 4 spørgsmål per paragraf), `JURIST_BRIEFING.md` (5 min onboarding der forklarer Hjemmel + citation-verifier).

### Ændret (Changed)
- **Forside rebranded til "Hjemmel"** — droppet "Project Judge Dredd"-branding på forsiden. Hero-tekst, badge og CTAs reflekterer nu Hjemmel-positionering. (Skiftet senere til Forseti i alpha.15, Tyr i alpha.18.)
- `rules/sektorlove/README.md` udvidet med aktivering-workflow + skema-krav.

## [3.0.0-alpha.12] - 2026-05-07 — M2 sager-kanban + M3 citation-verifier

### Tilføjet (Added)
- **M2 Workflow state-machine for sager**:
  - `Case` + `CaseTransition` SQLAlchemy-modeller med 6 statuses (kladde / vurderet / remediation / godkendt / idriftsat / arkiveret)
  - 5 nye endpoints: `POST /api/v3/cases`, `GET /api/v3/cases`, `GET /api/v3/cases/{id}`, `POST /api/v3/cases/{id}/transition`, `GET /api/v3/cases/meta/statuses`
  - `SagerPage.jsx` — kanban-side i Design C med drag-drop mellem kolonner, "+ Ny sag"-modal, status-pille per kort
  - Auto-transitions: kladde→vurderet ved første assessment, vurderet→remediation ved BETINGET-GO/NO-GO
- **M3 Citation-verifier**:
  - `RuleFreshness`-tabel + `citation_verifier.py` service der dagligt verificerer hver regels `kilde.citat` mod `kilde.url` (httpx + normalize)
  - APScheduler-job kl. 04:00 (efter knowledge-base-update kl. 03:00)
  - 3 nye endpoints: `GET /api/v3/law/freshness` (liste), `POST /api/v3/law/freshness/run` (manuel trigger), `GET /api/v3/law/freshness/flagged` (kompakt for frontend)
  - `LovOvervaagningPage.jsx` under Indstillinger med stat-kort + per-regel tabel
  - Warning-banner i Vurdering når triggered regel sidder på flagget citat
- Citation-verifier flagger 13/15 regler ved første run — forventet, da EUR-Lex/Retsinformation er JS-renderede SPAs. v2 kan tilføje Playwright-rendering for fuld dækning.

### Ændret (Changed)
- "AI Sager" sidebar-entry erstattet af "Sager" → `/sager`. `/ai-sager` redirecter for back-compat.

## [3.0.0-alpha.11] - 2026-05-07 — M1 Document-analyse

### Tilføjet (Added)
- **`POST /api/v3/document/analyze`** endpoint — modtager PDF/DOCX, parser via pypdf/python-docx, chunker med recursive char splitter (4000 chars / 400 overlap), kører signal-extractor per chunk, evaluerer regelmotor på merged signals.
- `src/services/document_analyzer.py` — komplet pipeline med chunk-attribution (hvilke regler udløses fra hvilken side/paragraf).
- Frontend drag-drop-zone på `/vurdering` med fil-input fallback. Result-mode viser ny "Dokument-afsnit"-sektion med chunk-til-regel-mapping.
- `tests/fixtures/documents/borgerassistent_pension.docx` test-fixture.

### Smoke-verificeret
LLM extraherede 8 signaler korrekt fra Borgerassistent-DOCX, alle 15 regler triggered, audit-log persisterer med kind=document.

## [3.0.0-alpha.10] - 2026-05-07 — 3 eksempler + foldable forklaringer

### Tilføjet (Added)
- **3 fuldt udfyldte case-eksempler** på `/vurdering`:
  - GO: Internt journalsøgning (lav-risiko søgesystem, fuld GDPR-dokumentation)
  - BETINGET-GO: Borgerassistent — pensionsansøgning (tidligere SAMPLE_PREDICATES)
  - NO-GO: Social scoring af borgere (forbudt praksis under AI Act art. 5)
- Per case: status-pille (farvekodet GO/BETINGET-GO/NO-GO), Indsæt-knap, foldable "Hvorfor?"-forklaring der underviser sagsbehandler i hvad reglerne kigger efter.

### Ændret (Changed)
- Verdict-tekst skelner nu mellem "decisions.length" (alle triggered) og "requiringDecisions" (BETINGET-GO/NO-GO med faktiske krav). Sidenotes-kolonnen viser kun citater for regler der udløser krav.
- Per aggregate-status får sagsbehandler nu specifik besked (GO: "Ingen lovartikler udløser krav"; BETINGET-GO: "X af Y lovartikler…"; NO-GO: "Forbudt praksis…").

## [3.0.0-alpha.9] - 2026-05-07 — Steps 3-5 + tech debt + sammenlign

### Tilføjet (Added)
- **Step 3 g-prefix shortcuts** — `g v` → /vurdering, `g i` → /historik, `g s` → /sager, `g h` → /, `g c` → /sammenlign. ~700ms timeout, springer over når input/textarea har fokus.
- **Step 4 Sammenlign-mode** — backend `POST /api/v3/compare` kører både legacy `ComplianceController` og v3 rule_engine på samme input; returnerer side-om-side resultat + agreement-felt. Frontend `/sammenlign`-side viser diff-grid.
- **Step 5 Sektorlove placeholder** — tomme undermapper + jurist-spec README (afventer v1.0 indhold; udfyldt i alpha.13).
- **Tech debt fixet**:
  - `apscheduler==3.11.2` til requirements.txt
  - `init_db()` flyttet ind i FastAPI lifespan
  - Legacy `ComplianceOrchestrator` + checkers initialiseres via `_safe_init()` så fresh-clone uden ANTHROPIC_API_KEY kan starte op

### Dokumentation
- `SLETNING-EVAL.md` — analyse + workflow for Kategori A backend-sletning (~4 800 linjer legacy)

## [3.0.0-alpha.8] - 2026-05-07 — Vurderingshistorik (Step 2)

### Tilføjet (Added)
- `VurderingHistorikPage.jsx` — én komponent med list-mode (`/historik`) og detail-mode (`/historik/:id`). Genbruger SidenotesColumn + design-primitives.
- Liste: Design C dokument-layout med tabel (Tidspunkt · Sag · Note · Status · Engine), filter-chips per aggregate_status, live count.
- Detail: spejler V3VurderingPage's result-mode — back-link, breadcrumb, case_id eyebrow, h1, verdict-banner, regler med inline ¹²³, sidenotes-kolonne, audit-spor.

## [3.0.0-alpha.7] - 2026-05-07 — Design C global rebrand + nav-konsolidering

### Ændret (Changed)
- **Design C ("editorial workspace") som visuel kanon**: cream-paper `#faf8f5`, Lora body, Source Serif Pro display, Inter chrome, JetBrains Mono mono. Sidenotes-kolonne for lov-citater. Erstatter tidligere A+B-blend-plan fra alpha.5-tiden.
- **Nav-konsolidering**: 13 → 9 punkter (Forside / Vurdering / AI Sager / Viden & Research × 5 / Indstillinger). Hurtig Tjek + Compliance Control + Dashboard fjernet (redirecter til /vurdering eller /).
- `/v3-vurdering` route omdøbt til `/vurdering` som primær. Back-compat redirects fra alle gamle paths.
- Ren result-mode på Vurdering: form skjules efter Vurder-klik; case-fokuseret layout (breadcrumb + h1 fra description + verdict + regler + audit). LLM-config noise filtreres væk fra warnings.

### Tilføjet (Added)
- `SidenotesColumn.jsx` — sticky højre-kolonne med ¹²³ unicode-superscripts
- `mockups/design-d.html` — A+C blend-eksploration (forkastet til fordel for ren C)

## [3.0.0-alpha.1] - 2026-05-07 — "Tyr" (intern arbejdstitel)

Fase 0 af v3-evolutionen: fundament for deklarativ regelmotor forankret direkte i lovkilder.

### Tilføjet (Added)
- **Deklarativ regelmotor** under `src/rule_engine/` med tre underdele:
  - `models.py` — Pydantic-modeller for `Rule`, `RuleInput`, `RuleDecision`, `LawSource`
  - `expression.py` — sandbox-parser/evaluator for boolean-udtryk (AND/OR/NOT/==/!=/parens), uden brug af `eval`
  - `loader.py` — YAML + JSON Schema-validator + cross-check (decision-udtryk må kun referere definerede predikater)
  - `executor.py` — eksekverer regler mod input, plus `aggregate_status` (NO-GO > BETINGET-GO > GO)
- **Regelfiler under `rules/`** — én YAML pr. lovartikel med kilde-citat, URL og verificeringsdato
  - `rules/_schema.json` — JSON Schema (Draft 2020-12) der validerer alle regelfiler
  - `rules/ai_act/art_6_hojrisiko_klassifikation.yaml` — EU AI Act art. 6 + Bilag III
  - `rules/gdpr/art_22_automatiserede_afgorelser.yaml` — GDPR art. 22, stk. 1
  - `rules/forvaltningsloven/par_22_begrundelse.yaml` — Forvaltningsloven § 22
- **CLI** — `python -m src.rule_engine validate|list rules/`
- **Tests** — 48 enheds-tests for parser, executor og loader (alle grønne)

### Ændret (Changed)
- `requirements.txt`: tilføjet `jsonschema==4.23.0`; fjernet `streamlit==1.40.0` og `plotly==5.24.1` (ingen Python-imports henviste til dem)

### Arkitekturprincip
LLM må kun fortolke fritekst → strukturerede signaler (`signal_extractor`, kommer i Fase 1). Selve compliance-afgørelsen er altid deterministisk og kan spores til den lovartikel, reglen er hjemlet i.

## [3.0.0-alpha.6] - 2026-05-07 — Audit-log + 5 nye regler

### Tilføjet (Added)
- **Audit-log for v3-vurderinger** (`src/rule_engine/audit.py`):
  - `V3AssessmentLog` SQLAlchemy-model (append-only, JSON-payload, indekseret på created_at + status)
  - Hver `/api/v3/assess` persisterer request + response automatisk
  - Best-effort: hvis DB er nede, returneres vurderingen stadig med en advarsel
  - Optional `case_id`, `user_id`, `note` på request for senere filtrering
- **Audit-endpoints**:
  - `GET /api/v3/audit?limit=50&case_id=...&status=NO-GO` — filtreret liste
  - `GET /api/v3/audit/{log_id}` — fuld request + response til reproduktion
- **5 nye regler** (15 i alt):
  - AI Act art. 13 (transparens og brugerinformation for højrisiko)
  - AI Act art. 14 (menneskelig overvågning af højrisiko)
  - GDPR art. 5 (principper: formålsbegrænsning, dataminimering, opbevaring, rigtighed, sikkerhed)
  - GDPR art. 32 (sikkerhed ved behandling)
  - Forvaltningsloven § 3 (inhabilitet — også systemisk via leverandør og bias)

### Test-status
94 unit tests grønne (9 nye for audit) · 3/3 regression-cases passerer · 15 regler validerer

## [3.0.0-alpha.5] - 2026-05-07 — LM Studio + react-query + ⌘K command palette

### Tilføjet (Added)
- **LM Studio / lokal LLM-support** i `signal_extractor.py`. Selection priority er nu: `LM_STUDIO_BASE_URL` (LM Studio / Ollama / vLLM / llama.cpp server) → `AZURE_OPENAI_ENDPOINT` → `OPENAI_API_KEY`. Sæt fx `LM_STUDIO_BASE_URL=http://localhost:1234/v1` for at køre signal-extraction lokalt uden API-omkostninger.
- **`.env.example`** opdateret med dokumentation af alle tre LLM-options.
- **V3VurderingPage** kalder nu `/api/v3/assess` via `react-query` `useMutation`. Sample-data er flyttet til "Indsæt eksempel"-knap i formen i stedet for at være hardcoded i siden. Loading/error/empty states er på plads.
- **CommandPalette** (⌘K / Ctrl+K) under `frontend/src/components/command-palette/`. Lightweight implementering med framer-motion (ingen ny dep). Naviger mellem alle 13 sider med pil-op/ned + Enter. Globalt bundet i App.js — fungerer på alle sider.

## [3.0.0-alpha.4] - 2026-05-07 — Fase 1.4 (v3 API-endpoints)

### Tilføjet (Added)
- **`POST /api/v3/assess`**: kører hele v3-regelmotoren mod input. Tager fritekst-beskrivelse + signals + predikater og returnerer:
  - `aggregate_status` (NO-GO > BETINGET-GO > GO)
  - `decisions[]` med fuld kilde-citation, krav, evidens og evaluation_log
  - `signals_extracted_by_llm` så bruger kan auditere hvad LLM'en inferred
  - `warnings[]` for fx. manglende LLM-konfiguration
  - Caller-leverede signaler vinder altid over LLM-foreslåede
- **`GET /api/v3/rules`**: lister alle indlæste regler med deres kilde + predikater. Bruges af frontend til at vise "regler dækket" og af auditorer.
- Begge endpoints cacher rule-loading via `lru_cache` så regler kun parses én gang pr. server-instans.

### Smoke-verificeret
Med 10 regler indlæst og realistisk input: 6/10 regler triggered, aggregate = BETINGET-GO.

## [3.0.0-alpha.3] - 2026-05-07 — Fase 2 (frontend design-system primitives)

### Tilføjet (Added)
- **Design-system primitives** under `frontend/src/components/rules/`:
  - `ComplianceVerdict` — status-pille (GO / BETINGET-GO / NO-GO / NEEDS_INPUT) i tre størrelser
  - `LawSourceLink` — ekstern-link til EUR-Lex / Retsinformation med "sidst verificeret"-dato
  - `RuleCitation` — citatblok med direkte lov-citat + kilde-attribution
  - `EvidenceChecklist` — interaktiv evidens-tjekliste med status-farver (done/pending/in_progress/blocked)
  - `RuleDecisionPanel` — komplet panel for én RuleDecision: header + citat + begrundelse + krav-liste + needs_input
  - Alle primitives accepterer v3 RuleDecision-JSON direkte og bruger eksisterende theme-tokens
- **`/v3-vurdering`-side** (`V3VurderingPage.jsx`): viser primitives komponeret til en hel Quick Check-side i Design A "stille autoritet"-stil. Bruger hardcoded sample-data der mirror'er backend-output. Erstattes af /api/v3/assess-kald i Fase 1.4.

### Ændret (Changed)
- `App.js`: tilføjet lazy-import + Route for `/v3-vurdering`. Ingen ændringer til eksisterende ruter.

## [3.0.0-alpha.2] - 2026-05-07 — Fase 1 (regelbase + signal-extractor)

### Tilføjet (Added)
- **Signal-extractor** (`src/rule_engine/signal_extractor.py`): LLM-baseret fritekst → strukturerede signaler. LLM kan ALDRIG ændre selve afgørelsen, kun foreslå hvilke trigger-signaler der matcher. Bruger Azure OpenAI (eller OpenAI fallback) — samme pattern som resten af kodebasen. Stub-LLM understøttes for testning.
- **6 nye regler** (10 i alt):
  - AI Act art. 5 (forbudte praksisser → NO-GO)
  - AI Act art. 50 (transparens for chatbots/syntetisk indhold/deepfakes)
  - GDPR art. 6 (retsgrundlag for behandling)
  - GDPR art. 35 (DPIA-pligt)
  - Forvaltningsloven § 19 (partshøring)
  - Forvaltningsloven § 24 (begrundelsens indhold + AI-hallucinations-risiko)
  - Offentlighedsloven § 11 (dataudtræk og sammenstilling)
- **Regression-runner** (`src/rule_engine/regression.py` + `tests/regression/cases.yaml`): YAML-baseret test-harness der kører realistiske scenarier mod hele regelbasen og verificerer status + triggered rules + per-rule status. Kør: `python -m src.rule_engine.regression tests/regression/cases.yaml`. 3 startcases dækker BETINGET-GO, NO-GO og GO.

### Ændret (Changed)
- **Forgivende executor**: når et triggered rule mangler predikat-svar, returneres en `RuleDecision` med `needs_input: [...]` i stedet for at smide en exception. Dette gør regelmotoren brugbar i en iterativ wizard-flow: fortæl brugeren *hvad* der mangler, ikke "fejlet".
- **Strammere AI-Act triggers**: art. 5/6/50 kræver nu `system.uses_ai`-signalet (ikke bare personoplysnings-behandling). Forhindrer at rene fagsystemer uden AI udløser AI-Act-vurdering.

### Test-status
85 unit tests grønne · 3/3 regression-cases passerer

### Design-beslutning (2026-05-07)
Visuelt sprog er bekræftet via tre mockups i `mockups/`:
- **Marketing/login (`/`, `/om`, `/kontakt`):** Design A — "stille autoritet" (hvid baggrund, Source Serif Pro headlines, Inter body, lov-citater som elegante citatblokke). Sender ro og autoritet til indkøbsbeslutningstagere.
- **App (`/app/*`):** Design B — "kommandocenter" (mørk default, sidebar-navigation, ⌘K command palette, JetBrains Mono på lov-citater, status-pills). Power-user-værktøj for sagsbehandlere.

`.claude/launch.json` er sat op med dev-servers for backend (port 8000) og frontend (port 8080).

## [2.0.0] - 2025-09-20

### Ændret (Changed)
- **Major Rebranding**: Omdøbt fra "Judge Jarvis" til "Project Judge Dredd"
- **Professionel UI**: Fjernet alle emojis og implementeret mere professionelt design
- **Compliance Control**: Omdøbt "Fuld Vurdering" til "Compliance Control"
- **Sidebar**: Nu kollapsbar med bedre navigation

### Tilføjet (Added)
- **Regelmotor**: Deterministisk regelbaseret compliance vurdering
- **Evidenskatalog**: Komplet katalog over nødvendige artefakter og dokumentation
- **Beslutningslogik**: Klar GO/BETINGET-GO/NO-GO beslutningsstruktur
- **Risikoscore**: 0-100 point risiko scoring system
- **Assessment Historik**: Gem og gennemse tidligere vurderinger
- **Hjælpetekster**: Tooltips og kontekstuel hjælp
- **Relevante Links**: Sektion med links til danske AI og juridiske ressourcer
- **Versionering**: Implementeret semantic versioning

### Forbedret (Improved)
- **Navigation**: Forbedret progression bar med klikbare trin
- **Styling**: Mørkere, mere professionelt farvetema
- **Performance**: Optimeret loading states og error handling
- **Brugeroplevelse**: Auto-save, keyboard navigation, print-venlig version

## [1.0.0] - 2025-09-19

### Initial Release
- 7-punkts AI compliance vurdering
- Integration med danske nyhedskilder
- GDPR og AI Act compliance checks
- Real-time nyhedsfeed fra Datatilsynet, EDPB, EU
- Grundlæggende dashboard og rapportering