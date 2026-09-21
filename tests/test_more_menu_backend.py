"""Offline regressions for the secondary tools; never invoke a real model."""

import asyncio
from datetime import datetime
from io import BytesIO
import json
import sys
from types import SimpleNamespace

from docx import Document
import pytest

import main
from src.law import law_assistant, law_data
from src.research.web_searcher import WebSearcher, Source, validate_focus_areas
from src.rule_engine.signal_extractor import SignalExtractor, _signals_for_rule
from src.services import codex_text_provider
from tests import test_dpia_ai as fixtures

api = fixtures.api
database = fixtures.database


def test_law_endpoint_keeps_rate_limit_headers_instead_of_500(api, monkeypatch):
    monkeypatch.setattr(main.limiter, "enabled", True)
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: False)
    monkeypatch.setattr(
        law_assistant, "_retrieve_sources", lambda *args: ([], {"mode": "keyword"})
    )
    response = api.post(
        "/api/law/ask", json={"query": "GDPR konsekvensanalyse", "mode": "keyword"}
    )
    assert response.status_code == 200, response.text
    assert response.headers.get("x-ratelimit-limit")
    assert response.json()["sources"] == []
    assert response.json()["confidence"] == 0


def test_keyword_search_does_not_return_laws_just_because_of_stopwords(monkeypatch):
    monkeypatch.setattr(
        law_data,
        "get_all_laws",
        lambda: [
            {
                "title": "Straffeloven § 1",
                "summary": "Regler for det område som loven gælder for",
                "content": "Hvad der gælder for en lov.",
            }
        ],
    )
    assert (
        law_data.search_laws("Hvad siger GDPR om konsekvensanalyse for en AI-løsning?")
        == []
    )
    assert law_data.search_laws("Hvad siger Straffeloven?")


def test_research_stream_and_post_use_selected_focus_with_real_rate_limiter(
    api, monkeypatch
):
    captured = []

    class Searcher:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

        async def research_topic(self, **kwargs):
            captured.append(kwargs["focus_areas"])
            return {"sources": [], "summary": "Ingen kilder fundet."}

    import src.research.web_searcher as research

    monkeypatch.setattr(research, "WebSearcher", Searcher)
    monkeypatch.setattr(main.limiter, "enabled", True)
    response = api.get(
        "/api/research/juridisk/stream",
        params=[
            ("emne", "GDPR konsekvensanalyse"),
            ("focus_areas", "GDPR"),
            ("focus_areas", "Databeskyttelse"),
        ],
    )
    assert response.status_code == 200
    assert captured == [["GDPR", "Databeskyttelse"]]
    assert '"status": "complete"' in response.text
    assert (
        api.get(
            "/api/research/juridisk/stream",
            params={"emne": "GDPR", "focus_areas": "fake"},
        ).status_code
        == 422
    )
    response = api.post(
        "/api/research/juridisk",
        json={"emne": "GDPR konsekvensanalyse", "fokusområder": ["GDPR"]},
    )
    assert response.status_code == 200, response.text
    assert response.headers.get("x-ratelimit-limit")


def test_research_never_invents_sources_when_search_is_empty(monkeypatch):
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: False)
    searcher = WebSearcher()
    searcher.openai_api_key = searcher.azure_api_key = None
    searcher.use_azure = False

    async def empty(*args, **kwargs):
        return []

    for method in (
        "_search_eur_lex",
        "_search_datatilsynet",
        "_search_retsinformation",
        "_search_eu_official",
        "_search_edpb_guidelines",
        "_search_google",
        "_search_duckduckgo",
    ):
        monkeypatch.setattr(searcher, method, empty)
    result = asyncio.run(
        searcher.research_topic("GDPR afprøvning", focus_areas=["GDPR"])
    )
    assert result["sources"] == []
    assert result["citations"] == []
    assert result["status"] == "no_sources" and result["warnings"]
    assert result["llm_provider"] is None
    assert "Placeholder" not in json.dumps(result)


