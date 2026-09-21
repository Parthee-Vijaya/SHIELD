> **Historisk dokument:** Dette dokument beskriver tidligere udgaver af løsningen. Brug [SHIELD README](README.md) til den aktuelle arbejdsgang og lokale opstart. Versions-, port- og driftsoplysninger nedenfor kan være forældede.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Design System

**ALWAYS read [DESIGN.md](./DESIGN.md) before making any visual or UI decisions.**
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval. In QA mode, flag any code that doesn't match DESIGN.md.

**Brand:** Tyr ᛏ (tidligere Forseti / Hjemmel / Project Judge Dredd) — kommunal AI-compliance til Kalundborg Kommune. Northern Modern aesthetic, IBM Plex typography, kongelig blå + bronze palette. Hver hovedside har data-overview-section ved bunden.

## Project Overview

**Tyr** is an AI compliance platform built for Kalundborg Kommune (Denmark) that assesses AI systems against EU AI Act, GDPR, and Danish regulations. The platform uses a hybrid approach combining deterministic rule engines with LangGraph-based AI agents for intelligent compliance analysis.

**Tech Stack:**
- **Backend:** FastAPI + LangGraph + LangChain (v0.3.x patterns)
- **Frontend:** React 18 + Styled Components + Framer Motion
- **AI/LLM:** OpenAI GPT-4, Anthropic Claude
- **Database:** PostgreSQL + SQLAlchemy + Alembic migrations
- **Workspace:** NPM workspaces monorepo

---

## Development Commands

### Initial Setup

```bash
# Backend setup
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup (NPM workspace)
npm install  # Install from root (handles workspace)

# Environment configuration
cp .env.example .env
# Edit .env with API keys: OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
```

### Running the Application

```bash
# Run both backend and frontend concurrently
npm run dev

# Or run separately:
# Backend only (port 8000)
python main.py

# Frontend only (port 8080, BROWSER=none to prevent auto-open)
cd frontend && BROWSER=none npm start
```

### Database Operations

```bash
# Apply migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Rollback one migration
alembic downgrade -1
```

### Testing

```bash
# Backend tests
pytest                          # Run all tests
pytest --cov=src               # With coverage
pytest tests/test_specific.py  # Single test file

# Frontend tests
cd frontend && npm test -- --watch=false  # Non-interactive
npm run test:frontend                      # From root
```

### Building & Deployment

```bash
# Frontend production build
npm run build:frontend

# Docker deployment
docker-compose up --build

# Clean install (if NPM workspace conflicts)
npm run clean && npm install
```

---

## Architecture & Code Organization

### Backend Structure (`src/`)

**Key architectural principle:** Hybrid compliance system = Deterministic rule engine + LLM-powered analysis

```
src/
├── agents/                      # LangGraph-based AI agents
│   ├── compliance_orchestrator.py   # Main workflow orchestrator (StateGraph)
│   ├── quick_check_agent.py         # Fast compliance screening
│   ├── research_agent_langgraph.py  # Legal research with web search
│   └── registry.py                  # Agent configuration registry
│
├── compliance/                  # Compliance checkers & engines
│   ├── compliance_control_engine.py  # 7-point assessment engine
│   ├── ai_act_checker.py            # EU AI Act risk classification
│   ├── gdpr_checker.py              # GDPR compliance checking
│   └── recommendation_engine.py     # Intelligent recommendations
│
├── compliance_engine.py         # Deterministic rule engine (GO/NO-GO)
│
├── database/                    # Persistence layer
│   ├── models.py               # SQLAlchemy models
│   ├── connection.py           # DB session management
│   ├── compliance_service.py   # Business logic layer
│   └── qdrant_service.py       # Vector database integration
│
├── research/                    # Web research & search
│   └── web_searcher.py         # DuckDuckGo + LLM research
│
├── services/                    # Background services
│   ├── knowledge_base_updater.py  # Auto KB updates (scheduled 03:00)
│   └── NewsService, TechTickerService  # News aggregation
│
├── cache/                       # Caching infrastructure
│   ├── disk_cache.py           # Persistent cache
│   ├── memory_cache.py         # In-memory LRU cache
│   └── cache_warmer.py         # Startup cache warming
│
├── core/                        # Core models & utilities
│   ├── models.py               # Pydantic models
│   └── news_models.py          # News feed models
│
└── utils/                       # Shared utilities
```

