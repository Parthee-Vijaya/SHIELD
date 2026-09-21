# AI Compliance Platform Modernisering & Nyheds- / Agentroadmap

## 1. Mål & Scope

- **Nyhedsintelligence**: Konsolidere live-nyheder om AI-regulering (EU/DK) for compliance-teamet via API- og UI-integration.
- **Agentøkosystem**: Klargøre modulært agentframework for risikovurdering, konsekvensanalyse (DPIA/FRIA) og juridisk research.
- **Platformmodernisering**: Skitsere retning for moderne, reaktiv frontend, skalerbar backend og DevOps-praksis.

## 2. Arkitektur Oversigt

| Lag | Nuværende status | Planlagt udvidelse |
| --- | ---------------- | ------------------ |
| **Dataindsamling** | `src/news/live_scraper.py` med RSS/HTML, `src/research/web_searcher.py` | Nyheds-orchestrator, cache, planlagte køer, kildekvalitetsscore |
| **Analyse/Agents** | `ComplianceOrchestrator` (LangGraph) + AI/GDPR checkers | Rollespecifikke agenter (Risk, DPIA, Legal Research), agent registry & config |
| **API** | `main.py` med FastAPI endpoints | `/api/news/latest`, `/api/agents/jobs`, `/api/assessments` med jobstatus & streaming |
| **Frontend** | React-dashboard + Streamlit fallback | Konsolideret React UI med realtidsopdateringer, news feed, agent job monitor |
| **Data Storage** | In-memory + Postgres/Qdrant via Docker (ikke aktiv i kode) | Persistente tabeller (news_items, agent_jobs, assessments) + migrations |
| **Ops** | Docker Compose, manual start | CI/CD, observability, secrets management, scheduled workers |

## 3. Nyhedsmodul Plan

1. **Service-lag (`NewsService`)**
   - Wrapper omkring `LiveNewsScraper` med konfigurerbare kilder, filtrering, normalisering og caching (memory + disk fallback).
   - Introducer `NewsRepository` interface med implementeringer: `InMemoryNewsRepo`, `DatabaseNewsRepo` (Postgres), `FileCacheRepo`.

2. **API-endpoints**
   - `GET /api/news/latest`: returnér deduplikerede nyheder, mulighed for filter på kategori/kilde/dato.
   - `POST /api/news/refresh`: trigger async refresh (protected, evt. bag job queue).
   - `GET /api/news/status`: health & kilde-metrics.

3. **Jobs & Scheduling**
   - Kort sigt: Baggrundsopgave via `asyncio.create_task` + TTL-cache.
   - Længere sigt: Celery/RQ eller FastAPI background tasks + cron (Kubernetes job / serverless timer).

4. **Frontend-integration**
   - Opsæt NewsContext + TanStack Query; vis "Seneste nyt" på dashboard + dedikeret side.
   - Badge for kilde, kategori (AI Act, GDPR, Datatilsynet, EU), importance-score og opdaterings-tid.

5. **Fejltolerance**
   - Graceful fallback til seneste cache ved netværksfejl.
   - Logging + metrics (antal kilder, fetch success rate, sidst opdateret).

## 4. Agent-økosystem Plan

1. **Agent Registry**
   - Opret `src/agents/registry.py` med metadata om roller: `risk_assessor`, `dpia_specialist`, `legal_researcher`.
   - Hver agent beskriver input/output, anvendte frameworks, modelpræference og nødvendige værktøjer.

2. **Konfigurationsfiler**
   - YAML/JSON i `config/agents/` for at beskrive prompts, beslutningstræ, compliance-standarder (GDPR art. 35, Datatilsynet DPIA-skema, AI Act Annex IV, etc.).
   - Mulighed for runtime-override via database eller admin-UI.

3. **Job Orchestration**
   - Udvid `ComplianceOrchestrator` til at starte sub-agenter baseret på job-type.
   - Opret `AgentJob` model (status, input, resultater, logs) + REST endpoints (`/api/agents/jobs`).
   - Plan for streamingrespons (Server Sent Events / websockets) for realtids-feedback ved lange analyser.

4. **Analysekomponenter**
   - **Risk Assessment Agent**: bruger AIActChecker + heuristikker + LLM forklaringer.
   - **Consequence Analysis Agent**: mappe til FRIA/DPIA standard (risikomatrix, interessenter, impact severity).
   - **Legal Research Agent**: wrapper om `WebSearcher` + summarizer + citation formatter.

5. **Audit & Compliance**
   - Log agentbeslutninger, anvendte kilder, model-versioner.
   - Mulighed for manuel review/override (human-in-the-loop).

## 5. Backend Udvidelser (kort sigt)

- Strukturér `src/services/` modul til isolerede domæneservices.
- Tilføj `schemas/news.py` og `routers/news.py` i FastAPI.
- Genbrug Pydantic-modeller for API-svar (NewsItemResponse, NewsSourceStatus).
- Introducer `settings.py` (Pydantic Settings) for konfigurable refresh-intervaller, kildelister, fallback paths.
- Tilføj tests (pytest) for service- og routerlag med mocked fetcher.

## 6. Frontend Udvidelser (kort sigt)

- Opret `frontend/src/services/newsService.js` (TanStack Query fetcher, fallback cache).
- News-dashboard widget med real-time badges, filterchips, "Opdater"-knap.
- Tilføj skeleton-loaders + error states + kildeoversigt.

## 7. DevOps & Delivery

- Implementér `docker-compose` override med separat worker til nyheder.
- Forbered GitHub Actions pipeline: lint (black/flake8), tests, frontend build.
- Logning via `loguru` + structured log JSON til fremtidig central logging.
- Healthcheck endpoint udvides med news-agent status.

## 8. Fremtidige Trin

- Persistente data: Alembic migration for `news_items`, `agent_jobs`, `assessments`.
- UI-komponentbibliotek (Storybook) og design tokens.
- Role-based access control + SSO (Azure AD / MitID Erhverv).
- Integration til notificeringskanaler (Teams, e-mail) ved nye højprioritetsnyheder.
- Analytiske dashboards (trendlinjer, risikomatrix, compliance gap heatmaps).

---
*Version 1.0 • Udarbejdet af Codex (GPT-5) • 2024*