def test_duckduckgo_processes_every_result_and_unwraps_redirects(monkeypatch):
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: False)
    searcher = WebSearcher()
    html = '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fone">One</a><a class="result__a" href="https://example.org/two">Two</a>'

    class Response:
        status = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

        async def text(self):
            return html

    searcher.session = SimpleNamespace(get=lambda *a, **kw: Response())
    fetched = []

    async def fetch(url):
        fetched.append(url)
        return Source(
            "Fetched", url, "Læsbar kilde om GDPR", "example.org", datetime.now()
        )

    monkeypatch.setattr(searcher, "_fetch_source", fetch)
    result = asyncio.run(searcher._search_duckduckgo("GDPR", limit=2))
    assert fetched == ["https://example.org/one", "https://example.org/two"]
    assert [source.title for source in result] == ["One", "Two"]


@pytest.mark.parametrize("error", [TimeoutError, RuntimeError])
def test_model_probe_failure_never_reports_mock_success(monkeypatch, error):
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: False)

    async def fail(coroutine, **kwargs):
        coroutine.close()
        raise error("private runtime detail")

    monkeypatch.setattr(main.asyncio, "wait_for", fail)
    response = asyncio.run(main.test_llm({}))
    body = json.loads(response.body)
    assert response.status_code == 503
    assert body["success"] is False and body["model"] is None
    assert "mock" not in str(body) and "private runtime" not in str(body)


def test_law_stream_error_has_no_successful_final_event(monkeypatch):
    monkeypatch.setattr(
        law_assistant,
        "_retrieve_sources",
        lambda *a: (
            [{"title": "Lov", "content": "Læsbar lovtekst"}],
            {"mode": "keyword"},
        ),
    )

    class Provider:
        def is_configured(self):
            return True

        def stream_chat(self, **kwargs):
            raise RuntimeError("private provider detail")
            yield

    monkeypatch.setattr(law_assistant, "_LLMProvider", Provider)

    async def collect():
        return [
            event
            async for event in law_assistant.LawAssistant().ask_stream("Lovspørgsmål")
        ]

    events = asyncio.run(collect())
    assert events[-1]["event"] == "error"
    assert not any(event["event"] == "final" for event in events)
    assert "private provider" not in str(events)


def test_codex_law_answer_carries_actual_model_without_extra_calls(monkeypatch):
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: True)
    calls = []

    def generate(system, user, max_tokens):
        calls.append((system, user))
        return "Kataloguddraget kræver kontrol [1].\nNØGLEPUNKTER:\n- Afklar aktualitet.\nOPFØLGNING:\n- Hvilken version gælder?"

    monkeypatch.setattr(codex_text_provider, "generate_text", generate)
    monkeypatch.setattr(
        law_assistant,
        "_retrieve_sources",
        lambda *a: (
            [{"title": "Lov", "content": "Læsbar lovtekst"}],
            {"mode": "keyword"},
        ),
    )
    result = asyncio.run(law_assistant.LawAssistant().ask("Lovspørgsmål"))
    assert len(calls) == 1
    assert result["model"] == codex_text_provider.MODEL
    assert result["provider"] == codex_text_provider.PROVIDER
    assert result["retrieval"]["warnings"]


def test_codex_signal_batch_is_one_call_and_requires_strict_values_and_quotes():
    rules = main._v3_load_rules()
    expected = sorted({name for rule in rules for name in _signals_for_rule(rule)})
    text = (
        "Kommunen anvender kunstig intelligens. Der behandles ikke personoplysninger."
    )

    class Client:
        provider = "codex_local"
        calls = 0

        def invoke(self, prompt):
            self.calls += 1
            return json.dumps(
                {
                    "signals": {
                        expected[0]: {
                            "value": True,
                            "quote": "Kommunen anvender kunstig intelligens.",
                        },
                        expected[1]: {
                            "value": "false",
                            "quote": "Der behandles ikke personoplysninger.",
                        },
                        expected[2]: {
                            "value": False,
                            "quote": "Opdigtet citat uden kildegrundlag",
                        },
                        "invented.approval": {
                            "value": True,
                            "quote": "Kommunen anvender kunstig intelligens.",
                        },
                    },
                    "predicates": {},
                }
            )

    client = Client()
    extractor = SignalExtractor(llm=client)
    assert extractor.extract(text, rules) == {expected[0]: True}
    assert expected[1] in extractor.last_uncertain_signals
    assert expected[2] in extractor.last_uncertain_signals
    for rule in rules:
        assert extractor.extract_predicates_for_rule(text, rule) == {}
    assert client.calls == 1


def make_document():
    document = Document()
    document.add_paragraph(
        "Kommunen anvender kunstig intelligens til offentlige tekster."
    )
    output = BytesIO()
    document.save(output)
    return output.getvalue()


