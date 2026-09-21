# System Architecture - Judge Dredd AI Compliance Platform

**Version:** 0.8.0
**Dato:** 11. Oktober 2025
**Status:** Living Document

---

## 📋 Indholdsfortegnelse

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Backend Architecture](#backend-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [API Endpoint Mapping](#api-endpoint-mapping)
7. [Agent System](#agent-system)
8. [Caching Strategy](#caching-strategy)
9. [Database Schema](#database-schema)
10. [Deployment Architecture](#deployment-architecture)

---

## System Overview

Judge Dredd er en AI compliance platform designet til Kalundborg Kommune for at vurdere AI-systemer mod EU AI Act, GDPR og dansk lovgivning. Systemet kombinerer:

- **Deterministisk regelmotor** - Hard-coded compliance rules for GO/NO-GO beslutninger
- **LLM-baseret analyse** - Intelligent vurdering via Azure OpenAI
- **Web research integration** - Real-time legal research via DuckDuckGo
- **Multi-agent workflows** - LangGraph StateGraph patterns

### Technology Stack

**Backend:**
- FastAPI 0.115.0 (med modern lifespan pattern)
- LangGraph 0.2.45 (StateGraph-baseret agent orchestration)
- LangChain 0.3.7 (LLM integration)
- SQLAlchemy 2.0.35 + SQLite/PostgreSQL
- APScheduler (scheduled tasks)

**Frontend:**
- React 18 (med code splitting og lazy loading)
- React Router 6 (client-side routing)
- Styled Components (CSS-in-JS)
- Framer Motion (animations)
- Axios (API calls)

**AI/LLM:**
- Azure OpenAI (gpt-4o-mini deployment)
- Fallback til OpenAI API

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │   Mobile     │  │   Desktop    │          │
│  │  (React 18)  │  │  (Future)    │  │  (Future)    │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                        │
│         │ HTTP/REST (Port 8080)                                 │
└─────────┼────────────────────────────────────────────────────────┘
          │
          │
┌─────────▼────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                           │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              React Frontend (Port 8080)                    │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │  │
│  │  │  Pages  │  │Components│  │ Context │  │  Utils  │     │  │
│  │  │  (11)   │  │  (8)     │  │  (2)    │  │         │     │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ HTTP/REST (Proxy to :8000)
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                       APPLICATION LAYER                            │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │             FastAPI Backend (Port 8000)                     │  │
│  │                                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │  Compliance  │  │   Research   │  │     News     │    │  │
│  │  │  Endpoints   │  │  Endpoints   │  │  Endpoints   │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │  │
│  │                                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │   AI Cases   │  │  Knowledge   │  │    Health    │    │  │
│  │  │  Endpoints   │  │Base Endpoints│  │  Endpoints   │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────────────────────┬───────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   BUSINESS    │  │     AGENT     │  │    CACHING    │
│     LOGIC     │  │     LAYER     │  │     LAYER     │
│               │  │               │  │               │
│ Compliance    │  │  LangGraph    │  │  Memory LRU   │
│  Engines      │  │  StateGraphs  │  │  Disk Cache   │
│               │  │               │  │               │
│ Rule Engine   │  │ Orchestrator  │  │  TTL: 3600s   │
│ GO/NO-GO      │  │ Quick Check   │  │               │
└───────┬───────┘  └───────┬───────┘  └───────────────┘
        │                  │
        │                  │
        └──────────┬───────┘
                   │
┌──────────────────▼────────────────────────────────────────┐
│                   DATA LAYER                               │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   SQLite     │  │    JSON      │  │   External   │   │
│  │   Database   │  │   Storage    │  │     APIs     │   │
│  │              │  │              │  │              │   │
│  │ Assessments  │  │ Knowledge    │  │ DuckDuckGo   │   │
│  │ Cases        │  │ Base         │  │ Web Search   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└───────────────────────────────────────────────────────────┘
                            │
                            │
                            ▼
                 ┌────────────────────┐
                 │    EXTERNAL AI     │
                 │                    │
                 │  Azure OpenAI      │
                 │  (gpt-4o-mini)     │
                 └────────────────────┘
```

---

## Backend Architecture

### File Structure

```
main.py (1589 linjer)                    # FastAPI app med lifespan
├── src/
│   ├── agents/                          # LangGraph-based agents
│   │   ├── compliance_orchestrator.py   # Main compliance workflow
│   │   ├── quick_check_agent.py         # Fast compliance check
│   │   ├── research_agent_langgraph.py  # Research agent (modern)
│   │   └── registry.py                  # Agent configuration
│   │
│   ├── compliance/                      # Compliance checkers
│   │   ├── compliance_control_engine.py # 7-punkts vurdering
│   │   ├── ai_act_checker.py            # EU AI Act rules
│   │   ├── gdpr_checker.py              # GDPR rules
│   │   └── recommendation_engine.py     # Smart recommendations
│   │
│   ├── compliance_engine.py             # Deterministisk regel engine
│   │
│   ├── research/                        # Research tools
│   │   └── web_searcher.py              # DuckDuckGo integration
│   │
│   ├── services/                        # Background services
│   │   ├── news_service.py              # News aggregation
│   │   ├── tech_ticker_service.py       # Tech news ticker
│   │   └── knowledge_base_updater.py    # Auto KB updates (03:00)
│   │
│   ├── cache/                           # Caching infrastructure
│   │   ├── disk_cache.py                # Persistent cache
│   │   ├── memory_cache.py              # In-memory LRU
│   │   └── cache_warmer.py              # Startup warming
│   │
│   ├── database/                        # Persistence layer
│   │   ├── models.py                    # SQLAlchemy models
│   │   ├── connection.py                # DB session management
│   │   └── compliance_service.py        # Business logic
│   │
│   ├── core/                            # Core models
│   │   ├── models.py                    # Pydantic models
│   │   └── news_models.py               # News data models
│   │
│   └── utils/                           # Utilities
│       └── version_info.py              # Git-based versioning
```

### Key Backend Patterns

#### 1. Modern FastAPI Lifespan Pattern

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info("Starting application...")
    # Cache warming, news fetch, scheduler setup
    yield
    # Shutdown
    logger.info("Shutting down...")
    # Cancel tasks, shutdown scheduler

app = FastAPI(lifespan=lifespan)
```

**Fordele:**
- Ingen deprecation warnings
- Clean separation af startup/shutdown
- Modern pattern fra FastAPI 0.109+

#### 2. Hybrid Compliance Approach

**Deterministisk Regelmotor** (`compliance_engine.py`):
```python
class ComplianceRuleEngine:
    def evaluate_rules(self, data):
        # Hard-coded rules
        if data['uses_subliminal']:
            return Decision.NO_GO, "Forbidden under AI Act"
        # Evidence-based scoring
        return decision, reasons
```

**LLM-baseret Analyse** (via agents):
```python
class ComplianceOrchestrator:
    def _build_workflow(self) -> StateGraph:
        workflow = StateGraph(ComplianceState)
        workflow.add_node("analyze_risk", self._analyze_risk_node)
        # LLM determines nuanced interpretations
        return workflow.compile()
```

#### 3. Background Task Management

- **News Refresh**: Hver 5 min via asyncio tasks
- **Ticker Refresh**: Hver 2 min via asyncio tasks
- **Knowledge Base Update**: Dagligt kl. 03:00 via APScheduler

---

## Frontend Architecture

### File Structure

```
frontend/src/
├── App.js                            # Main app + routing
├── pages/                            # Route-level components
│   ├── HomePage.js                   # Landing page
│   ├── QuickCheckPage.js             # Quick compliance check
│   ├── FullAssessmentPage.js         # 7-punkts vurdering
│   ├── ResearchPage.js               # Legal research
│   ├── KnowledgeBasePage.js          # Knowledge base
│   ├── AICasesPage.js                # AI cases management
│   ├── AIProjectsPage.js             # Projects overview
│   ├── DashboardPage.js              # Analytics
│   ├── HistoryPage.js                # Assessment history
│   ├── ResourcesPage.js              # Relevant links
│   └── SettingsPage.js               # User settings
│
├── components/                       # Reusable components
│   ├── Navbar.js                     # Top navigation
│   ├── Sidebar.js                    # Collapsible sidebar
│   ├── NewsSection.js                # News feed
│   ├── NewsTicker.js                 # Scrolling ticker
│   ├── SkeletonLoader.js             # Loading states
│   ├── ErrorBoundary.js              # Error handling
│   ├── PageErrorBoundary.js          # Page-level errors
│   └── LoadingSpinner.js             # Spinners
│
├── contexts/                         # React Context
│   ├── UserPreferencesContext.js     # Theme, settings
│   └── LoadingContext.js             # Global loading state
│
├── data/                             # Static data
│   ├── statsData.js                  # 100+ Kalundborg stats
│   └── aiActDidYouKnow.js            # Educational content
│
└── utils/                            # Utilities
    └── fagomraadeOptions.js          # Sector options
```

### Code Splitting Strategy

All pages use React.lazy for optimal bundle size:

```javascript
const HomePage = React.lazy(() => import('./pages/HomePage'));
const QuickCheckPage = React.lazy(() => import('./pages/QuickCheckPage'));
// ... etc
```

**Bundle Optimization:**
- Initial load: ~200KB (gzipped)
- Route chunks: 30-80KB per page
- Shared vendor chunk: ~150KB

---

## Data Flow Diagrams

### 1. Quick Check Workflow

```
┌─────────────┐
│ User Input  │
│ QuickCheck  │
│   Form      │
└──────┬──────┘
       │
       │ POST /api/compliance/hurtig-tjek
       │ { beskrivelse, ai_type, sektor, ... }
       │
       ▼
┌────────────────────────────────────────┐
│        FastAPI Backend                 │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  quick_check_agent.py            │  │
│  │                                   │  │
│  │  Phase 1: Rule Engine            │  │
│  │  ├─ Forbidden practices?         │  │
│  │  ├─ Risk classification          │  │
│  │  └─ Initial assessment           │  │
│  │                                   │  │
│  │  Phase 2: Web Research           │  │
│  │  ├─ DuckDuckGo search            │  │
│  │  ├─ EUR-Lex, Datatilsynet        │  │
│  │  └─ Precedent analysis           │  │
│  │                                   │  │
│  │  Phase 3: LLM Analysis           │  │
│  │  ├─ Azure OpenAI gpt-4o-mini     │  │
│  │  ├─ Nuanced interpretation       │  │
│  │  └─ Final recommendations        │  │
│  └──────────────────────────────────┘  │
│                                         │
│  Progress tracking via:                │
│  GET /api/compliance/progress/{id}     │
│  GET /api/compliance/intermediate/{id} │
└─────────────┬───────────────────────────┘
              │
              │ JSON Response
              │ { ai_act: {...}, gdpr: {...},
              │   recommendations: [...],
              │   precedents: [...] }
              ▼
┌────────────────────────────────────────┐
│         Frontend Display               │
│                                         │
│  ┌───────────────┐  ┌───────────────┐  │
│  │ Risk Badge    │  │ Recommendations│  │
│  │ (color-coded) │  │ (action items) │  │
│  └───────────────┘  └───────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Precedents & Legal Citations    │   │
│  │ (expandable cards)              │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 2. 7-Punkts Assessment Workflow

```
┌─────────────┐
│ User fills  │
│ 7-punkt     │
│   Form      │
└──────┬──────┘
       │
       │ POST /api/compliance/7-punkts-vurdering
       │ { system_navn, system_beskrivelse,
       │   personoplysninger, dpia_udfoert, ... }
       │
       ▼
┌────────────────────────────────────────────────┐
│   compliance_control_engine.py                 │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Punkt 1: AI System Identification       │  │
│  │  ├─ ML/AI detection                      │  │
│  │  ├─ Autonomous decision analysis         │  │
│  │  └─ Scoring: 0-100                       │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Punkt 2: Personal Data Processing       │  │
│  │  ├─ GDPR Article 6 legal basis           │  │
│  │  ├─ Special categories (Art. 9)          │  │
│  │  └─ Data minimization                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Punkt 3-7: Similar detailed analysis    │  │
│  │  ├─ GDPR Compliance                      │  │
│  │  ├─ AI Act Compliance                    │  │
│  │  ├─ Training & Documentation             │  │
│  │  ├─ External Resources                   │  │
│  │  └─ Specific Requirements                │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  Decision Matrix:                              │
│  ├─ GO: Score 80-100, no critical blockers    │  │
│  ├─ CONDITIONAL_GO: 60-79, minor issues       │  │
│  └─ NO_GO: <60 or critical blockers           │  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Database Save (SQLite)                   │  │
│  │  ├─ Assessment record                     │  │
│  │  ├─ Historical comparison                 │  │
│  │  └─ Recommendation generation             │  │
│  └──────────────────────────────────────────┘  │
└─────────────┬───────────────────────────────────┘
              │
              │ JSON Response
              │ { compliance_control: {...},
              │   beslutning: "GO/CONDITIONAL_GO/NO_GO",
              │   risiko_score: 85,
              │   kritiske_blokeringer: [...],
              │   betingelser: [...],
              │   påkrævede_artefakter: [...] }
              ▼
┌────────────────────────────────────────┐
│         Frontend Display               │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Decision Badge (GO/NO-GO)         │  │
│  │ Risk Score Progress Bar           │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 7 Point Breakdown                 │  │
│  │ (Accordion with scores per point) │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Action Items & Artefakter         │  │
│  │ (Downloadable checklist)          │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 3. Research Workflow

```
┌─────────────┐
│ User Query  │
│  Research   │
│   Form      │
└──────┬──────┘
       │
       │ POST /api/research/juridisk
       │ { emne: "GDPR Art 22", fokusområder: [...] }
       │
       ▼
┌────────────────────────────────────────┐
│        web_searcher.py                 │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Multi-Query Generation          │  │
│  │  ├─ "GDPR Article 22"            │  │
│  │  ├─ "automated decision making"  │  │
│  │  └─ "right to explanation"       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  DuckDuckGo Web Search           │  │
│  │  Priority sources:                │  │
│  │  ├─ eur-lex.europa.eu             │  │
│  │  ├─ datatilsynet.dk               │  │
│  │  ├─ edpb.europa.eu                │  │
│  │  └─ retsinformation.dk            │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Authority Scoring               │  │
│  │  ├─ EUR-Lex: 10/10               │  │
│  │  ├─ National authority: 9/10     │  │
│  │  ├─ Court decisions: 8/10        │  │
│  │  └─ Academic: 6/10               │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  LLM Summary Generation          │  │
│  │  ├─ Azure OpenAI gpt-4o-mini     │  │
│  │  ├─ Structured JSON output       │  │
│  │  └─ Cross-reference citations    │  │
│  └──────────────────────────────────┘  │
└─────────────┬───────────────────────────┘
              │
              │ JSON Response
              │ { summary: "...",
              │   key_findings: [...],
              │   sources: [{title, url, authority}],
              │   cross_references: [...] }
              ▼
┌────────────────────────────────────────┐
│         Frontend Display               │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Summary Card (dansk)              │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Key Findings                      │  │
│  │ (Bullet points with citations)    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Authoritative Sources             │  │
│  │ (Cards with authority badges)     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## API Endpoint Mapping

### Frontend Page → Backend Endpoint Mapping

| Frontend Page | API Endpoints Used | Data Flow |
|--------------|-------------------|-----------|
| **HomePage** | `/`, `/health`, `/api/version`, `/api/news/latest`, `/api/news/ticker` | Fetch system health, version info, news feed, and ticker on mount |
| **QuickCheckPage** | `/api/compliance/hurtig-tjek`, `/api/compliance/progress/{id}`, `/api/compliance/intermediate/{id}` | POST form → Poll progress → Display results with real-time updates |
| **FullAssessmentPage** | `/api/compliance/7-punkts-vurdering` | POST comprehensive form → Display structured decision + score |
| **ResearchPage** | `/api/research/juridisk` | POST research query → Display sources + LLM summary |
| **KnowledgeBasePage** | `/api/knowledge-base`, `/api/search/global`, `/api/knowledge-base/stats` | GET all terms, search across data, display stats |
| **AICasesPage** | `/api/ai-cases` (GET/POST) | List all cases, create new case with email notification |
| **AIProjectsPage** | `/api/ai-cases` | Display cases in project view |
| **DashboardPage** | `/api/compliance/assessments`, `/api/cache/stats` | Fetch assessment history, system metrics |
| **HistoryPage** | `/api/compliance/assessments`, `/api/compliance/assessment/{id}` | List assessments, view details |
| **ResourcesPage** | Static data (no API) | Display curated links |
| **SettingsPage** | localStorage only (no API) | User preferences |

### Complete API Endpoint Reference

#### Health & System
- `GET /` - Root endpoint (API info)
- `GET /health` - Overall health check
- `GET /api/version` - Git-based version info
- `GET /api/health/database` - Database connection status
- `POST /api/compliance/test-llm` - LLM connectivity test
- `POST /api/compliance/test-search` - Web search test
- `GET /api/cache/stats` - Cache statistics

#### Compliance Assessment
- `POST /api/compliance/hurtig-tjek` - Quick check (with web research)
- `GET /api/compliance/progress/{session_id}` - Progress tracking
- `GET /api/compliance/intermediate/{session_id}` - Intermediate results
- `POST /api/compliance/7-punkts-vurdering` - Full 7-point assessment
- `POST /api/compliance/analyser` - Legacy full assessment
- `GET /api/compliance/assessments` - List all assessments
- `GET /api/compliance/assessment/{id}` - Get specific assessment
- `POST /api/compliance/report/{id}/generate` - Generate report

#### Research & Knowledge
- `POST /api/research/juridisk` - Legal research with web search
- `GET /api/knowledge-base` - Get all KB items
- `POST /api/knowledge-base/update` - Trigger manual KB update
- `GET /api/knowledge-base/stats` - KB statistics
- `GET /api/search/global` - Global search (KB + cases + docs)

#### AI Cases Management
- `GET /api/ai-cases` - List all AI cases
- `POST /api/ai-cases` - Create new case (sends SMTP email)

#### News & Content
- `GET /api/news/latest` - Latest AI/legal news (RSS + LLM analysis)
- `POST /api/news/refresh` - Force news refresh
- `POST /api/news/llm-search` - LLM-powered news search
- `GET /api/news/ticker` - Tech news ticker
- `GET /api/news/ticker/stream` - Server-Sent Events stream

#### Agent Registry
- `GET /api/agents/registry` - List available agents
- `GET /api/agents/registry/{agent_id}` - Get agent config

#### Metadata & Utilities
- `GET /api/frameworks` - Supported compliance frameworks
- `GET /api/requirements/ai-act/{risk_level}` - AI Act requirements by risk
- `POST /api/documents/upload` - Document upload (future)
- `POST /api/ai/diagnose-issue` - AI-powered system diagnostics

---

## Agent System

### LangGraph Architecture

Systemet bruger **LangGraph StateGraph** (IKKE legacy AgentExecutor):

```python
from langgraph.graph import StateGraph, END

class ComplianceOrchestrator:
    def _build_workflow(self) -> StateGraph:
        workflow = StateGraph(ComplianceState)

        # Add nodes
        workflow.add_node("initialize", self._initialize_node)
        workflow.add_node("check_ai_act", self._check_ai_act_node)
        workflow.add_node("check_gdpr", self._check_gdpr_node)
        workflow.add_node("research_legal", self._legal_research_node)
        workflow.add_node("assess_risk", self._assess_risk_node)
        workflow.add_node("analyze_gaps", self._analyze_gaps_node)
        workflow.add_node("generate_report", self._generate_report_node)

        # Linear workflow
        workflow.set_entry_point("initialize")
        workflow.add_edge("initialize", "check_ai_act")
        workflow.add_edge("check_ai_act", "check_gdpr")
        workflow.add_edge("check_gdpr", "research_legal")
        workflow.add_edge("research_legal", "assess_risk")
        workflow.add_edge("assess_risk", "analyze_gaps")
        workflow.add_edge("analyze_gaps", "generate_report")
        workflow.add_edge("generate_report", END)

        return workflow.compile()
```

### Agent Types

1. **ComplianceOrchestrator** (`compliance_orchestrator.py`)
   - Main agent for full assessments
   - Linear StateGraph workflow
   - Coordinates AI Act + GDPR checkers

2. **QuickCheckAgent** (`quick_check_agent.py`)
   - Fast compliance screening
   - Parallel execution of checks
   - Web research integration

3. **ResearchOrchestrator** (`research_agent_langgraph.py`)
   - Legal research with web search
   - Multi-query generation
   - Authority scoring

### State Management

```python
from typing import TypedDict, List, Dict, Any

class ComplianceState(TypedDict):
    """Shared state across all agent nodes."""
    project: ProjectInput
    ai_act_analysis: Dict[str, Any]
    gdpr_analysis: Dict[str, Any]
    research_findings: List[Dict[str, Any]]
    risk_assessment: Dict[str, Any]
    compliance_gaps: List[str]
    recommendations: List[str]
    errors: List[str]
```

---

## Caching Strategy

### Two-Tier Caching System

#### 1. Memory Cache (LRU)
**File:** `src/cache/memory_cache.py`

```python
compliance_rules_cache = TTLCache(maxsize=100, ttl=3600)
legal_texts_cache = TTLCache(maxsize=50, ttl=7200)
```

**Cached Data:**
- Compliance rules (11 rules)
- Legal text snippets
- Sector-specific requirements
- Artifact templates

**TTL:** 3600s (1 hour)

#### 2. Disk Cache
**File:** `src/cache/disk_cache.py`

```python
CACHE_DIR = Path(".cache/")
TTL_DEFAULT = 3600  # 1 hour
```

**Cached Data:**
- Web research results
- News feeds (300s TTL)
- Knowledge base queries

#### 3. Cache Warming

On application startup:
```python
def warm_caches_on_startup(include_compliance=True, background=True):
    """Pre-load frequently accessed data."""
    # Load compliance rules
    # Load legal texts
    # Load sector mappings
```

**Benefits:**
- Faster first requests
- Reduced LLM API calls
- Lower latency

---

## Database Schema

### SQLite Schema (SQLAlchemy Models)

```python
class ComplianceControlAssessment(Base):
    __tablename__ = "compliance_control_assessments"

    id = Column(Integer, primary_key=True)
    system_navn = Column(String, nullable=False)
    system_beskrivelse = Column(Text)
    organisation = Column(String)
    beslutning = Column(String)  # GO/CONDITIONAL_GO/NO_GO
    risiko_score = Column(Float)
    risiko_niveau = Column(String)

    # 7 point scores
    punkt_1_score = Column(Float)
    punkt_2_score = Column(Float)
    # ... punkt_3 til punkt_7

    # Evidence & recommendations
    kritiske_blokeringer = Column(JSON)
    betingelser = Column(JSON)
    påkrævede_artefakter = Column(JSON)
    anbefalinger = Column(JSON)

    created_at = Column(DateTime, default=datetime.utcnow)
```

### JSON Storage

**Knowledge Base** (`data/knowledge_base.json`):
```json
[
  {
    "id": "gdpr-art-6",
    "term": "GDPR Artikel 6",
    "definition": "Legal basis for processing personal data",
    "category": "gdpr",
    "tags": ["legal_basis", "data_processing"],
    "auto_generated": false,
    "created_at": "2025-10-08T12:00:00Z"
  }
]
```

**AI Cases** (`data/ai_cases.json`):
```json
[
  {
    "id": "uuid-123",
    "title": "HR Recruitment AI",
    "description": "AI system for screening CVs",
    "created_at": "2025-10-11T10:00:00Z",
    "email_status": "sent"
  }
]
```

---

## Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────────┐
│         Developer Machine                │
│                                          │
│  Backend: python main.py (port 8000)    │
│  Frontend: npm start (port 8080)        │
│                                          │
│  Database: SQLite (compliance.db)       │
│  Cache: .cache/ directory               │
└─────────────────────────────────────────┘
```

### Docker Production

```yaml
# docker-compose.yml
services:
  backend:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://...
      - AZURE_OPENAI_API_KEY=...
    depends_on:
      - postgres

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    environment:
      - REACT_APP_API_BASE_URL=http://backend:8000

  postgres:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
```

### Scaling Considerations

**Horizontal Scaling:**
- Stateless backend (safe to run multiple instances)
- Shared PostgreSQL database
- Redis for distributed caching (future)

**Vertical Scaling:**
- LLM API calls are the bottleneck
- Consider rate limiting + queueing
- Implement request batching

---

## Security Considerations

### API Keys
- Stored in `.env` (never committed)
- Azure OpenAI API key required
- SMTP credentials for email

### Data Protection
- No sensitive data logged
- GDPR-compliant data handling
- Assessment data in SQLite (encrypted at rest recommended)

### CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # PRODUCTION: Specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Production:** Update `allow_origins` to specific domains.

---

## Performance Metrics

### Backend Response Times

| Endpoint | Average | 95th %ile |
|----------|---------|-----------|
| `/health` | 5ms | 10ms |
| `/api/compliance/hurtig-tjek` | 8-12s | 15s |
| `/api/compliance/7-punkts-vurdering` | 3-5s | 8s |
| `/api/research/juridisk` | 10-15s | 20s |
| `/api/knowledge-base` | 50ms | 100ms |

### Frontend Performance

- **First Contentful Paint:** <1.2s
- **Time to Interactive:** <2.5s
- **Largest Contentful Paint:** <2.5s
- **Cumulative Layout Shift:** <0.1

### Cache Hit Rates

- **Memory Cache:** ~85% hit rate (compliance rules)
- **Disk Cache:** ~70% hit rate (web research)

---

## Future Enhancements

### Planned Features

1. **Router Modules**
   - Split `main.py` into modular routers
   - `routers/compliance.py`, `routers/research.py`, etc.

2. **PostgreSQL Migration**
   - Move from SQLite to PostgreSQL
   - Alembic migrations ready

3. **Real-time Collaboration**
   - WebSocket support for live assessments
   - Multi-user editing

4. **Advanced Analytics**
   - Historical trend analysis
   - Compliance score over time
   - Risk heatmaps

5. **PDF Export**
   - Generate PDF reports from assessments
   - Include charts and signatures

---

## Maintenance & Monitoring

### Health Checks

```bash
# Overall system health
curl http://localhost:8000/health

# Database health
curl http://localhost:8000/api/health/database

# LLM connectivity
curl -X POST http://localhost:8000/api/compliance/test-llm

# Cache statistics
curl http://localhost:8000/api/cache/stats
```

### Logs

```bash
# Backend logs (stdout)
docker logs -f judge-dredd-backend

# Frontend logs
docker logs -f judge-dredd-frontend
```

### Scheduled Tasks

- **03:00 UTC:** Knowledge base auto-update
- **Every 5 min:** News feed refresh
- **Every 2 min:** Tech ticker refresh

---

## Contact & Support

**Udviklet af:** Kalundborg Kommune - Digitalisering og IT
**Version:** 0.8.0
**Sidst opdateret:** 11. Oktober 2025

For spørgsmål eller support, kontakt:
- **Email:** pavi@kalundborg.dk
- **GitHub Issues:** [Judge_dredd Repository](https://github.com/Parthee-Vijaya/Judge_dredd/issues)

---

**Document Status:** ✅ Complete and up-to-date
