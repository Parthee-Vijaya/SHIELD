"""Read-only presentation of recorded AI work, never a reconstructed execution log.

Only persisted case-bound snapshots are read. In particular, this module does not
call models, refresh sources, run rules, or reinterpret a JEV score as approval.
"""

from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite
from typing import Any

from sqlalchemy.orm import Session

from src.database.cases import Case
from src.database.dpia import DPIAAssessmentRecord
from src.database.procurement import ProcurementAnalysis
from src.services.dpia_assessment import DPIAAssessmentRequest

SOURCE_KEYS = (
    "id",
    "title",
    "text",
    "checksum",
    "kind",
    "locator",
    "source_url",
    "version",
    "document_version_id",
    "retrieved_at",
    "source_sha256",
    "retrieved_from",
)
PROFILE_KEYS = (
    "system_name",
    "supplier_name",
    "organisation",
    "department",
    "owner",
    "intended_use",
    "procurement_stage",
    "journal_reference",
    "revision",
    "case_id",
)
USAGE_KEYS = frozenset(
    {
        "inputTokens",
        "outputTokens",
        "totalTokens",
        "reasoningTokens",
        "cachedInputTokens",
        "inputTokenDetails",
        "outputTokenDetails",
        "inputTokensDetails",
        "outputTokensDetails",
        "cacheReadTokens",
        "cacheWriteTokens",
        "noCacheTokens",
        "textTokens",
        "drafting",
        "evaluation",
        "drafting_usage_note",
    }
)
BASE_CRITERIA = [
    "Påstande skal understøttes af de henviste, gemte kilder og må ikke modsige grundlagets låste oplysninger.",
    "Manglende oplysninger skal fremstå som uafklarede. Planlagte foranstaltninger må ikke fremstilles som gennemført.",
    "Juridisk, ledelsesmæssig eller DPO-godkendelse må ikke opfindes. JEV kontrollerer udkast og giver ikke en godkendelse.",
]
RISK_CRITERIA = [
    "Risici skal beskrive mulig skade for mennesker, årsag og konsekvens samt relevante foranstaltninger med en praktisk kontrol af gennemførelsen.",
    "Anbefalinger skal være tydeligt betingede forslag med begrundelse, forudsætninger og kontrolmetode, adskilt fra vurdering og godkendelse.",
]