def test_document_upload_without_model_stops_before_persistence(
    api, database, monkeypatch
):
    from src.rule_engine.audit import V3AssessmentLog

    monkeypatch.setattr(main, "_v3_signal_extractor", lambda: SignalExtractor(llm=None))
    response = api.post(
        "/api/v3/document/analyze",
        files={"file": ("synthetic.docx", make_document())},
        data={"case_id": "QA-ONLY", "note": "Syntetisk afprøvning"},
    )
    assert response.status_code == 422, response.text
    with database() as db:
        assert db.query(V3AssessmentLog).count() == 0


@pytest.mark.parametrize("storage_failure", [False, True])
def test_document_multipart_metadata_case_link_and_storage_are_atomic(
    api, database, monkeypatch, tmp_path, storage_failure
):
    from src.database import connection
    from src.database.cases import Case
    from src.database.case_workspace import CaseWorkspaceReference
    from src.database.legal_monitoring import CaseLegalDependency
    from src.services.law_change_impact import register_legal_source_version
    from src.rule_engine.audit import V3AssessmentLog
    from src.services import document_storage

    monkeypatch.setattr(connection, "SessionLocal", database)
    monkeypatch.setenv("DOCUMENT_STORAGE_DIR", str(tmp_path / "documents"))
    case_id, _ = fixtures.create_base(database)
    with database() as db:
        old_case = db.get(Case, case_id).to_dict()
    rules = main._v3_load_rules()
    with database() as db:
        for rule in rules:
            register_legal_source_version(
                db,
                source_key=f"rule:{rule.id}",
                title=rule.kilde.lov,
                authority="Synthetic authority",
                source_url=str(rule.kilde.url),
                content_sha256="a" * 64,
            )
        db.commit()

    class Extractor:
        is_configured = True

        def extract(self, *args):
            return {name: True for rule in rules for name in _signals_for_rule(rule)}

        def extract_predicates_for_rule(self, *args):
            return {}

    monkeypatch.setattr(main, "_v3_signal_extractor", Extractor)
    if storage_failure:

        def fail(*args, **kwargs):
            raise OSError("unavailable storage")

        monkeypatch.setattr(document_storage, "store", fail)
    monkeypatch.setattr(main.limiter, "enabled", True)
    response = api.post(
        "/api/v3/document/analyze",
        files={"file": ("synthetic.docx", make_document())},
        data={
            "case_id": "QA-REFERENCE",
            "case_db_id": case_id,
            "note": "Syntetisk note som skal gemmes",
        },
    )
    if storage_failure:
        assert response.status_code == 503, response.text
        with database() as db:
            assert db.query(V3AssessmentLog).count() == 0
            assert db.get(Case, case_id).to_dict() == old_case
            assert db.query(CaseLegalDependency).count() == 0
    else:
        assert response.status_code == 200, response.text
        assert response.headers.get("x-ratelimit-limit")
        data = response.json()
        assert data["case_db_id"] == case_id
        with database() as db:
            entry = db.get(V3AssessmentLog, data["audit_log_id"])
            assert entry.request_payload["case_id"] == "QA-REFERENCE"
            assert entry.request_payload["case_db_id"] == case_id
            assert entry.note == "Syntetisk note som skal gemmes"
            dependencies = (
                db.query(CaseLegalDependency).filter_by(case_db_id=case_id).all()
            )
            triggered_ids = {
                item["rule_id"] for item in data["decisions"] if item["triggered"]
            }
            assert triggered_ids
            assert {item.legal_source.source_key for item in dependencies} == {
                f"rule:{rule_id}" for rule_id in triggered_ids
            }
            assert all(
                item.assessment_reference_id == entry.id for item in dependencies
            )
            assert (
                db.query(CaseWorkspaceReference)
                .filter_by(case_db_id=case_id, reference_id=entry.id)
                .count()
                == 1
            )
        assert document_storage.find(data["audit_log_id"])