**FastAPI Entry Point:** `main.py` (1669 lines) - Main application with all API endpoints

### Frontend Structure (`frontend/src/`)

```
frontend/src/
├── pages/                       # Route-level components
│   ├── HomePage.js             # Landing page with stats
│   ├── QuickCheckPage.js       # Quick compliance check
│   ├── AISagerPage.js          # AI cases management
│   ├── KnowledgeBasePage.js    # Dynamic knowledge base
│   ├── ResearchPage.js         # Legal research tool
│   └── DashboardPage.js        # Analytics dashboard
│
├── components/                  # Reusable UI components
│   ├── Sidebar.js              # Collapsible navigation
│   ├── NewsSection.js          # News feed integration
│   ├── NewsTicker.js           # Real-time ticker
│   └── SkeletonLoader.js       # Loading states
│
├── data/                        # Static data
│   ├── statsData.js            # 100+ Kalundborg Kommune stats
│   └── aiActDidYouKnow.js      # Educational content
│
└── App.js                       # Main app component + routing
```

---

## Critical Architectural Patterns

### 1. LangGraph Agent Pattern (Modern 2025 Approach)

**DO:** Use LangGraph `StateGraph` for all agent workflows
```python
from langgraph.graph import StateGraph, END

class ComplianceOrchestrator:
    def _build_workflow(self) -> StateGraph:
        workflow = StateGraph(ComplianceState)

        # Add nodes
        workflow.add_node("initialize", self._initialize_node)
        workflow.add_node("check_ai_act", self._check_ai_act_node)
        workflow.add_node("check_gdpr", self._check_gdpr_node)

        # Define edges
        workflow.set_entry_point("initialize")
        workflow.add_edge("initialize", "check_ai_act")
        workflow.add_edge("check_ai_act", "check_gdpr")
        workflow.add_edge("check_gdpr", END)

        return workflow.compile()
```

**DON'T:** Use legacy `AgentExecutor` patterns (deprecated in LangChain 0.3+)

### 2. Hybrid Compliance Engine

The system combines two approaches:

**A) Deterministic Rule Engine** (`compliance_engine.py`):
- Hard-coded compliance rules
- GO / CONDITIONAL_GO / NO_GO decisions
- Evidence catalog system
- Traceable compliance decisions

**B) LLM-Powered Analysis** (via agents):
- Nuanced interpretation
- Web research integration
- Precedent analysis
- Natural language summaries

### 3. Progressive Assessment Levels

1. **Quick Check** (`/api/compliance/hurtig-tjek`) - Fast screening with web research
2. **7-Point Assessment** (`/api/compliance/7-punkts-vurdering`) - Structured compliance control
3. **Full Assessment** (`/api/compliance/analyser`) - Comprehensive analysis with DPIA

### 4. Caching Strategy

- **Disk Cache:** Persistent caching for web research, news feeds (`src/cache/disk_cache.py`)
- **Memory Cache:** In-memory LRU for hot data (`src/cache/memory_cache.py`)
- **Cache Warming:** Startup pre-loading (`warm_caches_on_startup()`)
- **Cache Validation:** Health checks via `/api/cache/stats`

### 5. Scheduled Background Tasks

Using APScheduler for periodic operations:
```python
# Knowledge base auto-update (daily at 03:00)
kb_scheduler.add_job(
    scheduled_kb_update,
    CronTrigger(hour=3, minute=0),
    id='kb_daily_update'
)
```

---

## Key API Endpoints