def _mapping(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _rows(value: Any) -> list[dict]:
    return (
        [row for row in value if isinstance(row, dict)]
        if isinstance(value, list)
        else []
    )


def _strings(value: Any) -> list[str]:
    return (
        [item for item in value if isinstance(item, str)]
        if isinstance(value, list)
        else []
    )


def _pick(value: Any, keys) -> dict:
    source = _mapping(value)
    return {key: source[key] for key in keys if key in source}


def _iso(value: datetime) -> str:
    return (
        (value if value.tzinfo else value.replace(tzinfo=UTC))
        .astimezone(UTC)
        .isoformat()
    )


def _sources(value: Any) -> list[dict]:
    sources = []
    for row in _rows(value):
        source = _pick(row, SOURCE_KEYS)
        if not source.get("kind") and isinstance(source.get("id"), str):
            kind = {
                "input": "questionnaire",
                "law": "legal_source",
                "document": "document",
            }.get(source["id"].split(":", 1)[0])
            if kind:
                source.update(kind=kind, kind_inferred=True)
        sources.append(source)
    return sources


def _usage(value: Any) -> Any:
    """Keep documented token counters; exclude provider metadata/headers/secrets."""
    if value is None:
        return None
    if isinstance(value, list):
        return [_usage(item) for item in value]
    if isinstance(value, dict):
        return {
            key: (
                item
                if key == "drafting_usage_note" and isinstance(item, str)
                else _usage(item)
            )
            for key, item in value.items()
            if key in USAGE_KEYS
        }
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value if isfinite(value) and value >= 0 else None
    # The only textual usage property is the local-import availability note.
    return None


def _batching(value: Any) -> dict | None:
    """Expose saved batch coverage and summaries, never arbitrary worker metadata."""
    if not isinstance(value, dict) or value.get("strategy") not in {
        "map-reduce-v1",
        "single-pass-v1",
    }:
        return None
    result = {"strategy": value["strategy"]}
    for key in (
        "batch_count",
        "source_count",
        "source_text_chars",
        "map_call_count",
        "synthesis_call_count",
        "cross_batch_conflict_count",
    ):
        if (
            isinstance(value.get(key), int)
            and not isinstance(value[key], bool)
            and value[key] >= 0
        ):
            result[key] = value[key]
    if isinstance(value.get("consolidation_note"), str):
        result["consolidation_note"] = value["consolidation_note"]
    result["batches"] = []
    for batch in _rows(value.get("batches")):
        item = {"source_ids": _strings(batch.get("source_ids"))}
        for key in (
            "index",
            "source_text_chars",
            "document_count",
            "fact_count",
            "conflict_count",
            "question_count",
            "finding_count",
        ):
            if (
                isinstance(batch.get(key), int)
                and not isinstance(batch[key], bool)
                and batch[key] >= 0
            ):
                item[key] = batch[key]
        if isinstance(batch.get("summary"), str):
            item["summary"] = batch["summary"]
        result["batches"].append(item)
    return result


def _item(id: str, kind: str, label: str, fields: dict, source_ids=None) -> dict:
    return {
        "id": id,
        "kind": kind,
        "label": label,
        "fields": fields,
        "source_ids": _strings(source_ids),
    }


def _dpia_outputs(result: dict) -> list[dict]:
    outputs = [
        _item(
            "summary",
            "summary",
            "Resumé og afgrænsning",
            {
                "Resumé": result.get("executive_summary", ""),
                "Afgrænsning": result.get("scope", ""),
            },
            result.get("summary_source_ids"),
        )
    ]
    for section in _rows(result.get("sections")):
        outputs.append(
            _item(
                f"section:{section.get('id', '')}",
                "section",
                f"Afsnit {section.get('id', '')} · {section.get('title', '')}",
                {
                    "Tekst": section.get("text", ""),
                    "Tekstens oprindelse": section.get("source", ""),
                },
                section.get("source_ids"),
            )
        )
    for risk in _rows(result.get("risks")):
        outputs.append(
            _item(
                f"risk:{risk.get('id', '')}",
                "risk",
                f"Risiko {risk.get('id', '')} · {risk.get('area', '')}",
                {
                    "Hændelse og årsag": risk.get("scenario", ""),
                    "Konsekvens": risk.get("consequences", ""),
                    "Begrundelse": risk.get("rationale", ""),
                    "Forslag til foranstaltninger": risk.get("measures", ""),
                    "Sandsynlighed": str(risk.get("likelihood", "")),
                    "Konsekvensscore": str(risk.get("impact", "")),
                    "Resterende sandsynlighed": str(
                        risk.get("residual_likelihood", "")
                    ),
                    "Resterende konsekvensscore": str(risk.get("residual_impact", "")),
                },
                risk.get("source_ids"),
            )
        )
    for index, risk in enumerate(_rows(result.get("additional_risks")), 1):
        outputs.append(
            _item(
                f"additional:{index}",
                "risk",
                risk.get("title", "Supplerende risiko"),
                {
                    "Hændelse": risk.get("scenario", ""),
                    "Forslag til foranstaltninger": risk.get("measures", ""),
                },
                risk.get("source_ids"),
            )
        )
    for recommendation in _rows(result.get("recommendations")):
        outputs.append(
            _item(
                f"recommendation:{recommendation.get('id', '')}",
                "recommendation",
                recommendation.get("title", "Anbefaling"),
                {
                    "Forslag": recommendation.get("proposal", ""),
                    "Begrundelse": recommendation.get("rationale", ""),
                    "Forudsætninger": recommendation.get("prerequisites", ""),
                    "Kontrol": recommendation.get("verification", ""),
                },
                recommendation.get("source_ids"),
            )
        )
    for index, question in enumerate(_strings(result.get("open_questions")), 1):
        outputs.append(
            _item(
                f"question:{index}",
                "question",
                f"Åbent spørgsmål {index}",
                {"Spørgsmål": question},
            )
        )
    return outputs


def _material_outputs(generation: dict) -> list[dict]:
    draft = _mapping(generation.get("draft")) or generation
    outputs = [
        _item(
            "summary",
            "summary",
            "Materialets resumé",
            {"Resumé": draft.get("summary", "")},
        )
    ]
    for fact in _rows(draft.get("facts")):
        value = fact.get("value", "")
        # Preserve booleans and lists as legible values, without serializing unknown objects.
        display = (
            ("Ja" if value else "Nej")
            if isinstance(value, bool)
            else (
                ", ".join(map(str, value))
                if isinstance(value, list)
                else (
                    str(value)
                    if isinstance(value, (str, int, float))
                    else "Ikke registreret"
                )
            )
        )
        refs = _rows(fact.get("source_refs"))
        outputs.append(
            _item(
                f"fact:{fact.get('id', '')}",
                "fact",
                fact.get("label") or fact.get("field", "Oplysning"),
                {
                    "Felt": fact.get("field", ""),
                    "Udledt oplysning": display,
                    "Kildeuddrag": "\n\n".join(
                        f"{ref.get('source_id', '')}: {ref.get('quote', '')}"
                        for ref in refs
                    ),
                },
                [ref.get("source_id") for ref in refs],
            )
        )
    for conflict in _rows(draft.get("conflicts")):
        refs = _rows(conflict.get("source_refs"))
        outputs.append(
            _item(
                f"conflict:{conflict.get('id', '')}",
                "conflict",
                "Modstridende oplysninger",
                {
                    "Beskrivelse": conflict.get("description", ""),
                    "Kildeuddrag": "\n\n".join(
                        f"{ref.get('source_id', '')}: {ref.get('quote', '')}"
                        for ref in refs
                    ),
                },
                [ref.get("source_id") for ref in refs],
            )
        )
    for question in _rows(draft.get("questions")):
        outputs.append(
            _item(
                f"question:{question.get('id', '')}",
                "question",
                question.get("topic", "Afklaringsspørgsmål"),
                {
                    "Spørgsmål": question.get("question", ""),
                    "Prioritet": question.get("priority", ""),
                },
            )
        )
    # The material worker supplies every source to the summary review.
    outputs[0]["source_ids"] = [
        row["id"]
        for row in _rows(generation.get("sources"))
        if isinstance(row.get("id"), str)
    ]
    return outputs


def _review(
    raw: Any,
    outputs: list[dict],
    stale_ids: list[str],
    *,
    generated_at=None,
    assessment_id=None,
) -> dict | None:
    if not isinstance(raw, dict) or not raw:
        return None
    mapped = {item["id"]: item for item in outputs}
    checks = []
    for check in _rows(raw.get("checks")):
        check_id = check.get("id", "")
        targets = _strings(check.get("section_ids")) or [check_id]
        matched = [target for target in targets if target in mapped]
        probability = check.get("probability")
        if (
            not isinstance(probability, (int, float))
            or isinstance(probability, bool)
            or not isfinite(probability)
            or not 0 <= probability <= 1
        ):
            probability = None
        checks.append(
            {
                **_pick(check, ("id", "label", "section_ids", "requires_review")),
                "probability": probability,
                "stale": check_id in stale_ids
                or any(target in stale_ids for target in targets),
                "output_item_ids": matched,
                "source_ids": list(
                    dict.fromkeys(
                        source
                        for target in matched
                        for source in mapped[target]["source_ids"]
                    )
                ),
            }
        )
    rubric = raw.get("rubric_version")
    # Only v4 has been matched to the present versioned code. Unknown historic
    # rubrics are kept visible without attributing today's instructions to them.
    known = rubric == "dpia-evidence-review-2026-09-21-v4"
    criteria = (
        [
            *BASE_CRITERIA,
            *RISK_CRITERIA,
            "En risiko skal bevare den oprindelige hændelse og årsag under sit faste ID; en anden risiko må ikke overtage den oprindelige score.",
        ]
        if known
        else []
    )
    return {
        **_pick(
            raw, ("model", "rubric_version", "status", "threshold", "threshold_note")
        ),
        "checks": checks,
        "usage": _usage(raw.get("usage")),
        "generated_at": generated_at,
        "reviewed_assessment_id": assessment_id,
        "reviewed_output_items": outputs,
        "criteria": criteria,
        "criteria_note": (
            "Kriterierne er en beskrivelse af koden til den registrerede rubric-version. Den præcise prompt og delkald er ikke gemt med denne kørsel."
            if known
            else "Den historiske kriterietekst er ikke gemt med kørslen. Den registrerede rubric-version vises uden at tilføje nutidens kriterier."
        ),
        "source_note": "Henviste kilder knytter sig til teksten. Et JEV-kald kan have indeholdt flere kontrolpunkters kilder og låste grundværdier. Præcise batchgrænser og delsignaler er ikke gemt. Kildens checksum kan dække den oprindelige fil eller side, ikke kun det viste tekstuddrag.",
        "reasoning_note": "JEV har gemt et problemsignal og en markering pr. kontrolpunkt, ikke en skriftlig begrundelse. Højere signal betyder større behov for gennemgang; signalet er ikke juridisk sikkerhed eller godkendelse.",
    }


def _reviewed_record(
    record: DPIAAssessmentRecord, records: dict
) -> DPIAAssessmentRecord | None:
    """Resolve only already-loaded ancestors of this case; never cross case IDs."""
    current = record
    visited = set()
    while _mapping(current.result_payload).get("editorial_revision"):
        if current.id in visited:
            return None
        visited.add(current.id)
        result = _mapping(current.result_payload)
        parent_id = _mapping(result.get("editorial_revision")).get(
            "base_assessment_id"
        ) or result.get("parent_assessment_id")
        current = records.get(parent_id)
        if current is None:
            return None
    return current


def _dpia_run(record: DPIAAssessmentRecord, records: dict) -> dict:
    result = _mapping(record.result_payload)
    generation = _mapping(result.get("ai_generation"))
    revision = _mapping(result.get("editorial_revision"))
    kind = "dpia_revision" if revision else "dpia_ai" if generation else "dpia_rules"
    notes = [
        "Visningen læser den gemte version. Den genkører ikke AI, regler eller kilder og viser ikke modellernes interne tankegang.",
        "Forløbet beskriver behandlingens funktion. Det er ikke en gemt hændelseslog med start- og sluttider for hvert trin.",
    ]
    if generation:
        notes.append(
            "De gemte tekster er rapportens endelige output. Den fulde prompt, rå modelsvar og alle mellemskridt er ikke gemt."
        )
        if not generation.get("sources"):
            notes.append("Denne historiske kørsel har ikke et gemt kildegrundlag.")
        if not generation.get("review"):
            notes.append("Der er ingen gemt JEV-kontrol for denne version.")
    else:
        notes.append(
            "Grundvurderingen er regelbaseret. Der er ikke registreret en AI- eller JEV-kørsel for denne version."
        )
    source_record = _reviewed_record(record, records) if revision else record
    reviewed_outputs = (
        _dpia_outputs(_mapping(source_record.result_payload)) if source_record else []
    )
    if revision:
        notes.append(
            "Forbrug vises på den oprindelige AI-version. Denne revision har ikke et nyt modelkald eller nyt tokenforbrug."
        )
        notes.append(
            "Dette er en manuel revision, ikke en ny AI-kørsel. Den tidligere JEV-kontrol er bevaret; ændrede kontrolpunkter og anbefalinger afventer ny kontrol."
        )
        if source_record is None:
            notes.append(
                "Den oprindeligt kontrollerede rapport kunne ikke findes i denne sag. Gammel JEV-kontrol kan ikke knyttes til den aktuelle tekst."
            )
    provider = generation.get("provider")
    attestation = generation.get("model_run_provenance")
    if provider in {"codex-local", "codex-local-test"}:
        attestation = attestation or "operator_reported"
        provider_note = "Model og kørsels-ID er oplyst ved den lokale import. Importen dokumenterer ikke i sig selv afviklingen af Codex."
    elif generation and not provider:
        provider_note = "Kørselsudbyder og kørsels-ID er ikke særskilt registreret i denne historiske version."
    else:
        provider_note = "Kørselsoplysningerne stammer fra den gemte version."
    stages = [
        {
            "id": "input",
            "title": "Grundlag",
            "description": "Gemte svar i spørgerammen og eventuelle kildetekster danner det registrerede grundlag.",
            "status": "recorded",
        }
    ]
    if generation:
        stages.append(
            {
                "id": "draft",
                "title": "Udarbejdelse",
                "description": "AI-udkastet er indsat i rapportens resumé, afsnit, risici og eventuelle anbefalinger. Låste regelresultater og risikoscorer hører til grundvurderingen.",
                "status": "historical" if revision else "recorded",
            }
        )
        stages.append(
            {
                "id": "review",
                "title": "JEV-kontrol",
                "description": "Gemt kontrol af udkastets kildeunderstøttelse og kvalitet. Den er ikke en juridisk godkendelse.",
                "status": (
                    "historical"
                    if revision
                    else "recorded" if generation.get("review") else "not_recorded"
                ),
            }
        )
    else:
        stages.append(
            {
                "id": "rules",
                "title": "Regelbaseret grundvurdering",
                "description": "Rapporten indeholder gemte regelresultater ud fra spørgerammens svar. Der er ingen registreret AI-generering.",
                "status": "recorded",
            }
        )
    if revision:
        stages.append(
            {
                "id": "revision",
                "title": "Menneskelig revision",
                "description": "En bruger har gemt tekstændringer. Tidligere AI- og JEV-oplysninger følger med som historik.",
                "status": "recorded",
            }
        )
    return {
        "id": f"dpia:{record.id}",
        "kind": kind,
        "title": {
            "dpia_revision": "Manuel revision",
            "dpia_ai": "AI-udarbejdet konsekvensanalyse",
            "dpia_rules": "Regelbaseret grundvurdering",
        }[kind],
        "version": record.version,
        "created_at": _iso(record.created_at),
        "assessment_id": record.id,
        "generation_created_at": generation.get("generated_at"),
        "provider": provider,
        "model": generation.get("model"),
        "prompt_version": generation.get("prompt_version"),
        "provenance": {
            "run_id": generation.get("run_id"),
            "model_attestation": attestation,
            "provider_note": provider_note,
            "parent_assessment_id": result.get("parent_assessment_id"),
            **_pick(
                generation, ("source_pack_sha256", "draft_sha256", "base_fingerprint")
            ),
        },
        "stages": stages,
        "input_snapshot": _pick(
            record.request_payload, DPIAAssessmentRequest.model_fields
        ),
        "output_items": _dpia_outputs(result),
        "sources": _sources(generation.get("sources")),
        "review": _review(
            (
                {**generation["review"], "usage": None}
                if revision and isinstance(generation.get("review"), dict)
                else generation.get("review")
            ),
            reviewed_outputs,
            _strings(revision.get("stale_check_ids")),
            generated_at=generation.get("generated_at"),
            assessment_id=source_record.id if source_record else None,
        ),
        "usage": None if revision else _usage(generation.get("usage")),
        "batching": _batching(generation.get("batching")),
        "limitations": _strings(generation.get("limitations")),
        "recording_notes": notes,
        "editorial_revision": (
            _pick(
                revision,
                (
                    "edited_by",
                    "edited_at",
                    "note",
                    "changed_targets",
                    "stale_check_ids",
                    "base_assessment_id",
                ),
            )
            if revision
            else None
        ),
    }


def _material_run(record: ProcurementAnalysis) -> dict:
    generation = _mapping(record.generation_payload)
    outputs = _material_outputs(generation)
    notes = [
        "Materialeanalysen foreslår oplysninger og afklaringsspørgsmål. Den er ikke en konsekvensanalyse eller en godkendelse.",
        "Forløbet beskriver behandlingens funktion. Det er ikke en gemt hændelseslog med start- og sluttider for hvert trin.",
        "Kilder og profil vises som gemte snapshots; ændringer i sagen siden kørslen er ikke genberegnet her.",
        "Den fulde prompt og rå modelsvar er ikke gemt. Teksterne viser det gemte output.",
    ]
    if not generation.get("usage"):
        notes.append(
            "Tokenforbrug for udarbejdelsen er ikke gemt; manglende forbrug er ikke nul."
        )
    return {
        "id": f"material:{record.id}",
        "kind": "material_analysis",
        "title": "Analyse af leverandørmateriale",
        "version": None,
        "created_at": _iso(record.created_at),
        "assessment_id": None,
        "generation_created_at": _iso(record.created_at),
        "provider": record.generation_provider,
        "model": record.model,
        "prompt_version": generation.get("prompt_version"),
        "provenance": {
            "run_id": generation.get("run_id"),
            "model_attestation": (
                "operator_reported"
                if record.generation_provider in {"codex-local", "codex-local-test"}
                else None
            ),
            "provider_note": generation.get("provenance_note"),
            "parent_assessment_id": None,
            **_pick(generation, ("source_pack_sha256", "draft_sha256")),
            "profile_fingerprint": record.profile_fingerprint,
            "source_fingerprint": record.source_fingerprint,
        },
        "stages": [
            {
                "id": "input",
                "title": "Leverandørmateriale",
                "description": "Gemte dokumenttekster og løsningsprofil indgår som kildegrundlag.",
                "status": "recorded",
            },
            {
                "id": "draft",
                "title": "Udtræk af oplysninger",
                "description": "AI foreslår konkrete oplysninger med kildeuddrag, konflikter og afklaringsspørgsmål.",
                "status": "recorded",
            },
            {
                "id": "review",
                "title": "JEV-kontrol",
                "description": "Kontrol af resumé, udledte oplysninger og konflikter mod kilderne. Afklaringsspørgsmål er ikke særskilte JEV-kontrolpunkter.",
                "status": "recorded" if generation.get("review") else "not_recorded",
            },
        ],
        "input_snapshot": _pick(generation.get("profile_snapshot"), PROFILE_KEYS),
        "output_items": outputs,
        "sources": _sources(generation.get("sources")),
        "review": _review(
            generation.get("review"), outputs, [], generated_at=_iso(record.created_at)
        ),
        "usage": _usage(generation.get("usage")),
        "batching": _batching(generation.get("batching")),
        "limitations": _strings(generation.get("limitations")),
        "recording_notes": notes,
        "editorial_revision": None,
    }


def build_technical_runs(db: Session, case_id: str) -> dict:
    if db.get(Case, case_id) is None:
        raise LookupError("Sagen blev ikke fundet.")
    assessments = db.query(DPIAAssessmentRecord).filter_by(case_db_id=case_id).all()
    records = {record.id: record for record in assessments}
    runs = [_dpia_run(record, records) for record in assessments]
    runs.extend(
        _material_run(record)
        for record in db.query(ProcurementAnalysis).filter_by(case_id=case_id).all()
    )
    runs.sort(
        key=lambda run: (run["created_at"], run["version"] or 0, run["id"]),
        reverse=True,
    )
    return {"case_id": case_id, "runs": runs}
