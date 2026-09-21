# Kategori A sletning — evaluering

Dato: 2026-05-07
Branch: `v3-hjemmel`

## Konklusion

**Anbefaler IKKE at slette legacy backend i denne session.** Step 4 (`/api/v3/compare`) er nu på plads og giver ét bekræftende sammenligningsresultat (`agreement: match` på sample-input), men en fuld sletning kræver mere bredde i valideringen. Status er "klar til at validere", ikke "klar til at slette".

## Hvad blev gjort

1. Backend-endpoint `/api/v3/compare` bygget — kører både legacy `ComplianceController` og ny v3 rule_engine på samme input
2. Frontend-side `/sammenlign` (Design C) viser side-om-side resultat
3. Kørt sample-test: AI-drevet borgerassistent med profilering + automatiseret afgørelse
   - **v3:** BETINGET-GO, 6 regler triggered, dækker ai_act + gdpr
   - **legacy:** BETINGET-GO, risk_score 50, dækker forvaltningsret + gdpr
   - **Diff:** `agreement: match` på beslutnings-niveau
4. Bemærket: legacy fanger forvaltningsret-emner som v3 også har dækning på (forvaltningsloven.par22 m.fl.), men topikalsk-mapping i compare-endpoint er primitiv (bruger første del af rule_id)

## Hvad mangler før sikker sletning

| Krav | Hvorfor | Hvordan |
|---|---|---|
| Bredt regression-sweep | Én test = ikke statistisk basis. Skal teste på tværs af AI-typer, sektorer, risiko-niveauer. | Definer 10-15 test-cases der dækker historiske brugsscenarier (jobcenter-AI, sundhedstriagering, kommunal chatbot osv.). Kør hver gennem `/api/v3/compare`. Krav: `agreement: match` på alle. |
| Topical mapping-verifikation | Compare-endpoint bruger naiv første-del-af-rule_id matching. Kan miste regler der findes med forskellige id'er. | Lav manuel mapping-tabel der knytter hver legacy-regel til 0-N v3-regler. Identificer "kun-legacy" regler der trænger en v3-erstatter. |
| Jurist sign-off | v3 introducerer Forvaltningsloven §3, §19, §22, §24 + Offentlighedsloven §13 som legacy ikke har. Tjek at lovgrundlag er korrekt. | Mette Nielsen / juridisk hos Kalundborg går igennem hver YAML-regel og verificerer citater + outcomes. |
| Sektorlove i v3 | Step 5 — uden disse kan v3 IKKE erstatte legacy fuldt ud (servicelov m.fl.). | Følg `rules/sektorlove/README.md` jurist-spec. |

## Hvis sletning godkendes senere — hvad slettes

**Backend (~4 800 linjer):**
- [src/agents/](src/agents) — LangGraph orchestrator + checkers (1 698 linjer)
- [src/compliance/](src/compliance) — gamle AI Act/GDPR/recommendation checkers (2 122 linjer)
- [src/compliance_engine.py](src/compliance_engine.py) — gammel ComplianceController (982 linjer)

**Backend endpoints i `main.py` (~21 endpoints, ~1 200 linjer):**
- `/api/compliance/hurtig-tjek`, `/api/compliance/7-punkts-vurdering`, `/api/compliance/analyser`
- `/api/research/juridisk` (legacy LangGraph)
- `/api/knowledge-base/*` (auto-update via OpenAI — kan også beholdes som standalone service)
- `/api/news/*` (kan beholdes — bruger forsiden)
- `/api/ai-cases/*` (kan beholdes — bruges af AICasesPage)

**Frontend (~3 000 linjer orphaned pages):**
- `pages/QuickCheckPage.js` (1 720)
- `pages/FullAssessmentPage.js`, `pages/DashboardPage.js`, `pages/HistoryPage.js` (uden routes — orphaned)

**Imports i `main.py` der kan fjernes:**
```python
from src.agents import AgentConfig, get_agent_registry
from src.agents.compliance_orchestrator import ComplianceOrchestrator
from src.compliance.ai_act_checker import AIActComplianceChecker
from src.compliance.gdpr_checker import GDPRComplianceChecker
from src.compliance_engine import ComplianceController
```

## Workflow for sletning

```bash
# 1. Bekræft regression-sweep er grøn
./venv/bin/pytest tests/rule_engine -q
# kør de 10-15 sektor-cases gennem /api/v3/compare og bekræft alle match

# 2. Slet backend (ét commit)
git rm -r src/agents src/compliance src/compliance_engine.py

# 3. Fjern imports + endpoint-kald i main.py (samme commit)
# Find og slet: ComplianceOrchestrator, AIActComplianceChecker, GDPRComplianceChecker,
# ComplianceController + alle /api/compliance/*, /api/research/* endpoints

# 4. Slet orphaned frontend pages (separat commit)
git rm frontend/src/pages/QuickCheckPage.js frontend/src/pages/FullAssessmentPage.js \
       frontend/src/pages/DashboardPage.js frontend/src/pages/HistoryPage.js

# 5. Slet /sammenlign (Step 4 var midlertidig validation — fjern når dens formål er opfyldt)
git rm frontend/src/pages/SammenlignPage.jsx

# 6. Fjern /api/v3/compare endpoint i main.py

# 7. Verificer at app stadig booter + alle v3 endpoints virker
./venv/bin/pytest tests/rule_engine -q
curl http://localhost:8001/api/v3/rules

# 8. Commit
git commit -m "feat(v3.0.0): retire legacy engine — v3 rule_engine is sole source of truth"
```

## Hvorfor IKKE slette nu

1. **Risiko for tab af coverage** — én test-case er ikke nok til at bekræfte at v3 fanger alt legacy gør.
2. **Sektorlove mangler** — uden servicelov/beskæftigelseslov/sundhedslov kan v3 ikke erstatte legacy for kommunale sager der bruger disse.
3. **Reverse-omkostninger** — sletning er let; gen-introducere legacy hvis vi opdager et hul er svært (krav om at re-rebuild fra git history). Bedre at vente til vi er sikre.
4. **Step 4 er klar til at validere** — værktøjet er bygget; nu skal det BRUGES af jurist + udvikler sammen før sletning.

## Næste skridt (når jurist er tilbage på arbejde)

1. Skriv 10-15 test-cases til `tests/regression/cases.yaml` der dækker historiske kommune-AI-cases
2. Kør hver via `/api/v3/compare`-endpoint og verificer `agreement: match`
3. Hvis ikke alle matcher → identificer hvilke v3-regler der mangler eller hvilke legacy-regler der har værdi der skal flyttes til v3
4. Når alle 10-15 test-cases er match → opfyld kravene i tabellen ovenfor → slet legacy