### Compliance Assessment
- `POST /api/compliance/hurtig-tjek` - Quick check with web research
- `POST /api/compliance/7-punkts-vurdering` - Structured 7-point assessment
- `POST /api/compliance/analyser` - Full compliance analysis
- `GET /api/compliance/progress/{session_id}` - Real-time progress tracking
- `GET /api/compliance/intermediate/{session_id}` - Phase-by-phase results

### Knowledge & Research
- `GET /api/knowledge-base` - Retrieve knowledge base items
- `POST /api/knowledge-base/update` - Trigger manual KB update
- `POST /api/research/juridisk` - Legal research with web search
- `GET /api/search/global` - Global search across KB, cases, docs

### AI Cases Management
- `GET /api/ai-cases` - List all AI cases
- `POST /api/ai-cases` - Create case (sends SMTP notification)

### News & Content
- `GET /api/news/latest` - Latest AI/legal news
- `GET /api/news/ticker` - International tech news ticker
- `GET /api/news/ticker/stream` - SSE stream for ticker

### System Health
- `GET /health` - Overall health check
- `GET /api/health/database` - Database connection status
- `GET /api/cache/stats` - Cache statistics

---

## Testing Patterns

### Backend Testing (`tests/`)

```python
# Test example files to reference:
# - example_7_step_request.json
# - test_compliance_api.json
# - test_request.json

# Async test pattern
@pytest.mark.asyncio
async def test_quick_check():
    request = QuickCheckRequest(
        beskrivelse="Test AI system",
        ai_type="predictive_ai",
        sektor="Healthcare",
        behandler_persondata=True
    )
    result = await hurtig_compliance_tjek(request)
    assert result["ai_act"]["risk_level"] in ["high", "limited", "minimal"]
```

### Frontend Testing

Use React Testing Library with accessibility-first queries:
```javascript
import { render, screen } from '@testing-library/react';

test('renders knowledge base', () => {
  render(<KnowledgeBasePage />);
  const heading = screen.getByRole('heading', { name: /videnbase/i });
  expect(heading).toBeInTheDocument();
});
```

---

## Styling & Design System

### Kalundborg Kommune Brand Colors

```css
/* Primary Brand Color - Teglrød (Brick Red) */
--kalundborg-primary: #C94416;
--kalundborg-primary-dark: #A03612;
--kalundborg-primary-light: #E85A28;
```

Apply to:
- Primary buttons and CTAs
- Links and hover states
- Active navigation items
- Focus states

### Styled Components Pattern

```javascript
import styled from 'styled-components';

const PrimaryButton = styled.button`
  background: var(--kalundborg-primary);
  color: white;
  transition: all 0.3s ease;

  &:hover {
    background: var(--kalundborg-primary-dark);
    transform: translateY(-2px);
  }
`;
```

Refer to `DESIGN_SYSTEM.md` for complete color palette, typography, and component specifications.

---

## Environment Variables

**Critical variables** (see `.env.example`):

```bash
# AI Models
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_LLM_MODEL=gpt-4o-mini

# Azure OpenAI (optional)
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_API_KEY=...
AZURE_DEPLOYMENT_NAME=gpt-4o

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/compliance_db
QDRANT_URL=http://localhost:6333

# SMTP (for AI cases email)
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_USER=
SMTP_PASSWORD=
SMTP_USE_TLS=false
SMTP_FROM=no-reply@kalundborg.dk
AI_CASES_RECIPIENT=ServicePortalen@kalundborg.dk
AI_CASES_CC=pavi@kalundborg.dk

# Features
ENABLE_CACHING=True
NEWS_REFRESH_INTERVAL_SECONDS=300
```

---

## NPM Workspace Management

**Root workspace structure:**
```json
{
  "workspaces": ["frontend"],
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "python3 main.py",
    "dev:frontend": "cd frontend && PORT=8080 BROWSER=none npm start"
  }
}
```

