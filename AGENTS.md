# Repository Guidelines

## Project Structure & Module Organization
- FastAPI backend lives in `src/`; `agents/` hosts LangGraph flows, `compliance/` implements scoring, `services/` wraps external APIs, and `utils/` collects shared helpers.
- Agent presets reside in `config/agents/*.yml`; database migrations stay in `alembic/` with `alembic.ini` controlling the target URL.
- Reference docs live in `docs/`, examples in `examples/`, scripts in `scripts/`, datasets in `data/`.
- React client is in `frontend/src/` with assets in `frontend/public/`; backend tests live in `tests/`, while UI tests sit next to their components.

## Build, Test, and Development Commands
- `python -m venv venv && source venv/bin/activate` then `pip install -r requirements.txt` bootstraps the backend environment.
- `npm run dev` runs `python main.py` and `npm start` together; ensure `.env` is populated first.
- `pytest` (or `pytest --cov=src`) exercises backend suites; `npm test -- --watch=false` covers the React layer without interactive prompts.
- `npm run build:frontend` prepares a production bundle, and `alembic upgrade head` applies schema changes once `alembic.ini` points at your database.

## Coding Style & Naming Conventions
- Python relies on 4-space indent, snake_case modules, and explicit type hints; align filenames with the primary service they expose.
- Format with `black src tests`, lint via `flake8 src tests`, and run `mypy src` whenever typed signatures change.
- React files follow PascalCase for components and camelCase exports for hooks; co-locate styled-components with the view they support.

## Testing Guidelines
- Place new backend tests in `tests/test_<feature>.py`; reuse fixtures like `example_7_step_request.json` instead of inventing payloads.
- Prefer async-aware pytest patterns and assert observable side effects instead of internals.
- Frontend tests should use React Testing Library with `screen` queries to catch accessibility regressions.

## Commit & Pull Request Guidelines
- Follow the Conventional Commit prefixes visible in history (`feat:`, `fix:`, `docs:`, scoped variants such as `feat(ui):`).
- PRs must summarise intent, link the relevant issue or ticket, note any schema or config updates, and list the commands you ran (`pytest`, `npm test`, migrations).
- Include before/after screenshots for UI work and call out follow-up tasks if scope was trimmed.

## Product Versioning
- Bump the visible product version for every completed batch of user-facing changes, including fixes, before building and presenting the result. Do not leave the previous version visible after shipping changes.
- `frontend/src/config/brand.js` (`BRAND.version`) is the source of truth. Use `npm run version:bump -- patch` for fixes and small improvements, `minor` for new functionality, or `major` for breaking changes. The command synchronizes both package manifests, their lockfile entries, and the current version in README.
- Add a dated entry to `CHANGELOG.md`. Run `npm run version:check`, rebuild the frontend, and verify the visible version through the actual local/Tailscale URL. Frontend start/build rejects inconsistent version metadata.
- Bump once per delivered batch, not on every save or repeat build. Documentation-only edits and generated news/cache updates do not need a product-version bump. Historical report versions and historical verification notes must retain their original numbers.

## Security & Configuration Tips
- Initialise secrets by copying `.env.example`; never commit live API keys or SMTP credentials.
- Track changes to `config/agents/*.yml` in the PR body so reviewers understand new research scopes or scoring weights.
- Review bind mounts in `docker-compose.yml` (notably `compliance.db` and `data/`) before sharing logs or snapshots outside trusted environments.
