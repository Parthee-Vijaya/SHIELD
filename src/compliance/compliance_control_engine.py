"""
Compliance Control Engine - 7-punkts Vurdering med Regelmotor

Dette modul implementerer en omfattende compliance control med:
- GO/NO-GO/BETINGET-GO beslutningslogik
- Risikoscore beregning
- Hard stops (kritiske blokeringer)
- Betingelser for godkendelse
- Nødvendige artefakter og tests
- Næste skridt anbefalinger
"""

from __future__ import annotations

from typing import Dict, List, Any, Optional
from enum import Enum


class Beslutning(str, Enum):
    """Compliance beslutning kategorier."""
    GO = "go"
    BETINGET_GO = "betinget-go"
    NO_GO = "no-go"


class RisikoNiveau(str, Enum):
    """Risiko niveauer."""
    LAV = "Lav"
    MEDIUM = "Medium"
    HOJ = "Høj"
    KRITISK = "Kritisk"


class ComplianceControlEngine:
    """
    Regelmotor til compliance control vurdering.

    Implementerer beslutningslogik baseret på:
    - AI Act krav
    - GDPR compliance
    - Best practices
    - Organisatoriske krav
    """

    def __init__(self):
        """Initialiser compliance control engine."""
        pass

    def vurder_system(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Gennemfør komplet 7-punkts compliance control vurdering.

        Args:
            data: Form data fra frontend med alle 7 punkter

        Returns:
            Omfattende compliance rapport med beslutning, score, anbefalinger
        """
        # Ekstraher data
        system_info = self._extract_system_info(data)

        # Beregn risikoscore (0-100)
        risiko_score = self._beregn_risiko_score(data)
        risiko_niveau = self._bestem_risiko_niveau(risiko_score)

        # Identificer hard stops (kritiske blokeringer)
        hard_stops = self._identificer_hard_stops(data)

        # Generer betingelser for godkendelse
        betingelser = self._generer_betingelser(data)

        # Bestem endelig beslutning
        beslutning = self._bestem_beslutning(risiko_score, hard_stops, betingelser)
        beslutning_beskrivelse = self._generer_beslutning_beskrivelse(
            beslutning, system_info['system_navn'], risiko_niveau
        )

        # Identificer nødvendige artefakter (dokumentation)
        artefakter = self._identificer_artefakter(data)

        # Identificer nødvendige tests
        tests = self._identificer_tests(data)

        # Generer næste skridt
        naeste_skridt = self._generer_naeste_skridt(beslutning, data)

        # Generer anbefalinger
        anbefalinger = self._generer_anbefalinger(data, risiko_score)

        # Generer punktspecifikke vurderinger
        punkt_vurderinger = self._generer_punkt_vurderinger(data)

        # Byg komplet rapport
        rapport = {
            "compliance_control": {
                "beslutning": beslutning.value,
                "beslutning_beskrivelse": beslutning_beskrivelse,
                "risiko_score": risiko_score,
                "risiko_niveau": risiko_niveau.value,
                "hard_stops": hard_stops,
                "betingelser": betingelser,
                "nødvendige_artefakter": artefakter,
                "nødvendige_tests": tests,
                "næste_skridt": naeste_skridt,
                "anbefalinger": anbefalinger,
            },
            "punkt_vurderinger": punkt_vurderinger,
            "system_info": system_info,
            "samlet_vurdering": {
                "er_ai_system": self._er_ai_system(data),
                "behandler_persondata": data.get('personoplysninger', False),
                "kræver_dpia": self._kraever_dpia(data),
                "ai_act_kategori": data.get('ai_risiko_kategori', 'ved_ikke'),
                "compliance_score": max(0, 100 - risiko_score),
            }
        }

        return rapport

    def _extract_system_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Ekstraher system information."""
        return {
            "system_navn": data.get('system_navn', 'Ukendt system'),
            "system_beskrivelse": data.get('system_beskrivelse', ''),
            "fagomraade": data.get('fagomraade', ''),
            "organisation": data.get('organisation', 'Kalundborg Kommune'),
            "team": data.get('team', ''),
            "kontaktperson": data.get('kontaktperson', ''),
        }

    def _beregn_risiko_score(self, data: Dict[str, Any]) -> int:
        """
        Beregn risikoscore fra 0-100 baseret på alle faktorer.
        Højere score = højere risiko.
        """
        score = 0

        # Punkt 1: AI System faktorer (0-15 points)
        if data.get('bruger_ml'):
            score += 5
        if data.get('autonome_beslutninger'):
            score += 10

        # Punkt 2: Personoplysninger (0-25 points)
        if data.get('personoplysninger'):
            score += 10

            # Særlige kategorier er meget alvorlige
            persondata_typer = data.get('persondata_typer', [])
            if 'Sundhedsdata' in persondata_typer:
                score += 8
            if 'Biometriske data' in persondata_typer:
                score += 7
            if 'Særlige kategorier (race, religion, etc.)' in persondata_typer:
                score += 10
            elif persondata_typer:
                score += 5

            # Manglende juridisk grundlag
            if not data.get('juridisk_grundlag') or data.get('juridisk_grundlag') == 'ved_ikke':
                score += 10

        # Punkt 3: GDPR compliance (0-20 points)
        if data.get('personoplysninger'):
            if not data.get('dpia_udfoert'):
                score += 10
            if data.get('privacy_by_design') != 'ja':
                score += 5
            if not data.get('databehandleraftaler') and data.get('databehandleraftaler') != 'ikke_relevant':
                score += 5

        # Punkt 4: AI Act risiko (0-25 points)
        ai_risiko = data.get('ai_risiko_kategori', '')
        if ai_risiko == 'unacceptable':
            score += 25  # Automatisk NO-GO
        elif ai_risiko == 'high':
            score += 20
        elif ai_risiko == 'limited':
            score += 10
        elif ai_risiko == 'minimal':
            score += 3

        if data.get('kritiske_formaal'):
            score += 8
        if data.get('transparens') != 'ja':
            score += 5
        if data.get('menneskelig_overvaagning') != 'ja':
            score += 7

        # Punkt 5: Uddannelse (0-10 points)
        if data.get('medarbejder_uddannelse') != 'ja':
            score += 5
        if not data.get('ansvarlig_person'):
            score += 5

        # Punkt 6: Ressourcer (0-5 points)
        if data.get('juridisk_raadgivning') == 'ja':
            score += 2  # Behov for hjælp indikerer kompleksitet
        if data.get('teknisk_ekspertise') == 'ja':
            score += 3

        # Punkt 7: Dokumentation (0-15 points)
        if data.get('beslutningslogik_dokumentation') != 'ja':
            score += 7
        if data.get('bias_testing') != 'ja':
            score += 5
        if not data.get('klage_procedurer'):
            score += 3

        return min(score, 100)  # Cap at 100

    def _bestem_risiko_niveau(self, score: int) -> RisikoNiveau:
        """Bestem risiko niveau baseret på score."""
        if score >= 80:
            return RisikoNiveau.KRITISK
        elif score >= 60:
            return RisikoNiveau.HOJ
        elif score >= 30:
            return RisikoNiveau.MEDIUM
        else:
            return RisikoNiveau.LAV

    def _identificer_hard_stops(self, data: Dict[str, Any]) -> List[str]:
        """Identificer kritiske blokeringer der forhindrer GO beslutning."""
        hard_stops = []

        # Uacceptabel AI risiko = automatisk NO-GO
        if data.get('ai_risiko_kategori') == 'unacceptable':
            hard_stops.append(
                "❌ KRITISK: AI-systemet er klassificeret som 'Uacceptabel Risiko' under EU AI Act. "
                "Disse systemer er forbudt og må ikke implementeres (Art. 5)."
            )

        # Persondata uden juridisk grundlag
        if data.get('personoplysninger') and (not data.get('juridisk_grundlag') or data.get('juridisk_grundlag') == 'ved_ikke'):
            hard_stops.append(
                "❌ KRITISK: Behandling af personoplysninger uden gyldigt juridisk grundlag overtræder GDPR Art. 6. "
                "System kan ikke godkendes før lovligt behandlingsgrundlag er etableret."
            )

        # Sundhedsdata eller biometriske data uden DPIA
        persondata_typer = data.get('persondata_typer', [])
        kritiske_datatyper = ['Sundhedsdata', 'Biometriske data', 'Særlige kategorier (race, religion, etc.)']
        har_kritiske_data = any(dtype in kritiske_datatyper for dtype in persondata_typer)

        if har_kritiske_data and not data.get('dpia_udfoert'):
            hard_stops.append(
                "❌ KRITISK: Behandling af særlige kategorier af personoplysninger kræver DPIA (GDPR Art. 35). "
                "System kan ikke ibrugtages før DPIA er gennemført og godkendt."
            )

        # Høj risiko AI uden menneskelig overvågning
        if data.get('ai_risiko_kategori') == 'high' and data.get('menneskelig_overvaagning') != 'ja':
            hard_stops.append(
                "❌ KRITISK: Højrisiko AI-systemer kræver effektiv menneskelig overvågning (AI Act Art. 14). "
                "Human-in-the-loop eller human-on-the-loop kontrol skal implementeres."
            )

        # Kritiske formål uden transparens
        if data.get('kritiske_formaal') and data.get('transparens') != 'ja':
            hard_stops.append(
                "❌ KRITISK: AI-systemer til kritiske formål skal være transparente og forklarlige (AI Act Art. 13). "
                "Brugere har ret til forklaring af automatiserede beslutninger."
            )

        return hard_stops

    def _generer_betingelser(self, data: Dict[str, Any]) -> List[str]:
        """Generer betingelser der skal opfyldes for godkendelse."""
        betingelser = []

        # DPIA påkrævet
        if data.get('personoplysninger') and data.get('dpia_udfoert') != 'ja':
            if data.get('ai_risiko_kategori') in ['high', 'limited']:
                betingelser.append(
                    "📋 Gennemfør og godkend DPIA inden idriftsættelse (GDPR Art. 35)"
                )

        # Privacy by design
        if data.get('privacy_by_design') != 'ja':
            betingelser.append(
                "🔒 Implementer privacy by design og by default principper (GDPR Art. 25)"
            )

        # Databehandleraftaler
        if data.get('personoplysninger') and not data.get('databehandleraftaler'):
            betingelser.append(
                "📝 Indgå databehandleraftaler med alle tredjeparter der behandler persondata (GDPR Art. 28)"
            )

        # Uddannelse
        if data.get('medarbejder_uddannelse') != 'ja':
            betingelser.append(
                "🎓 Gennemfør obligatorisk AI og databeskyttelse træning for alle medarbejdere der arbejder med systemet"
            )

        # Ansvarlig person
        if not data.get('ansvarlig_person'):
            betingelser.append(
                "👤 Udpeg en ansvarlig person/AI-koordinator med mandat til at træffe beslutninger og håndtere klager"
            )

        # Dokumentation
        if data.get('beslutningslogik_dokumentation') != 'ja':
            betingelser.append(
                "📖 Dokumenter AI-systemets beslutningslogik, algoritmer og datakilder"
            )

        # Bias testing
        if data.get('bias_testing') != 'ja' and data.get('kritiske_formaal'):
            betingelser.append(
                "⚖️ Implementer bias testing og fairness monitoring inden deployment"
            )

        # Klage procedurer
        if not data.get('klage_procedurer'):
            betingelser.append(
                "📢 Etabler klage- og appelprocedurer for berørte personer"
            )

        # Transparens
        if data.get('transparens') != 'ja':
            betingelser.append(
                "💡 Implementer transparens-mekanismer så brugere kan forstå systemets beslutninger"
            )

        return betingelser

    def _bestem_beslutning(
        self,
        risiko_score: int,
        hard_stops: List[str],
        betingelser: List[str]
    ) -> Beslutning:
        """Bestem endelig GO/NO-GO/BETINGET-GO beslutning."""

        # Hard stops = automatisk NO-GO
        if hard_stops:
            return Beslutning.NO_GO

        # Meget høj risiko = NO-GO
        if risiko_score >= 80:
            return Beslutning.NO_GO

        # Høj risiko eller mange betingelser = BETINGET-GO
        if risiko_score >= 50 or len(betingelser) >= 5:
            return Beslutning.BETINGET_GO

        # Nogen betingelser = BETINGET-GO
        if betingelser:
            return Beslutning.BETINGET_GO

        # Lav risiko, ingen blokeringer = GO
        return Beslutning.GO

    def _generer_beslutning_beskrivelse(
        self,
        beslutning: Beslutning,
        system_navn: str,
        risiko_niveau: RisikoNiveau
    ) -> str:
        """Generer menneskelæselig beskrivelse af beslutningen."""

        if beslutning == Beslutning.GO:
            return (
                f"✅ AI-systemet '{system_navn}' kan godkendes til implementering. "
                f"Risikoniveau er vurderet som {risiko_niveau.value.lower()}, og alle grundlæggende "
                f"compliance krav er opfyldt. Systemet kan ibrugtages med løbende monitorering og dokumentation."
            )

        elif beslutning == Beslutning.BETINGET_GO:
            return (
                f"⚠️ AI-systemet '{system_navn}' kan godkendes BETINGET. "
                f"Risikoniveau er {risiko_niveau.value.lower()}. Systemet må kun ibrugtages når alle nedenstående "
                f"betingelser er opfyldt. Implementering skal ske i faser med løbende evaluering."
            )

        else:  # NO-GO
            return (
                f"❌ AI-systemet '{system_navn}' kan IKKE godkendes i nuværende form. "
                f"Risikoniveau er {risiko_niveau.value.lower()}, og der er identificeret kritiske blokeringer. "
                f"Systemet må ikke implementeres før alle hard stops er løst og compliance er dokumenteret."
            )

    def _identificer_artefakter(self, data: Dict[str, Any]) -> List[Dict[str, str]]:
        """Identificer nødvendige dokumenter og artefakter."""
        artefakter = []

        # Basis artefakter for alle AI systemer
        artefakter.append({
            "navn": "AI System Specifikation",
            "beskrivelse": "Detaljeret beskrivelse af AI-systemets funktionalitet, formål, datakilder og algoritmer",
            "kategori": "Grundlæggende",
            "template_url": None
        })

        artefakter.append({
            "navn": "Risikovurdering (AI Act)",
            "beskrivelse": "Formel vurdering af systemets risikokategori under EU AI Act",
            "kategori": "AI Act Compliance",
            "template_url": None
        })

        # GDPR artefakter
        if data.get('personoplysninger'):
            artefakter.append({
                "navn": "Behandlingsgrundlag Dokumentation",
                "beskrivelse": "Dokumentation af juridisk grundlag for behandling af personoplysninger (GDPR Art. 6)",
                "kategori": "GDPR Compliance",
                "template_url": None
            })

            artefakter.append({
                "navn": "Registrering af Behandlingsaktiviteter",
                "beskrivelse": "Fortegnelse over behandlingsaktiviteter (GDPR Art. 30)",
                "kategori": "GDPR Compliance",
                "template_url": None
            })

            if self._kraever_dpia(data):
                artefakter.append({
                    "navn": "DPIA (Databeskyttelseskonsekvensanalyse)",
                    "beskrivelse": "Konsekvensvurdering for høj risiko databehandling (GDPR Art. 35)",
                    "kategori": "GDPR Compliance - Påkrævet",
                    "template_url": None
                })

        # Høj risiko AI artefakter
        if data.get('ai_risiko_kategori') in ['high', 'unacceptable']:
            artefakter.append({
                "navn": "Teknisk Dokumentation (AI Act Art. 11)",
                "beskrivelse": "Omfattende teknisk dokumentation inkl. træningsdata, model arkitektur, validering",
                "kategori": "AI Act Compliance - Påkrævet",
                "template_url": None
            })

            artefakter.append({
                "navn": "Kvalitetsstyringssystem",
                "beskrivelse": "QMS dokumentation for design, udvikling og test af AI-systemet (AI Act Art. 17)",
                "kategori": "AI Act Compliance",
                "template_url": None
            })

            artefakter.append({
                "navn": "Conformity Assessment",
                "beskrivelse": "CE-mærkning dokumentation og overensstemmelseserklæring",
                "kategori": "AI Act Compliance",
                "template_url": None
            })

        # Governance artefakter
        artefakter.append({
            "navn": "AI Governance Framework",
            "beskrivelse": "Organisatorisk rammeværk for ansvarlig AI-brug inkl. roller, ansvar og processer",
            "kategori": "Governance",
            "template_url": None
        })

        if data.get('kritiske_formaal'):
            artefakter.append({
                "navn": "Menneskerettigheder Impact Assessment",
                "beskrivelse": "Vurdering af systemets potentielle indvirkning på grundlæggende rettigheder",
                "kategori": "Etik & Rettigheder",
                "template_url": None
            })

        # Operationelle artefakter
        artefakter.append({
            "navn": "Driftshåndbog for AI-system",
            "beskrivelse": "Vejledning til daglig drift, monitorering og vedligehold af systemet",
            "kategori": "Operations",
            "template_url": None
        })

        artefakter.append({
            "navn": "Incident Response Plan",
            "beskrivelse": "Procedure for håndtering af fejl, bias eller sikkerhedshændelser",
            "kategori": "Operations",
            "template_url": None
        })

        # Uddannelse
        if data.get('medarbejder_uddannelse') != 'ja':
            artefakter.append({
                "navn": "Træningsmateriell for Medarbejdere",
                "beskrivelse": "Uddannelsesmateriale om AI-systemet, databeskyttelse og etiske overvejelser",
                "kategori": "Uddannelse",
                "template_url": None
            })

        return artefakter

    def _identificer_tests(self, data: Dict[str, Any]) -> List[str]:
        """Identificer nødvendige tests før deployment."""
        tests = []

        # Basis tests
        tests.append("Funktionel testing af AI-modellens kernefunktionalitet")
        tests.append("Performance testing under forventet load")
        tests.append("Integration testing med eksisterende systemer")

        # GDPR tests
        if data.get('personoplysninger'):
            tests.append("Data minimering validering (kun nødvendige data behandles)")
            tests.append("Test af ret til sletning (GDPR Art. 17)")
            tests.append("Test af ret til dataportabilitet (GDPR Art. 20)")
            tests.append("Kryptering og sikkerhedsforanstaltninger audit")

        # AI specifikke tests
        if data.get('bruger_ml'):
            tests.append("Model accuracy og precision validering på test data")
            tests.append("Robustness testing (adversarial attacks)")
            tests.append("Data drift detection og monitoring")

        # Bias og fairness tests
        if data.get('kritiske_formaal') or data.get('ai_risiko_kategori') == 'high':
            tests.append("Bias testing på tværs af demografiske grupper")
            tests.append("Fairness metrics evaluering (disparate impact, equal opportunity)")
            tests.append("Intersektionel bias analyse")

        # Transparens tests
        if data.get('transparens') != 'ja':
            tests.append("Explainability testing (LIME, SHAP eller lignende)")
            tests.append("User comprehension testing af forklaringer")

        # Menneskelig kontrol tests
        if data.get('menneskelig_overvaagning') == 'ja':
            tests.append("Human-in-the-loop workflow validering")
            tests.append("Override mechanism testing")

        # Sikkerhed tests
        tests.append("Security audit og penetration testing")
        tests.append("Access control og authentication testing")

        # Compliance tests
        tests.append("End-to-end compliance verification")
        tests.append("Dokumentations-completeness audit")

        return tests

    def _generer_naeste_skridt(self, beslutning: Beslutning, data: Dict[str, Any]) -> List[str]:
        """Generer konkrete næste skridt baseret på beslutning."""
        skridt = []

        if beslutning == Beslutning.NO_GO:
            skridt.append("1. ❌ STOP implementering øjeblikkeligt - systemet må ikke ibrugtages")
            skridt.append("2. 📋 Løs alle identificerede hard stops (se kritiske blokeringer)")
            skridt.append("3. 🔍 Gennemfør dyb compliance audit med juridisk rådgiver")
            skridt.append("4. 🛠️ Redesign system eller implementer nødvendige sikkerhedsforanstaltninger")
            skridt.append("5. 🔄 Gennemfør ny 7-punkts vurdering efter ændringer")
            skridt.append("6. 📞 Kontakt DPO og IT-sikkerhed for yderligere rådgivning")

        elif beslutning == Beslutning.BETINGET_GO:
            skridt.append("1. ✅ Opfyld alle listede betingelser før deployment")
            skridt.append("2. 📋 Færdiggør alle nødvendige artefakter (se liste)")
            skridt.append("3. 🧪 Gennemfør alle påkrævede tests (se testliste)")
            skridt.append("4. 👥 Sikr medarbejder træning er gennemført")
            skridt.append("5. 📊 Implementer monitoreringsdashboard for løbende oversight")
            skridt.append("6. 🚀 Planlæg faseinddelt deployment med pilot-fase")
            skridt.append("7. 📝 Dokumenter alle compliance tiltag i artefaktkatalog")
            skridt.append("8. 🔄 Planlæg 30-dages post-deployment review")

        else:  # GO
            skridt.append("1. ✅ Færdiggør resterende dokumentation (se artefaktliste)")
            skridt.append("2. 🧪 Gennemfør final testing og quality assurance")
            skridt.append("3. 👥 Sikr at alle relevante stakeholders er informeret")
            skridt.append("4. 📊 Opsæt performance og compliance monitoring")
            skridt.append("5. 🚀 Planlæg kontrolleret deployment")
            skridt.append("6. 📅 Etabler review-cyklus (anbefalet: kvartalsvis)")
            skridt.append("7. 📞 Etabler support og incident response kanal")

        return skridt

    def _generer_anbefalinger(self, data: Dict[str, Any], risiko_score: int) -> List[str]:
        """Generer specifikke anbefalinger til forbedring."""
        anbefalinger = []

        # Privacy by design
        if data.get('privacy_by_design') != 'ja':
            anbefalinger.append(
                "🔒 Implementer privacy by design fra starten - det er billigere end at retrofitte senere"
            )

        # Bias monitoring
        if data.get('bias_testing') != 'ja':
            anbefalinger.append(
                "⚖️ Etabler kontinuerlig bias monitoring - bias kan opstå over tid med data drift"
            )

        # Transparens
        if data.get('transparens') != 'ja':
            anbefalinger.append(
                "💡 Overvej explainable AI (XAI) metoder for øget transparens og bruger tillid"
            )

        # Uddannelse
        if data.get('medarbejder_uddannelse') != 'ja':
            anbefalinger.append(
                "🎓 Invester i AI literacy træning - veluddannede medarbejdere reducerer risiko"
            )

        # Governance
        if risiko_score >= 40:
            anbefalinger.append(
                "👔 Etabler AI Ethics Board eller review komité for høj-risiko beslutninger"
            )

        # Certificering
        if data.get('ai_risiko_kategori') == 'high':
            anbefalinger.append(
                "🏆 Overvej ISO/IEC 42001 certificering for AI management system"
            )

        # Vendor management
        if data.get('databehandleraftaler') != 'ja':
            anbefalinger.append(
                "🤝 Implementer robust vendor management for alle AI-leverandører"
            )

        # Documentation
        anbefalinger.append(
            "📖 Hold al dokumentation opdateret - regulatory landscape ændrer sig hurtigt"
        )

        # Proaktiv compliance
        anbefalinger.append(
            "🔍 Udfør årlige compliance audits før regulatory myndigheder banker på døren"
        )

        return anbefalinger

    def _generer_punkt_vurderinger(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Generer detaljerede vurderinger for hvert af de 7 punkter."""
        return {
            "punkt1_ai_system": {
                "titel": "Er det et AI-system?",
                "status": "✅ Ja" if self._er_ai_system(data) else "❌ Nej",
                "vurdering": self._vurder_punkt1(data)
            },
            "punkt2_persondata": {
                "titel": "Behandling af personoplysninger",
                "status": "✅ Ja" if data.get('personoplysninger') else "✅ Nej",
                "vurdering": self._vurder_punkt2(data)
            },
            "punkt3_gdpr": {
                "titel": "Databeskyttelsesregler",
                "status": self._status_punkt3(data),
                "vurdering": self._vurder_punkt3(data)
            },
            "punkt4_ai_act": {
                "titel": "AI-forordningen",
                "status": self._status_punkt4(data),
                "vurdering": self._vurder_punkt4(data)
            },
            "punkt5_uddannelse": {
                "titel": "Medarbejderuddannelse",
                "status": self._status_punkt5(data),
                "vurdering": self._vurder_punkt5(data)
            },
            "punkt6_ressourcer": {
                "titel": "Yderligere ressourcer",
                "status": "📊 Vurderet",
                "vurdering": self._vurder_punkt6(data)
            },
            "punkt7_krav": {
                "titel": "Vejledende krav",
                "status": self._status_punkt7(data),
                "vurdering": self._vurder_punkt7(data)
            }
        }

    def _er_ai_system(self, data: Dict[str, Any]) -> bool:
        """Vurder om systemet kvalificeres som AI system."""
        return (
            data.get('bruger_ml') == True or
            data.get('autonome_beslutninger') == True or
            data.get('behandler_data') == True
        )

    def _kraever_dpia(self, data: Dict[str, Any]) -> bool:
        """Vurder om DPIA er påkrævet."""
        if not data.get('personoplysninger'):
            return False

        # Høj risiko faktorer
        persondata_typer = data.get('persondata_typer', [])
        har_saerlige_kategorier = any(
            dtype in ['Sundhedsdata', 'Biometriske data', 'Særlige kategorier (race, religion, etc.)']
            for dtype in persondata_typer
        )

        return (
            har_saerlige_kategorier or
            data.get('ai_risiko_kategori') in ['high', 'unacceptable'] or
            data.get('automatiserede_beslutninger') == True or
            data.get('kritiske_formaal') == True
        )

    def _vurder_punkt1(self, data: Dict[str, Any]) -> str:
        """Detaljeret vurdering af punkt 1."""
        if self._er_ai_system(data):
            return (
                "Systemet kvalificerer som et AI-system under EU AI Act definition. "
                "Det anvender machine learning, træffer autonome beslutninger eller behandler data "
                "for at generere forudsigelser. AI Act krav er derfor gældende."
            )
        return "Systemet kvalificerer ikke som et AI-system. Basale compliance krav gælder stadig."

    def _vurder_punkt2(self, data: Dict[str, Any]) -> str:
        """Detaljeret vurdering af punkt 2."""
        if not data.get('personoplysninger'):
            return "Systemet behandler ikke personoplysninger. GDPR krav er ikke relevante."

        typer = data.get('persondata_typer', [])
        if typer:
            return f"Systemet behandler personoplysninger inkl. {', '.join(typer)}. Fulde GDPR krav gælder."
        return "Systemet behandler personoplysninger. GDPR compliance påkrævet."

    def _status_punkt3(self, data: Dict[str, Any]) -> str:
        """Status for punkt 3."""
        if not data.get('personoplysninger'):
            return "✅ Ikke relevant"

        har_dpia = data.get('dpia_udfoert') == True
        har_privacy = data.get('privacy_by_design') == 'ja'

        if har_dpia and har_privacy:
            return "✅ Godt styr"
        elif har_dpia or har_privacy:
            return "⚠️ Delvist"
        return "❌ Mangler"

    def _vurder_punkt3(self, data: Dict[str, Any]) -> str:
        """Detaljeret vurdering af punkt 3."""
        if not data.get('personoplysninger'):
            return "GDPR compliance ikke relevant da systemet ikke behandler persondata."

        issues = []
        if not data.get('dpia_udfoert') and self._kraever_dpia(data):
            issues.append("DPIA påkrævet men ikke gennemført")
        if data.get('privacy_by_design') != 'ja':
            issues.append("Privacy by design ikke implementeret")
        if not data.get('databehandleraftaler'):
            issues.append("Databehandleraftaler mangler")

        if issues:
            return f"GDPR compliance mangler: {', '.join(issues)}. Skal løses før deployment."
        return "GDPR compliance er på plads. Fortsæt med god datahygiejne."

    def _status_punkt4(self, data: Dict[str, Any]) -> str:
        """Status for punkt 4."""
        risiko = data.get('ai_risiko_kategori', 'ved_ikke')
        if risiko == 'unacceptable':
            return "❌ Forbudt"
        elif risiko == 'high':
            return "⚠️ Høj risiko"
        elif risiko in ['limited', 'minimal']:
            return "✅ Acceptabel"
        return "❓ Ukendt"

    def _vurder_punkt4(self, data: Dict[str, Any]) -> str:
        """Detaljeret vurdering af punkt 4."""
        risiko = data.get('ai_risiko_kategori', 'ved_ikke')

        vurdering = f"AI-systemet er klassificeret som '{risiko}' risiko. "

        if risiko == 'unacceptable':
            vurdering += "ADVARSEL: Systemet er forbudt under AI Act og må ikke implementeres."
        elif risiko == 'high':
            vurdering += "Omfattende AI Act krav gælder: teknisk dokumentation, QMS, conformity assessment, CE-mærkning."
        elif risiko == 'limited':
            vurdering += "Transparenskrav gælder. Brugere skal informeres om AI-brug."
        elif risiko == 'minimal':
            vurdering += "Minimale compliance krav. Følg best practices."

        return vurdering

    def _status_punkt5(self, data: Dict[str, Any]) -> str:
        """Status for punkt 5."""
        har_uddannelse = data.get('medarbejder_uddannelse') == 'ja'
        har_ansvarlig = data.get('ansvarlig_person') == True

        if har_uddannelse and har_ansvarlig:
            return "✅ Klar"
        elif har_uddannelse or har_ansvarlig:
            return "⚠️ Delvist"
        return "❌ Mangler"

    def _vurder_punkt5(self, data: Dict[str, Any]) -> str:
        """Detaljeret vurdering af punkt 5."""
        if data.get('medarbejder_uddannelse') == 'ja' and data.get('ansvarlig_person'):
            return "Medarbejdere er uddannede og ansvarlig person er udpeget. Godt fundament."
        return "Medarbejderuddannelse og/eller ansvarlig person mangler. Prioriter dette."

    def _vurder_punkt6(self, data: Dict[str, Any]) -> str:
        """Detaljeret vurdering af punkt 6."""
        behov = []
        if data.get('juridisk_raadgivning') == 'ja':
            behov.append("juridisk rådgivning")
        if data.get('teknisk_ekspertise') == 'ja':
            behov.append("teknisk ekspertise")
        if data.get('certificering_behov') == 'ja':
            behov.append("certificering")

        if behov:
            return f"Identificeret behov for: {', '.join(behov)}. Overvej ekstern assistance."
        return "Tilstrækkelige ressourcer in-house. Fortsæt med interne kompetencer."

    def _status_punkt7(self, data: Dict[str, Any]) -> str:
        """Status for punkt 7."""
        har_dok = data.get('beslutningslogik_dokumentation') == 'ja'
        har_bias = data.get('bias_testing') == 'ja'
        har_klage = data.get('klage_procedurer') == True

        score = sum([har_dok, har_bias, har_klage])
        if score == 3:
            return "✅ Komplet"
        elif score >= 2:
            return "⚠️ Næsten"
        return "❌ Mangler"

    def _vurder_punkt7(self, data: Dict[str, Any]) -> str:
        """Detaljeret vurdering af punkt 7."""
        mangler = []
        if data.get('beslutningslogik_dokumentation') != 'ja':
            mangler.append("beslutningslogik dokumentation")
        if data.get('bias_testing') != 'ja':
            mangler.append("bias testing")
        if not data.get('klage_procedurer'):
            mangler.append("klage procedurer")

        if mangler:
            return f"Mangler: {', '.join(mangler)}. Færdiggør disse før go-live."
        return "Alle vejledende krav er på plads. Systemet er klar til deployment."