**Resolving workspace conflicts:**
```bash
# Full reset
npm run clean && npm install

# Debug workspace issues
npm ls <package>            # Find version conflicts
npm list --workspaces       # See all workspace dependencies
```

**Key workspace rules:**
- Always run `npm install` from root directory
- Frontend uses `proxy: "http://localhost:8000"` to connect to backend
- Use `BROWSER=none` to prevent auto-opening browser on `npm start`

---

## Code Style & Conventions

### Python
- **Formatting:** `black src tests` (4-space indent)
- **Linting:** `flake8 src tests`
- **Type checking:** `mypy src`
- **Naming:** snake_case for modules/functions, PascalCase for classes
- **Type hints:** Always use for function signatures

### React/JavaScript
- **Components:** PascalCase (e.g., `QuickCheckPage.js`)
- **Hooks/utilities:** camelCase exports
- **Styled components:** Co-locate with component files
- **Props:** Use PropTypes or TypeScript interfaces

### Commit Messages

Follow Conventional Commits (visible in git history):
```
feat: Add 7-point assessment engine
feat(ui): Update Kalundborg brand colors
fix: Resolve NPM workspace conflicts
docs: Update API documentation
```

---

## Common Workflows

### Adding a New Compliance Rule

1. **Add rule to `compliance_engine.py`:**
```python
ComplianceRule(
    rule_id="AI_ACT_042",
    category=RuleCategory.AI_ACT,
    description="New requirement description",
    conditions={"field_name": expected_value},
    outcomes={"decision": "conditional-go", "blocker": "Requirement details"},
    severity="warning",
    weight=5.0
)
```

2. **Test the rule:**
```python
pytest tests/test_compliance_engine.py -k test_new_rule
```

3. **Document in knowledge base** (`data/knowledge_base.json`)

### Adding a New Agent Node

1. **Define state schema:**
```python
class MyAgentState(TypedDict):
    input: str
    result: Optional[str]
    errors: List[str]
```

2. **Create node function:**
```python
async def _my_node(self, state: MyAgentState) -> MyAgentState:
    # Node logic
    return {"result": "processed"}
```

3. **Add to workflow:**
```python
workflow.add_node("my_node", self._my_node)
workflow.add_edge("previous_node", "my_node")
```

### Adding a New Frontend Page

1. **Create page component** (`frontend/src/pages/MyPage.js`)
2. **Add route** in `App.js`:
```javascript
<Route path="/my-page" element={<MyPage />} />
```
3. **Add navigation** in `Sidebar.js`
4. **Follow design system** from `DESIGN_SYSTEM.md`

---

## Troubleshooting

### LangChain Version Issues

If you see `@tool(name="...")` deprecation warnings:
```python
# Old (pre-0.3)
@tool(name="research_legal")

# New (0.3+)
@tool(args_schema=ResearchInput)
```

### Database Connection Errors

```bash
# Check database health
curl http://localhost:8000/api/health/database

# Verify connection string
echo $DATABASE_URL

# Test connection
python -c "from src.database.connection import check_db_connection; print(check_db_connection())"
```

### NPM Workspace Conflicts

```bash
# Clean slate
npm run clean
npm install

# If issues persist, check Node/npm versions
node --version  # Should be >= 18.0.0
npm --version   # Should be >= 9.0.0
```

### Cache Issues

```bash
# Clear all caches
rm -rf .cache/
python -c "from src.cache.disk_cache import clear_cache; clear_cache()"

# Check cache health
curl http://localhost:8000/api/cache/stats
```

---

## Documentation References

- **README.md** - Installation, features, version history
- **AGENTS.md** - Repository guidelines and commit conventions
- **ARCHITECTURE_REVIEW.md** - Detailed architecture analysis
- **DESIGN_SYSTEM.md** - Complete UI/UX specifications
- **CACHING.md** - Caching architecture and strategies
- **DATABASE_SETUP.md** - Database configuration guide
- **DOCKER.md** - Docker deployment instructions

For questions about specific modules, refer to inline docstrings and type hints in the codebase.
