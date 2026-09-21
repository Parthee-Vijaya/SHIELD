"""Read-only presentation of a saved assessment; never alters its verdict.

Rule-based suggestions are an explicitly separate, current reading aid. They
are not part of the stored AI draft, its JEV receipt or its risk calculation.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

CONTROL_LABELS = {
    "access_control": "Adgang og rettigheder", "encryption": "Kryptering",
    "logging": "Logning og sporbarhed", "data_minimisation": "Dataminimering",
    "retention_deletion": "Sletning og opbevaringsfrister",
    "vendor_management": "Databehandleraftale og leverandørkontrol",
    "human_review": "Menneskelig kontrol", "testing": "Kvalitets- og sikkerhedstest",
    "incident_response": "Beredskab", "training": "Instruktion og uddannelse",
}


def _data(value: Any) -> dict:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value if isinstance(value, dict) else {}


def _strings(value: Any) -> list[str]:
    return list(dict.fromkeys(x.strip() for x in (value or []) if isinstance(x, str) and x.strip())) if isinstance(value, list) else []


def _finding_label(text: str) -> str:
    prefix = "Rettighedsprocedurer mangler for: "
    if not text.startswith(prefix):
        return text
    names = {"information": "oplysningspligt", "access": "indsigt", "rectification": "berigtigelse", "erasure": "sletning", "restriction": "begrænsning", "portability": "dataportabilitet", "objection": "indsigelse", "automated_decision_review": "menneskelig prøvelse af automatiske afgørelser"}
    return prefix + ", ".join(names.get(key.strip(), key.strip()) for key in text[len(prefix):].rstrip(".").split(",")) + "."


def _suggestions(request: dict) -> list[dict]:
    """Contextual alternatives, not claims about an available vendor feature."""
    result = []
    categories = _strings(request.get("personal_data_categories"))
    remote = request.get("solution_type") in {"saas", "integration"} or request.get("hosting_region") in {"unknown", "third_country"}
    sensitive = any(request.get(key) is True for key in ("special_categories", "criminal_data", "cpr_data", "vulnerable_subjects"))
    if remote or sensitive:
        result.append({
            "id": "local-processing", "title": "Undersøg lokal behandling af de mest beskyttelseskrævende data",
            "proposal": "Undersøg, om " + ("transskription eller den første bearbejdning" if "images_audio" in categories else "den første bearbejdning") + " kan udføres på en model i kommunens eget kontrollerede miljø. Send kun nødvendige, gennemgåede uddrag videre, hvis en ekstern tjeneste fortsat er nødvendig.",
            "rationale": "Sagens oplysninger angiver ekstern eller uafklaret behandling eller data med et særligt beskyttelsesbehov. En alternativ arkitektur kan undersøges som en måde at begrænse videregivelse på.",
            "prerequisites": "Afklar funktion, modellicens, driftsansvar, kapacitet, dansk kvalitet og det fulde dataflow. Det er ikke dokumenteret, at den valgte leverandør tilbyder lokal drift. Lokal drift afgør ikke i sig selv lovlighed eller sikkerhed.",
            "verification": "Afprøv med syntetiske data; kontrollér netværkstrafik, telemetri, adgang og logs. Sammenlign kvalitet og driftsbehov. Opdatér konsekvensanalysen, hvis arkitekturen ændres.",
            "source_ids": [],
        })
    if categories:
        audio = "images_audio" in categories
        result.append({
            "id": "retention-deletion", "title": "Fastlæg og afprøv sletning i hele dataforløbet",
            "proposal": ("Overvej at slette rå lyd, når det gennemgåede referat er færdigt, hvis opbevaring ikke længere er nødvendig. " if audio else "Begræns opbevaring af input og mellemresultater til det nødvendige. ") + "Fastlæg særskilte frister for input, udkast, endelige resultater, logs og backups samt en ansvarlig for kontrollen.",
            "rationale": "Løsningen behandler personoplysninger. Kopier i flere systemlag kan gøre opbevaring og sletning vanskeligere at kontrollere.",
            "prerequisites": "Afklar dokumentations-, journaliserings- og arkivbehov med de ansvarlige. Aftal frister og sletteforløb med leverandører og underdatabehandlere; fastsæt ikke en vilkårlig fælles frist.",
            "verification": "Udfør en dokumenteret slettetest med syntetiske data fra oprettelse til eksport, gendannelse og udløb af backups. Gem konfiguration, testresultat og eventuelle undtagelser på sagen.",
            "source_ids": [],
        })
        result.append({
            "id": "human-review", "title": "Afgræns AI-opgaven og indfør kontrol før brug",
            "proposal": "Brug AI-resultatet som udkast. Lad en udpeget medarbejder kontrollere væsentlige oplysninger mod kilderne, rette fejl og tage stilling til, om resultatet må deles eller indgå i en videre sagsbehandling.",
            "rationale": "AI kan levere fejl eller udelade vigtig kontekst. Kontrolbehovet afhænger af anvendelsen og konsekvenserne for de berørte personer.",
            "prerequisites": "Fastlæg hvilke opgaver AI må udføre, hvem der har tid og kompetence til kontrollen, og hvordan tvivl eller fejl eskaleres. Afklar særskilt anvendelse i afgørelser, hvis det er relevant.",
            "verification": "Test typiske fejl med syntetiske eksempler. Dokumentér kontrolpunkter, acceptkriterier og håndtering af fejl, og vurder løbende, om den menneskelige kontrol virker i praksis.",
            "source_ids": [],
        })
    return result


def reading_guide(request: Any, result: Any, approvals: list[dict] | None = None) -> dict:
    request, result = _data(request), _data(result)
    blockers = _strings(result.get("blockers"))
    missing = [x for x in _strings(result.get("missing_information")) if x not in blockers]
    questions = [x for x in _strings(result.get("open_questions")) if x not in blockers and x not in missing]
    conclusion = {
        "blocked": "Kan ikke godkendes på det foreliggende grundlag",
        "requires_action": "Kræver handling før faglig godkendelse",
        "ready_for_review": "Klar til faglig gennemgang – ikke automatisk godkendt",
    }.get(result.get("status"), "Godkendelsesparathed skal afklares")
    # A blocker always remains visible, including inconsistent historical data.
    if blockers:
        conclusion = "Kan ikke godkendes på det foreliggende grundlag"
    verified = _strings(request.get("verified_controls"))
    planned = _strings(request.get("controls"))
    evidence = _data(request.get("control_evidence"))
    controls = [{"title": CONTROL_LABELS.get(key, key), "evidence": evidence[key].strip()}
                for key in verified if key in planned and isinstance(evidence.get(key), str) and len(evidence[key].strip()) >= 10]
    recommendations = result.get("recommendations") or []
    approval = {"status": "unknown", "label": "Godkendelse fremgår ikke af denne rapportversion", "items": []}
    if approvals is not None:
        # Only exact assessment references count, never a positive model score.
        related = []
        assessment_id = result.get("id")
        for item in approvals:
            direct = bool(assessment_id) and item.get("subject_reference_type") in {"dpia", "dpia_assessment"} and item.get("subject_reference_id") == assessment_id
            references = _data(item.get("decision_snapshot")).get("assessment_references") or []
            snapshotted = bool(assessment_id) and any(isinstance(ref, dict) and ref.get("reference_type") in {"dpia", "dpia_assessment"} and ref.get("reference_id") == assessment_id for ref in references)
            if direct or snapshotted:
                related.append({key: deepcopy(item.get(key)) for key in ("id", "status", "approval_type", "decided_by", "decided_at", "reason", "conditions", "is_identity_verified")})
        related.sort(key=lambda item: item.get("decided_at") or "", reverse=True)
        latest = related[0] if related else None
        labels = {"approved": "Godkendelse registreret for denne version", "approved_with_conditions": "Godkendt med vilkår – se beslutningen", "rejected": "Afvist ved faglig beslutning", "pending": "Afventer menneskelig godkendelse"}
        approval = {"status": latest.get("status") if latest else "not_recorded", "label": labels.get(latest.get("status"), "Beslutning kræver gennemgang") if latest else "Ingen godkendelse registreret for denne version", "items": related}
        if latest and latest.get("status") in {"approved", "approved_with_conditions"} and not latest.get("is_identity_verified"):
            approval["label"] += " – identitet ikke verificeret"
    return {
        "version": "2026-09-21-v1", "conclusion": conclusion, "approval": approval,
        "blockers": [_finding_label(x) for x in blockers], "missing_information": [_finding_label(x) for x in missing], "open_questions": questions,
        "next_steps": _strings(result.get("next_steps")), "documented_controls": controls,
        "recommendation_origin": "saved" if recommendations else "rule_based",
        "recommendations": deepcopy(recommendations) if recommendations else _suggestions(request),
        "recommendation_note": "Anbefalinger er forslag til faglig drøftelse. De dokumenterer ikke implementering, ændrer ikke risikoscorer og udgør ikke en godkendelse.",
    }
