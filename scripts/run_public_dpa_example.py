"""Create a local, synthetic case and record real GPT/JEV/API outcomes.

Run against the development app only. Never reads the Gateway key; Node loads
its environment file itself. Remote payloads contain public DPA text and the
explicitly fictional questionnaire, never documents from another case.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
from uuid import uuid4
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

CASE_KEY = "EKSEMPEL-AICOM-2026-001"
DPA_URL = "https://aicom.dk/dpa/databehandleraftale-pointtaken.pdf"
FIXTURE = ROOT / "examples/dpia/aicom-communication.json"


def now() -> str:
    return datetime.now(UTC).isoformat()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


class LocalAPI:
    def __init__(self, base_url: str):
        parsed = urlsplit(base_url)
        if (
            parsed.scheme != "http"
            or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "Eksempelkørslen er begrænset til en lokal udviklingsserver."
            )
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.trust_env = False

    def request(self, method: str, path: str, **kwargs):
        timeout = kwargs.pop("timeout", 30)
        return self.session.request(
            method, self.base_url + path, timeout=timeout, **kwargs
        )

    def json(self, method: str, path: str, **kwargs):
        response = self.request(method, path, **kwargs)
        if not response.ok:
            # Do not forward untrusted response bodies or request headers.
            raise RuntimeError(
                f"Lokalt API-trin fejlede med HTTP {response.status_code}."
            )
        return response.json()


def load_source(directory: Path, source_url: str = DPA_URL) -> tuple[dict, bytes]:
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        if source_url != DPA_URL:
            raise ValueError(
                "Leverandørens kildepakke skal klargøres med manifest først."
            )
        directory.mkdir(parents=True, exist_ok=True)
        response = requests.get(source_url, timeout=30)
        response.raise_for_status()
        content = response.content
        if not content.startswith(b"%PDF-") or len(content) > 5_000_000:
            raise ValueError("Den offentlige kilde er ikke en understøttet PDF.")
        source = {
            "title": "Aicom / PointTaken – offentlig DPA (juni 2026)",
            "url": source_url,
            "retrieved_at": now(),
            "sha256": sha256(content).hexdigest(),
            "filename": "databehandleraftale-pointtaken.pdf",
            "media_type": "application/pdf",
        }
        (directory / source["filename"]).write_bytes(content)
        write_json(manifest_path, {"sources": [source]})
    sources = json.loads(manifest_path.read_text(encoding="utf-8"))["sources"]
    source = next(item for item in sources if item["url"] == source_url)
    path = (directory / source["filename"]).resolve()
    if not path.is_relative_to(directory.resolve()):
        raise ValueError("Kilden skal ligge i den valgte kildemappe.")
    content = path.read_bytes()
    if sha256(content).hexdigest() != source["sha256"]:
        raise ValueError("Kildens kontrolsum matcher ikke manifestet.")
    return source, content


def attach_document(
    api: LocalAPI,
    case_id: str,
    *,
    key: str,
    title: str,
    filename: str,
    content: bytes,
    media_type: str,
    metadata: dict,
    role: str,
    category: str,
    note: str,
    tags: list[str] | None = None,
) -> dict:
    documents = api.json("GET", "/api/v3/documents", params={"limit": 500})["documents"]
    existing = next(
        (item for item in documents if item.get("document_key") == key), None
    )
    digest = sha256(content).hexdigest()
    version = next(
        (
            item
            for item in (existing or {}).get("versions", [])
            if item["sha256"] == digest
        ),
        None,
    )
    if version is None:
        upload_metadata = {
            "title": title,
            "document_key": key,
            "category": category,
            "description": note,
            "classification": "public_example",
            "tags": tags or ["eksempel"],
            "version_metadata": metadata,
        }
        if existing:
            upload_metadata["document_id"] = existing["id"]
        response = api.json(
            "POST",
            "/api/v3/documents",
            data={"metadata": json.dumps(upload_metadata, ensure_ascii=False)},
            files={"file": (filename, content, media_type)},
        )
        version = response["version"]
    if version["status"] != "approved":
        # This approves this source/test-file snapshot for the document bank,
        # never a supplier, contract, DPIA, safeguard or deployment.
        version = api.json(
            "POST",
            f"/api/v3/documents/{version['document_id']}/versions/{version['id']}/approve",
            json={"approval_note": note},
        )
    api.json(
        "POST",
        f"/api/v3/cases/{case_id}/documents/{version['document_id']}",
        json={"document_version_id": version["id"], "link_role": role, "note": note},
    )
    downloaded = api.request("GET", version["download_href"])
    assert downloaded.ok and sha256(downloaded.content).hexdigest() == digest
    return version


def evaluate_source(
    content: bytes, work: Path, source: dict | None = None, claims: list | None = None
) -> tuple[dict, bool]:
    from src.services.document_analyzer import parse_document

    filename = (source or {}).get("filename", "databehandleraftale-pointtaken.pdf")
    if filename.endswith(".txt"):
        text = content.decode("utf-8")
    else:
        text, _, _ = parse_document(content, filename)
    if not text or len(text) > 25_000:
        raise ValueError("Kildeudtrækket passer ikke til den afgrænsede JEV-test.")
    claims = claims or [
        (
            "supported",
            "Kildedækket påstand om OpenAI",
            "Ifølge den offentlige DPA anvender Aicom OpenAI til AI-generering og analyser.",
            False,
        ),
        (
            "transfer",
            "Testpåstand om udelukkende EU/EØS",
            "Alle Aicoms underdatabehandlere behandler udelukkende data i EU/EØS, og der sker ingen tredjelandsoverførsler.",
            True,
        ),
        (
            "approval",
            "Testpåstand om kommunal godkendelse",
            "Kommunens DPO har godkendt Aicom. Kommunens adgangskontrol, slettefrister og logkontrol er implementeret og testet.",
            True,
        ),
    ]
    payload = {
        "sources": [
            {
                "id": "public-dpa",
                "title": (source or {}).get(
                    "title", "Aicoms offentlige DPA, juni 2026"
                ),
                "text": text,
            }
        ],
        "units": [
            {
                "id": key,
                "label": label,
                "text": claim,
                "source_ids": ["public-dpa"],
                "kind": "section",
            }
            for key, label, claim, _ in claims
        ],
    }
    process = subprocess.run(
        ["node", "--env-file-if-exists=.env.local", "ai-gateway/evaluate-example.mts"],
        cwd=ROOT,
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )
    if process.returncode != 0:
        return {
            "model": "typesafe-ai/jev",
            "checks": [],
            "note": "JEV-kildetesten kunne ikke gennemføres.",
        }, False
    review = json.loads(process.stdout)
    checks = review.get("checks", [])
    expected = {key: flag for key, _, _, flag in claims}
    valid = len(checks) == 3 and {c.get("id") for c in checks} == set(expected)
    for check in checks:
        value = check.get("probability")
        finite = (
            isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value <= 1
        )
        valid = valid and finite and (value >= 0.5) == expected.get(check.get("id"))
        matching = next((item for item in claims if item[0] == check.get("id")), None)
        if matching:
            check["text"] = matching[2]
            check["expected_requires_review"] = matching[3]
    write_json(work / "jev-source-review.json", {"input": payload, "review": review})
    return {
        "model": review.get("model", "typesafe-ai/jev"),
        "checks": checks,
        "note": "Separat kontrol af tre testpåstande mod den offentlige databehandleraftale. To påstande er bevidst forkerte. Dette er ikke JEV-gennemgang af en GPT-rapport, og signalet er ikke en juridisk godkendelse.",
    }, bool(valid)


def validate_generation_input(
    bundle: dict,
    fixture: dict,
    assessment_id: str,
    source_version_id: str,
) -> None:
    """Fail closed if a reused example contains unrelated model input."""
    from src.services.dpia_assessment import DPIAAssessmentRequest

    inputs = [
        link
        for link in bundle.get("documents", [])
        if link.get("link_role") != "output"
    ]
    if not inputs or any(
        link.get("document_version_id") != source_version_id for link in inputs
    ):
        raise ValueError(
            "Eksempelsagen indeholder andre kilder end den valgte offentlige aftale. AI-kaldet er stoppet."
        )
    # The backend excludes every output version, even if also linked as input.
    if any(
        link.get("link_role") == "output"
        and link.get("document_version_id") == source_version_id
        for link in bundle.get("documents", [])
    ):
        raise ValueError(
            "Den offentlige kilde er markeret som sagsoutput. AI-kaldet er stoppet."
        )
    records = [
        item
        for item in bundle.get("assessments", {}).get("dpia", [])
        if item.get("id") == assessment_id
    ]
    if len(records) != 1 or not isinstance(records[0].get("request_payload"), dict):
        raise ValueError(
            "Eksempelsagens gemte input kunne ikke kontrolleres. AI-kaldet er stoppet."
        )
    try:
        expected = DPIAAssessmentRequest.model_validate(fixture).model_dump(mode="json")
        actual = DPIAAssessmentRequest.model_validate(
            records[0]["request_payload"]
        ).model_dump(mode="json")
    except ValueError:
        raise ValueError(
            "Eksempelsagens input er ugyldigt. AI-kaldet er stoppet."
        ) from None
    if actual != expected:
        raise ValueError(
            "Eksempelsagens gemte input afviger fra den syntetiske fixture. AI-kaldet er stoppet."
        )


def run(args, *, example: dict | None = None) -> dict:
    example = example or {}
    case_key = example.get("case_key", CASE_KEY)
    vendor_id = example.get("vendor_id", "aicom")
    api = LocalAPI(args.base_url)
    api.json("GET", "/readyz")
    identity = api.json("GET", "/api/auth/me")
    if identity.get("auth_mode") != "development":
        raise ValueError("Eksempler oprettes kun med den lokale udviklingsidentitet.")
    source, content = load_source(args.sources_dir, example.get("source_url", DPA_URL))
    run_id = str(uuid4())
    work = args.output_dir / run_id
    work.mkdir(parents=True, exist_ok=True)
    fixture = json.loads(
        Path(example.get("fixture", FIXTURE)).read_text(encoding="utf-8")
    )
    cases = api.json("GET", "/api/v3/cases", params={"case_id": case_key})["items"]
    if len(cases) > 1 or (cases and cases[0]["title"] != fixture["project_name"]):
        raise ValueError(
            "Eksempelsagens identitet er ændret; eksisterende sag bevares."
        )
    case = (
        cases[0]
        if cases
        else api.json(
            "POST",
            "/api/v3/cases",
            json={
                "case_id": case_key,
                "title": fixture["project_name"],
                "notes": example.get(
                    "notes",
                    "Fiktiv eksempelsag med offentlig databehandleraftale. Ti tænkte kommunikationsmedarbejdere, kun syntetiske data. Ingen indgået aftale eller godkendt anvendelse. Se eksempelkørslen nedenfor og den gemte analyse under Vurderinger.",
                ),
                "assigned_to": fixture["owner"],
            },
        )
    )
    case_id = case["id"]
    source_version = attach_document(
        api,
        case_id,
        key=f"example-{vendor_id}-public-dpa",
        title=source["title"],
        filename=source["filename"],
        content=content,
        media_type=source.get("media_type", "application/pdf"),
        metadata={
            "source_url": source["url"],
            "retrieved_at": source["retrieved_at"],
            "source_kind": "public_vendor_document",
            "original_sha256": source.get("original_sha256", source["sha256"]),
            "source_note": source.get("source_note", "Offentlig PDF-kilde"),
        },
        role="evidence",
        category="data_processing_agreement",
        note="Offentlig kildekopi: dokumentversionens kontrolsum er kontrolleret mod kildemanifestet. Godkendelsen vedrører kun dokumentversionen som kilde. Ingen underskrevet kundeaftale, leverandørgodkendelse eller godkendelse af behandling. "
        + source.get("source_note", ""),
        tags=["eksempel", vendor_id],
    )
    workspace_path = f"/api/v3/cases/{case_id}/workspace"
    workspace = api.json("GET", workspace_path)
    originals = [
        a for a in workspace["assessments"]["dpia"] if not a.get("parent_assessment_id")
    ]
    original = (
        api.json("GET", f"/api/dpia/assessments/{originals[0]['id']}")
        if originals
        else api.json(
            "POST",
            "/api/dpia/assessments",
            params={"case_db_id": case_id},
            json=fixture,
        )
    )
    assert len(original["sections"]) == 39 and len(original["risks"]) == 33
    before = api.json("GET", f"/api/v3/cases/{case_id}/export.json")
    validate_generation_input(before, fixture, original["id"], source_version["id"])
    write_json(work / "baseline.json", original)
    steps = [
        {
            "id": "source",
            "label": "Offentlig aftale tilknyttet",
            "status": "passed",
            "detail": "Databehandleraftale hentet, kontrolsum verificeret og den samme dokumentversion genhentet fra sagen. "
            + source.get("source_note", ""),
        },
        {
            "id": "base",
            "label": "Konsekvensanalyse og risikovurdering gemt",
            "status": "passed",
            "detail": "Regelbaseret udkast: Datatilsynets 39 afsnit og 33 risici. Hjemmel, DPO og ikke-verificerede kontroller står åbne.",
        },
    ]
    response = api.request(
        "POST", f"/api/dpia/assessments/{original['id']}/generate", timeout=260
    )
    selected = original
    if response.status_code == 201:
        selected = response.json()
        ai = selected["ai_generation"]
        assert selected["parent_assessment_id"] == original["id"]
        assert (
            selected["case_db_id"] == case_id
            and selected["version"] > original["version"]
        )
        assert (
            ai["model"] == "openai/gpt-5.5"
            and ai["review"]["model"] == "typesafe-ai/jev"
        )
        assert len(ai["review"]["checks"]) >= 73
        assert any(s["id"] == f"document:{source_version['id']}" for s in ai["sources"])
        locked = [
            "likelihood",
            "impact",
            "inherent_risk",
            "residual_likelihood",
            "residual_impact",
            "residual_risk",
        ]
        old_risks = {r["id"]: r for r in original["risks"]}
        assert all(
            all(r[k] == old_risks[r["id"]][k] for k in locked)
            for r in selected["risks"]
        )
        assert (
            selected["status"] == original["status"]
            and selected["blockers"] == original["blockers"]
        )
        ai_status, ai_detail = (
            "passed",
            "GPT-5.5 skrev udkastet; JEV gennemgik alle afsnit. En ny version er gemt, og den oprindelige version og risikoscorer er bevaret.",
        )
    else:
        detail = (
            response.json().get("detail", "")
            if "application/json" in response.headers.get("content-type", "")
            else ""
        )
        paid = (
            response.status_code == 503
            and isinstance(detail, str)
            and "betalte AI Gateway-kreditter" in detail
        )
        ai_status = "blocked" if paid else "failed"
        ai_detail = (
            "Vercel kræver betalte AI Gateway-kreditter til GPT-5.5. Ingen GPT-rapport eller ny analyseversion blev gemt."
            if paid
            else f"AI-udarbejdelsen blev ikke gennemført (HTTP {response.status_code}). Ingen succes påstås."
        )
    steps.append(
        {
            "id": "generation",
            "label": "GPT skriver → JEV gennemgår → ny version",
            "status": ai_status,
            "detail": ai_detail,
        }
    )
    after = api.json("GET", workspace_path)
    assert api.json("GET", f"/api/dpia/assessments/{original['id']}") == original
    assert after["case"]["status"] == before["case"]["status"]
    assert len(after["assessments"]["dpia"]) == len(
        before["assessments"]["dpia"]
    ) + int(ai_status == "passed")
    steps.append(
        {
            "id": "persistence",
            "label": "Historik og sagsstatus kontrolleret",
            "status": "passed",
            "detail": "Den oprindelige vurdering er uændret ved genåbning. Sagen er ikke automatisk godkendt.",
        }
    )
    jev, jev_ok = evaluate_source(content, work, source, example.get("jev_claims"))
    steps.append(
        {
            "id": "evaluator",
            "label": "JEV testet særskilt mod aftalen",
            "status": "passed" if jev_ok else "failed",
            "detail": (
                "Tre testpåstande kontrolleret: en kildedækket påstand og to bevidste fejl. Resultaterne ses nedenfor."
                if len(jev.get("checks", [])) == 3
                else "JEV-kontrollen kunne ikke gennemføres. Der er ikke registreret et fuldt sæt resultater."
            ),
        }
    )
    for extension in ("docx", "xlsx"):
        download = api.request(
            "GET", f"/api/dpia/assessments/{selected['id']}/export.{extension}"
        )
        assert download.ok
        (work / f"konsekvensanalyse.{extension}").write_bytes(download.content)
        with ZipFile(BytesIO(download.content)) as archive:
            assert archive.testzip() is None
            parts = (
                ["word/document.xml"]
                if extension == "docx"
                else [
                    name
                    for name in archive.namelist()
                    if name.startswith("xl/worksheets/") and name.endswith(".xml")
                ]
            )
            text = " ".join(
                " ".join(ET.fromstring(archive.read(p)).itertext()) for p in parts
            )
            assert fixture["project_name"] in text and selected["id"] in text
        steps.append(
            {
                "id": extension,
                "label": f"{'Word' if extension == 'docx' else 'Excel'} hentet og kontrolleret",
                "status": "passed",
                "detail": f"Den gemte version {selected['version']} er genhentet som {extension.upper()}; filstruktur, sagsnavn og vurderings-ID er kontrolleret.",
            }
        )
    write_json(work / "assessment.json", selected)
    status = "failed" if not jev_ok or ai_status == "failed" else ai_status
    report = {
        "schema_version": 1,
        "title": example.get(
            "title", "Aicom · offentlig DPA og fiktiv kommunal anvendelse"
        ),
        "executed_at": now(),
        "status": status,
        "assessment_id": selected["id"],
        "summary": (
            "Hele AI-forløbet er kørt. Rapporten kræver fortsat faglig gennemgang."
            if status == "passed"
            else "Eksempelsagen og downloads kan gennemgås. Hele AI-forløbet er ikke bestået; se det konkrete stop og delresultater nedenfor."
        ),
        "steps": steps,
        "sources": [source],
        "jev": jev,
        "assumptions": [
            "Eksempelkommune og ti kommunikationsmedarbejdere er fiktive. Ingen faktisk anskaffelse eller drift.",
            "Kun offentlige leverandørdokumenter og syntetiske oplysninger bruges. Ingen konto er oprettet hos Aicom.",
            "Formålet er interne nyhedsudkast. Ingen personsager, CPR, særlige kategorier eller automatiske afgørelser indgår i det tænkte forløb.",
            "Menneskelig kontrol, ingen modeltræning og 30 dages sletning er kravforslag. De er ikke verificerede leverandørfunktioner.",
            "Hjemmel, overførselsgrundlag, rettighedsprocedurer og DPO-inddragelse er uafklarede. Den offentlige DPA er ikke en kundespecifik, underskrevet aftale.",
            "Teststatus gælder denne kørsel på det viste tidspunkt. Den ændres først ved en ny registreret testkørsel.",
        ],
    }
    if example.get("assumptions"):
        report["assumptions"] = example["assumptions"]
    write_json(work / "testkvittering.json", report)
    receipt_text = (
        "S.H.I.E.L.D. – testkvittering for fiktiv eksempelsag\n\n"
        + json.dumps(report, ensure_ascii=False, indent=2)
    )
    attach_document(
        api,
        case_id,
        key=f"example-{vendor_id}-run-{run_id}",
        title="Eksempelkørsel · GPT og JEV · " + report["executed_at"],
        filename=f"testkvittering-{vendor_id}.txt",
        content=receipt_text.encode("utf-8"),
        media_type="text/plain",
        metadata={"example_run": report},
        role="output",
        category="other",
        note="Automatisk testkvittering for lokal eksempelsag. Registreret som resultat, ikke som evidens for leverandørens egenskaber. Ingen juridisk godkendelse.",
    )
    final_workspace = api.json("GET", workspace_path)
    assert any(
        d.get("version", {})
        .get("metadata", {})
        .get("example_run", {})
        .get("executed_at")
        == report["executed_at"]
        for d in final_workspace["documents"]
    )
    write_json(work / "workspace.json", final_workspace)
    result = {
        "status": status,
        "case_id": case_id,
        "assessment_id": selected["id"],
        "case_url": f"http://localhost:8090/sager/{case_id}",
        "artifacts": str(work),
    }
    write_json(args.output_dir / "latest.json", result)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument(
        "--sources-dir", type=Path, default=ROOT / ".cache/aicom-public-source"
    )
    parser.add_argument("--output-dir", type=Path, default=ROOT / ".cache/aicom-e2e")
    try:
        result = run(parser.parse_args())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if result["status"] == "passed" else 2)
    except Exception as exc:
        # Exception text can include network details. Only emit its type.
        print(
            f"Eksempelkørslen stoppede ({type(exc).__name__}). Ingen fuld succes er registreret.",
            file=sys.stderr,
        )
        sys.exit(1)