@pytest.mark.parametrize("provider", ["lm_studio", "azure", "openai", "codex"])
@pytest.mark.parametrize(
    "completion", ["", "  \n\t", None, [], {"text": "OK"}, 42, "  Faktisk modelsvar  "]
)
def test_model_probe_requires_actual_nonempty_text(monkeypatch, provider, completion):
    import httpx

    for name in (
        "LM_STUDIO_BASE_URL",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_API_KEY",
        "OPENAI_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(
        codex_text_provider, "is_available", lambda: provider == "codex"
    )
    monkeypatch.setattr(
        codex_text_provider, "generate_text", lambda *a, **kw: completion
    )

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, *args, **kwargs):
            return SimpleNamespace(
                status_code=200,
                json=lambda: {"choices": [{"message": {"content": completion}}]},
            )

    monkeypatch.setattr(httpx, "AsyncClient", Client)
    fake_llm = lambda **kw: SimpleNamespace(
        invoke=lambda *a: SimpleNamespace(content=completion)
    )
    monkeypatch.setitem(
        sys.modules,
        "langchain_openai",
        SimpleNamespace(AzureChatOpenAI=fake_llm, ChatOpenAI=fake_llm),
    )
    if provider == "lm_studio":
        monkeypatch.setenv("LM_STUDIO_BASE_URL", "http://synthetic.invalid/v1")
    elif provider == "azure":
        monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://synthetic.invalid")
        monkeypatch.setenv("AZURE_OPENAI_API_KEY", "synthetic-not-a-secret")
    elif provider == "openai":
        monkeypatch.setenv("OPENAI_API_KEY", "synthetic-not-a-secret")
    result = asyncio.run(main.test_llm({}))
    if isinstance(completion, str) and completion.strip():
        assert result["success"] is True
        assert result["response"] == "Faktisk modelsvar"
    else:
        assert result.status_code == 503
        body = json.loads(result.body)
        assert body["success"] is False and body["model"] is None
        assert "response" not in body


def test_codex_research_never_uses_cloud_helpers_or_cloud_discovery(monkeypatch):
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: True)
    searcher = WebSearcher()
    searcher.openai_api_key = "synthetic-not-a-secret"
    searcher.azure_api_key = "synthetic-not-a-secret"
    searcher.use_azure = True
    calls = []

    def generate(*args, **kwargs):
        calls.append(args)
        return json.dumps(
            {
                "answer": "Kildebaseret svar [1].",
                "key_points": ["Vigtig oplysning"],
                "recommendations": ["Afklar oplysningerne med jura."],
                "citations": [
                    {"source_index": 1, "quote": "Kilde med konkrete oplysninger"}
                ],
            }
        )

    monkeypatch.setattr(codex_text_provider, "generate_text", generate)

    async def forbidden(*args, **kwargs):
        raise AssertionError(
            "Cloud model helpers must not be used under explicit local opt-in"
        )

    async def empty(*args, **kwargs):
        return []

    async def found(*args, **kwargs):
        return [
            Source(
                "Kilde",
                "https://example.org/law",
                "Kilde med konkrete oplysninger",
                "example.org",
                datetime.now(),
            )
        ]

    for method in (
        "_search_datatilsynet",
        "_search_retsinformation",
        "_search_eu_official",
        "_search_edpb_guidelines",
        "_search_google",
        "_search_duckduckgo",
    ):
        monkeypatch.setattr(searcher, method, empty)
    monkeypatch.setattr(searcher, "_search_eur_lex", found)
    for method in (
        "_llm_discover_sources",
        "_generate_cross_references",
        "_extract_key_findings_with_llm",
        "_generate_recommendations_with_llm",
    ):
        monkeypatch.setattr(searcher, method, forbidden)
    result = asyncio.run(searcher.research_topic("GDPR", ["GDPR"]))
    assert len(calls) == 1
    assert result["llm_provider"] == codex_text_provider.PROVIDER
    assert result["model"] == codex_text_provider.MODEL
    assert result["key_findings"] == ["Vigtig oplysning"]
    assert result["recommendations"] == ["Afklar oplysningerne med jura."]
    assert (
        result["llm_answer_citations"][0]["snippet"] == "Kilde med konkrete oplysninger"
    )


@pytest.mark.parametrize("successful", [False, True])
def test_eur_lex_requires_fetched_content_and_honors_gdpr_focus(
    monkeypatch, successful
):
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: False)
    searcher = WebSearcher()
    urls = []

    async def fetch(url, **kwargs):
        urls.append(url)
        return (
            Source(
                "Fetched",
                url,
                "Actually fetched text",
                "eur-lex.europa.eu",
                datetime.now(),
            )
            if successful
            else None
        )

    monkeypatch.setattr(searcher, "_fetch_source", fetch)
    result = asyncio.run(searcher._search_eur_lex("GDPR og AI", focus_areas=["GDPR"]))
    assert len(urls) == 1 and "32016R0679" in urls[0]
    assert bool(result) is successful
    if successful:
        assert result[0].content == "Actually fetched text"


