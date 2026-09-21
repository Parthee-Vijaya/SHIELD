# Engineering Architecture

## Tech Stack

### Backend
- **Framework:** FastAPI 0.115.0
- **AI/LLM:**
  - LangChain 0.3.7
  - LangGraph 0.2.45 (multi-agent orchestration)
  - OpenAI GPT-4 / Anthropic Claude
- **Database:** PostgreSQL + Qdrant (vector DB)
- **Server:** Uvicorn (ASGI)

### Frontend
- **Framework:** React 18.2
- **Routing:** React Router 6.3
- **State:** React Context API + React Query
- **Styling:** Styled Components 5.3
- **UI Libraries:**
  - Framer Motion (animations)
  - React Icons
  - Chart.js (data visualization)
  - React Hot Toast (notifications)
  - React Hook Form (forms)

### DevOps
- **Containerization:** Docker + Docker Compose
- **Development:** Python venv, npm workspaces
- **Testing:** pytest (backend), Jest/React Testing Library (frontend)
- **Logging:** Python logging + loguru
- **Monitoring:** Prometheus client

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Frontend (React)               │
│  - Pages (QuickCheck, Research, Knowledge)     │
│  - Components (Navbar, NewsSection, etc.)      │
│  - Contexts (Loading, UserPreferences)         │
└────────────────┬────────────────────────────────┘
                 │ HTTP/REST API
                 │ (axios)
┌────────────────▼────────────────────────────────┐
│              Backend (FastAPI)                  │
│  - main.py (API endpoints)                      │
│  - CORS middleware                              │
│  - Background tasks (news refresh)              │
└─────┬───────────────────────┬───────────────────┘
      │                       │
      ▼                       ▼
┌─────────────┐      ┌────────────────────┐
│ Compliance  │      │   Agent System     │
│  Checkers   │      │   (LangGraph)      │
│             │      │                    │
│ - AI Act    │      │ - Orchestrator     │
│ - GDPR      │      │ - Research Agent   │
│ - 7-punkts  │      │ - Compliance Agent │
└─────────────┘      └────────────────────┘
      │                       │
      ▼                       ▼
┌──────────────────────────────────────────┐
│         External Services                │
│  - OpenAI API (GPT-4)                    │
│  - Anthropic API (Claude)                │
│  - Web scraping (Datatilsynet, news)    │
└──────────────────────────────────────────┘
```

## Key Modules

### Backend Structure
```
src/
├── agents/
│   ├── __init__.py (agent registry)
│   ├── compliance_orchestrator.py (main orchestrator)
│   └── research_agent.py (web research)
├── compliance/
│   ├── ai_act_checker.py (EU AI Act compliance)
│   └── gdpr_checker.py (GDPR compliance)
├── compliance_engine.py (7-punkts vurdering)
├── core/
│   ├── models.py (Pydantic models)
│   └── news_models.py (news data models)
├── services/
│   ├── news_service.py (news aggregation)
│   └── ticker_service.py (tech news ticker)
└── utils/
    └── version.py (version info)
```

### Frontend Structure
```
frontend/src/
├── components/
│   ├── Navbar.js (navigation)
│   ├── Sidebar.js (sidebar navigation)
│   ├── NewsSection.js (news display)
│   ├── NewsTicker.js (scrolling ticker)
│   ├── AdvancedSearch.js (search UI)
│   └── ErrorBoundary.js (error handling)
├── pages/
│   ├── HomePage.js
│   ├── QuickCheckPage.js
│   ├── ResearchPage.js
│   ├── KnowledgeBasePage.js
│   ├── AICasesPage.js
│   ├── HistoryPage.js
│   └── SettingsPage.js
├── contexts/
│   ├── LoadingContext.js (global loading state)
│   └── UserPreferencesContext.js (user settings)
├── hooks/
│   └── useLoading.js (loading hook)
└── utils/
    ├── fagomraadeOptions.js (domain options)
    └── newsSourceMap.js (news source mapping)
```

## Data Flow

### 7-Punkts Vurdering Flow
1. User submits form på frontend (AICasesPage eller via API)
2. Frontend POST til `/api/compliance/7-punkts-vurdering`
3. Backend `compliance_controller.assess_7_step()` kaldes
4. ComplianceOrchestrator orchestrator multiple agents:
   - AI Act checker
   - GDPR checker
   - Research agent (hvis nødvendigt)
5. Generate comprehensive report med:
   - Risk assessment
   - Compliance scores
   - Action plan
   - Resource recommendations
6. Return JSON response til frontend
7. Frontend viser struktureret rapport

### Research Agent Flow
1. User query på ResearchPage
2. Frontend POST til `/api/research`
3. Backend `run_research_agent()` kaldes
4. LangGraph agent:
   - Dekomponerer query
   - Søger knowledge base
   - Web research (hvis enabled)
   - Synthesizer findings
5. Return structured answer
6. Frontend viser svar med sources

## Configuration

### Environment Variables
```env
# AI Models
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_LLM_MODEL=gpt-4o-mini

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/compliance_db
QDRANT_URL=http://localhost:6333

# API Settings
API_HOST=0.0.0.0
API_PORT=8000
SECRET_KEY=your-secret-key

# Features
ENABLE_CACHING=True
DEBUG_MODE=False
NEWS_REFRESH_INTERVAL_SECONDS=300
TICKER_STREAM_INTERVAL_SECONDS=120

# Email (for AI Cases)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASSWORD=password
AI_CASES_RECIPIENT=compliance@example.com
```

## Security Considerations
- API key management via environment variables
- CORS configuration (restrictive in production)
- Input validation via Pydantic models
- GDPR-compliant data handling
- No sensitive data storage without encryption
- Audit trails for compliance assessments
