> **Historisk dokument:** Dette dokument beskriver tidligere udgaver af løsningen. Brug [SHIELD README](README.md) til den aktuelle arbejdsgang og lokale opstart. Versions-, port- og driftsoplysninger nedenfor kan være forældede.

# Tyr v3 — Handoff

**Senest opdateret:** 7. maj 2026 (alpha.13)
**Branch:** `v3-hjemmel` (på [Parthee-Vijaya/Judge_dredd](https://github.com/Parthee-Vijaya/Judge_dredd))
**Senest pushede commit:** se `git log v3-hjemmel -1` efter pull

Dette dokument lader dig fortsætte v3-arbejdet fra en anden maskine eller efter en pause uden tab af kontekst.

---

## 1. Sådan resumer du arbejdet

```bash
git clone https://github.com/Parthee-Vijaya/Judge_dredd.git
cd Judge_dredd
git checkout v3-hjemmel
git pull

# Backend
python3.11 -m venv venv  # python3.13 også OK
./venv/bin/pip install -r requirements.txt

# Frontend
npm install

# .env (fra .env.example)
cp .env.example .env
# Sæt mindst én LLM-provider:
#   LM_STUDIO_BASE_URL=http://localhost:1234/v1  (lokal, anbefalet)
#   AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY
#   OPENAI_API_KEY
# SQLite for lokal dev:
#   DATABASE_URL=sqlite:///./judge_dredd.db
# Sæt API_PORT=8001 hvis 8000 er taget på maskinen
# Sæt PORT=8090 i package.json's dev:frontend hvis 8080 er taget

# Verifikation
./venv/bin/python -m src.rule_engine validate rules
./venv/bin/python -m src.rule_engine.regression tests/regression/cases.yaml
./venv/bin/pytest tests/rule_engine -q

# Spin op
npm run dev
# → backend på :8001, frontend på :8090
```

Forventet:
- 15 regler markeret `ok`
- 3/3 regression cases passed
- 94 unit tests passed (1 fejl ved aktiv LM Studio i .env — env-isolation, ikke kode-regression)

---

## 2. Hvor er vi nu?

### Status på `v3-hjemmel` (alpha.13)

| Tæller | Værdi |
|---|---|
| Aktive regler | 15 (AI Act ×5, GDPR ×5, Forvaltningslov ×4, Offentlighedslov ×1) |
| Sektorlov-templates klar til jurist | 6 (`_template_*.yaml`) |
| Unit tests | 94 grønne |
| API-endpoints | 11 v3-endpoints |
| Frontend pages | 7 (Forside, Vurdering, Sager, Historik, Sammenlign, Lov-overvågning, Indstillinger) |

### Commit-historik (alle alpha-versioner)

```
e71927e  alpha.13  M4 forberedelse — 6 sektorlov-templates + jurist-pakke
bac61e4  alpha.12  M2 sager-kanban + M3 citation-verifier
5a64b78  alpha.11  M1 dokument-analyse (PDF/DOCX → regelmotor)
8308771  alpha.10  3 eksempler (GO/BETINGET-GO/NO-GO) + foldable forklaringer
5b9c8e7  alpha.9   Steps 3-5 + tech debt + sammenlign-mode
72487e4  alpha.8   Vurderingshistorik (Step 2)
e8cf9c0  alpha.7   Design C global rebrand + nav-konsolidering
17f34bd  docs      HANDOFF.md + audit metadata på V3VurderingPage
1f608d8  alpha.6   audit-log + 5 nye regler (15 i alt)
```

### Hvad er live (verificeret end-to-end)

**Vurdering** (`/vurdering`):
- 3 example-cards (GO / BETINGET-GO / NO-GO) med foldable forklaringer
- Drag-drop drop-zone for PDF/DOCX upload (M1)
- LLM-baseret signal- og predikat-extraction (M1.5 — alpha.13)
- Result-mode i Design C med inline ¹²³ fodnoter + sidenotes-kolonne
- Audit-log persistering (kind=document for upload-flow)
- LLM-udtrukne predikater vises så sagsbehandler kan verificere

**Sager** (`/sager`):
- Kanban med 6 status-kolonner: Kladde · Vurderet · Remediation · Godkendt · Idriftsat · Arkiveret
- Drag-drop mellem kolonner → status-skift med audit-trail
- "+ Ny sag"-modal
- Auto-transition: kladde→vurderet ved første assessment, vurderet→remediation ved BETINGET-GO/NO-GO

**Historik** (`/historik`, `/historik/:id`):
- Tabel med filter-chips (Alle/GO/Betinget GO/NO-GO)
- Klik → detail-mode med fuld vurdering reproduceret fra audit-log

**Lov-overvågning** (`/lov-overvaagning`):
- Daglig job kl. 04:00 verificerer hver regels citat mod kilde-URL
- Status per regel: ✓ Verificeret / ⚠ Flagget / — Ukendt
- "Kør verifikation nu"-knap
- Warning-banner i Vurdering hvis triggered regel er flagget

**Sammenlign** (`/sammenlign`):
- Side-om-side diff mellem legacy ComplianceController og v3 rule_engine
- Bruges til at validere Kategori A-sletning

**Forside** (`/`):
- Rebrandet til Tyr (alpha.13). Educational cards om Forbudt AI / GPAI / Højrisiko.

### Beslutninger der er taget

- **Brand:** "Tyr" som arbejdstitel — "Project Judge Dredd" droppet undervejs
- **Design:** Ren Design C ("editorial workspace") — cream-paper, Lora body, Source Serif Pro display, Inter chrome, JetBrains Mono mono. Sidenotes-kolonne for lov-citater
- **Rulemotor:** Hybrid YAML + LLM. LLM må aldrig ændre afgørelsen — kun udtrække signaler og predikater fra fritekst
- **Hosting:** Backend on-prem; LLM via API (Azure West Europe / LM Studio lokalt / OpenAI fallback)
- **Single-tenant:** Kun Kalundborg Kommune i v1
- **Lovdækning v1:** AI Act + GDPR + Forvaltningslov + Offentlighedslov + (afventer) Sektorlove

---

## 3. Arbejde i gang

### Færdige milestones (i orden)

- ✅ M1 — Document-analyse (alpha.11)
- ✅ M1.5 — Predikat-extraction fra dokument (alpha.13)
- ✅ M2 — Workflow state-machine for sager (alpha.12)
- ✅ M3 — Citation-Verifier (alpha.12)
- ✅ M4 forberedelse — Sektorlov-templates + jurist-interview-pakke (alpha.13)

### Næste skridt (i prioriteret rækkefølge)

**M4 aktivering — book jurist-møde:** Templates ligger klar i [rules/sektorlove/](rules/sektorlove/) prefixet med `_template_`. Jurist gennemgår dem ifølge [docs/JURIST_INTERVIEW.md](docs/JURIST_INTERVIEW.md). Briefing til jurist findes i [docs/JURIST_BRIEFING.md](docs/JURIST_BRIEFING.md).

**M5 — Auth + Entra ID SSO:** Udskudt indtil pilot-deploy hos Kalundborg er besluttet. Kræver Microsoft tenant + IT-koordinering. Estimat: 2-3 dages arbejde efter tenant er klar.

**Optional (hvis behov dukker op):**
- Reminder-job for cases (APScheduler finder cases hvor `next_review_at <= today`)
- PDF-annotering i M1 (overlay highlights på faktisk PDF i resultat-mode)
- Lov-RAG (bygger ovenpå eksisterende `src/database/vector_store.py`)
- Headless-browser-baseret citation-verifier (for SPA-renderede lovsider)

**Sletning af Kategori A backend (~4 800 linjer):** Beskrevet i [SLETNING-EVAL.md](SLETNING-EVAL.md). Anbefalet workflow: 10-15 sektor-test-cases gennem `/api/v3/compare`, jurist sign-off, og sektorlove-coverage før sletning godkendes.

---

## 4. Vigtige filer at kende

### Backend
- [main.py](main.py) — FastAPI app med alle v3-endpoints (lifespan + cases + freshness + document + compare)
- [src/rule_engine/](src/rule_engine/) — deklarativ regelmotor
  - `models.py` — Pydantic Rule, RuleInput, RuleDecision
  - `loader.py` — YAML + JSON Schema validator (skipper `_*`-filer)
  - `executor.py` — deterministisk evaluator + aggregate_status
  - `signal_extractor.py` — LLM fritekst → signaler + predikater (M1.5)
  - `audit.py` — V3AssessmentLog SQLAlchemy-model
  - `regression.py` — YAML-baseret test-harness
- [src/services/](src/services/)
  - `document_analyzer.py` — PDF/DOCX → chunk → signal-ekstraktion → predikat-ekstraktion → regelmotor
  - `citation_verifier.py` — daglig job der verificerer hver regels citat mod kilde-URL
  - `news_service.py`, `tech_ticker_service.py` — legacy news (ikke v3)
- [src/database/](src/database/)
  - `cases.py` — Case + CaseTransition workflow-state-machine (M2)
  - `connection.py` — SQLAlchemy session + init_db
- [rules/](rules/) — 15 aktive YAML-regler + 6 `_template_`-sektorlove

### Frontend
- [App.js](frontend/src/App.js) — routes + lazy-loaded pages
- [Sidebar.js](frontend/src/components/Sidebar.js) — Design C-rebrandet sidebar
- [components/rules/](frontend/src/components/rules/) — design-primitives
- [components/command-palette/CommandPalette.jsx](frontend/src/components/command-palette/CommandPalette.jsx) — ⌘K + g-prefix shortcuts
- [pages/V3VurderingPage.jsx](frontend/src/pages/V3VurderingPage.jsx) — primær vurderings-side
- [pages/VurderingHistorikPage.jsx](frontend/src/pages/VurderingHistorikPage.jsx) — list + detail
- [pages/SagerPage.jsx](frontend/src/pages/SagerPage.jsx) — kanban (M2)
- [pages/LovOvervaagningPage.jsx](frontend/src/pages/LovOvervaagningPage.jsx) — citat-verifier admin (M3)
- [pages/SammenlignPage.jsx](frontend/src/pages/SammenlignPage.jsx) — v3 vs legacy
- [pages/HomePage.js](frontend/src/pages/HomePage.js) — Forside (rebrandet alpha.13)

### Dokumentation
- [docs/RULE_AUTHORING.md](docs/RULE_AUTHORING.md) — jurist-guide til at skrive regler
- [docs/JURIST_INTERVIEW.md](docs/JURIST_INTERVIEW.md) — strukturet 30-45 min interview-guide
- [docs/JURIST_BRIEFING.md](docs/JURIST_BRIEFING.md) — 5 min onboarding
- [SLETNING-EVAL.md](SLETNING-EVAL.md) — Kategori A sletning workflow
- [CHANGELOG.md](CHANGELOG.md) — versionshistorik
- [mockups/](mockups/) — design-a (afvist), design-b (afvist), design-c (valgt), design-d (afvist), index

---

## 5. Kommandoer du ofte får brug for

```bash
# Tests
./venv/bin/pytest tests/rule_engine -q                          # 94 unit tests
./venv/bin/python -m src.rule_engine validate rules              # 15 regler
./venv/bin/python -m src.rule_engine.regression tests/regression/cases.yaml

# Backend + frontend
npm run dev    # concurrent: python3 main.py + react-scripts på :8001/:8090

# Manuel kørsel af citation-verifier
curl -X POST http://localhost:8001/api/v3/law/freshness/run | jq

# v3 endpoints test
curl -X POST http://localhost:8001/api/v3/assess \
  -H 'Content-Type: application/json' \
  -d '{"system_description":"test","predicates":{}}'

curl -X POST http://localhost:8001/api/v3/document/analyze \
  -F "file=@dokument.pdf" -F "case_id=K-test"

curl http://localhost:8001/api/v3/cases | jq

# Compare engines
curl -X POST http://localhost:8001/api/v3/compare \
  -H 'Content-Type: application/json' \
  -d '{"system_description":"...","predicates":{}}'

# DB schema (idempotent)
./venv/bin/python -c "
from src.rule_engine import audit
from src.database import cases
from src.services import citation_verifier
from src.database.connection import init_db
init_db()
"
```

---

## 6. Konfiguration (.env)

```bash
# Database
DATABASE_URL=sqlite:///./judge_dredd.db
# DATABASE_URL=postgresql://user:pass@host:5432/compliance_db

# API porte
API_PORT=8001

# LLM-provider — vælg én. Auto-prioritet: LM Studio → Azure → OpenAI
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_API_KEY=lm-studio
LM_STUDIO_MODEL=google/gemma-4-26b-a4b
LM_STUDIO_TIMEOUT=120

# (Eller Azure)
# AZURE_OPENAI_ENDPOINT=...
# AZURE_OPENAI_API_KEY=...
# AZURE_DEPLOYMENT_NAME=gpt-4o-mini

# (Eller OpenAI)
# OPENAI_API_KEY=sk-...

# Anthropic placeholder (legacy ComplianceOrchestrator boots med tom værdi)
ANTHROPIC_API_KEY=
```

Hvis ingen LLM er konfigureret, skipper backend signal/predikat-extraction og returnerer en advarsel — vurderingen virker stadig hvis caller selv leverer signaler/predikater.

---

## 7. Kendt teknisk gæld / blockers

| Punkt | Status | Hvorfor |
|---|---|---|
| QuickCheckPage.js (1720 linjer) refaktor | Skipped | Erstattet af V3VurderingPage. Slet sammen med Kategori A |
| Sektorlove i `rules/sektorlove/` | Templates klar (alpha.13) | Afventer jurist-interview |
| Frontend tests for nye pages | Mangler | Pris vs værdi — ikke kritisk for pilot |
| Authentication (Entra ID SSO) | Ikke startet (M5) | Afventer pilot-godkendelse + IT-tenant |
| Old engine vs new engine sammenligning | Aktiveret (alpha.9) | `/sammenlign` virker; mangler 10-15 cases for SLETNING-EVAL |
| Citation-verifier på SPA-renderede sider | Flagger 13/15 | Forventet — kræver Playwright for fuld dækning |

---

## 8. Når du resumerer — checklist

1. `git pull` på `v3-hjemmel`
2. Læs CHANGELOG.md for nyligt arbejde
3. Kør `./venv/bin/pytest tests/rule_engine -q` — skal sige `94 passed`
4. Kør `./venv/bin/python -m src.rule_engine validate rules` — skal vise 15 regler ok
5. Læs Status (sektion 2) og Næste skridt (sektion 3)
6. Hvis tvivl: åbn `/vurdering`, klik "Indsæt" på et af de 3 eksempler → "Vurder"
7. Eller upload `tests/fixtures/documents/borgerassistent_pension.docx` som dokument-test

God arbejdslyst.