@pytest.mark.parametrize(
    "kind",
    ["html", "pdf_type", "pdf_magic", "oversize", "stream_oversize", "empty_pdf"],
)
def test_research_fetches_bounded_pdf_bytes_or_main_html(monkeypatch, kind):
    from src.services import document_analyzer

    monkeypatch.setattr(codex_text_provider, "is_available", lambda: False)
    raw = (
        b"<html><title>Actual title</title><header>Menu</header><nav>Navigation</nav><main><h1>Actual law</h1><p>Relevant legal text.</p></main><footer>Footer</footer></html>"
        if kind == "html"
        else b"%PDF-1.4\n\xff\xfe binary data"
    )
    if kind == "stream_oversize":
        raw = b"x" * (5 * 1024 * 1024 + 1)
    parsed = []

    def parse(content):
        parsed.append(content)
        return ("" if kind == "empty_pdf" else "PDF text with actual content", [])

    monkeypatch.setattr(document_analyzer, "parse_pdf", parse)

    class Response:
        status = 200
        content_length = 6 * 1024 * 1024 if kind == "oversize" else None
        headers = {
            "Content-Type": (
                "application/pdf" if kind in ("pdf_type", "empty_pdf") else "text/html"
            )
        }

        @property
        def content(self):
            return self

        async def iter_chunked(self, size):
            for start in range(0, len(raw), size):
                yield raw[start : start + size]

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    searcher = WebSearcher()
    searcher.session = SimpleNamespace(get=lambda *a, **kw: Response())
    result = asyncio.run(searcher._fetch_source("https://example.org/source"))
    if kind in ("oversize", "stream_oversize", "empty_pdf"):
        assert result is None
    elif kind == "html":
        assert result.title == "Actual title"
        assert result.content == "Actual law Relevant legal text."
        assert not parsed
    else:
        assert parsed == [raw]
        assert result.source_type == "pdf"
        assert result.content == "PDF text with actual content"


def test_codex_quick_research_summary_uses_selected_provider(monkeypatch):
    monkeypatch.setattr(codex_text_provider, "is_available", lambda: True)
    searcher = WebSearcher()
    searcher.openai_api_key = "synthetic-not-a-secret"
    monkeypatch.setattr(codex_text_provider, "generate_text", lambda *a, **kw: "Lokal sammenfatning")
    source = Source("Kilde", "https://example.org/law", "Kildetekst", "example.org", datetime.now())
    assert asyncio.run(searcher.summarize_with_citations("GDPR", [source])) == "Lokal sammenfatning"


@pytest.mark.parametrize("tracking", ["trk=public_post_comment-text", "utm_source=linkedin&utm_campaign=law", "gclid=click&fbclid=social", "UTM_MEDIUM=social", ""])
def test_research_deduplicates_tracking_and_fragments_without_mutating_sources(tracking):
    original_url = "https://www.datatilsynet.dk/vejledning/konsekvensanalyse/"
    duplicate_url = original_url + ("?" + tracking if tracking else "") + "#article"
    original = Source("Original", original_url, "Kildetekst", "www.datatilsynet.dk", datetime.now(), relevance_score=0.7)
    duplicate = Source("Dublet", duplicate_url, "Kildetekst", "www.datatilsynet.dk", datetime.now(), relevance_score=0.9)
    result = WebSearcher._deduplicate_sources(None, [original, duplicate])
    assert result == [duplicate]
    assert original.url == original_url and duplicate.url == duplicate_url


def test_research_deduplication_preserves_distinct_legal_document_query_ids():
    base = "https://eur-lex.europa.eu/legal-content/DA/TXT/"
    urls = [
        base + "?uri=CELEX:32016R0679",
        base + "?uri=CELEX:32024R1689",
        base + "?uri=CELEX:32016R0679&utm_source=linkedin#section",
        base + "?uri=CELEX:32016R0679&lang=en",
    ]
    sources = [Source(str(index), url, "Kildetekst", "eur-lex.europa.eu", datetime.now()) for index, url in enumerate(urls)]
    result = WebSearcher._deduplicate_sources(None, sources)
    assert [source.url for source in result] == [urls[0], urls[1], urls[3]]
