"""
Intelligent Recommendation Engine for AI Compliance

Baseret på GDPR, EU AI Act og Datatilsynet guidelines.
Giver specifikke anbefalinger baseret på brugerens svar.
"""

from typing import Dict, List, Any
from dataclasses import dataclass


@dataclass
class Recommendation:
    """En compliance anbefaling"""
    type: str  # DPIA, risikovurdering, juridisk_rådgivning, test, dokumentation
    prioritet: int  # 1=Kritisk, 2=Høj, 3=Medium, 4=Lav
    titel: str
    beskrivelse: str
    lovgrundlag: str
    handlinger: List[str]
    ressourcer: List[Dict[str, str]]  # Links til guides, templates, etc.


class RecommendationEngine:
    """
    Intelligent motor der analyserer formular svar og genererer
    specifikke compliance anbefalinger baseret på decision tree logik.
    """

    def __init__(self):
        self.recommendations: List[Recommendation] = []

    def analyze_and_recommend(self, form_data: Dict[str, Any]) -> List[Recommendation]:
        """
        Analyser formular data og generer anbefalinger.

        Følger decision tree logik fra:
        - GDPR Art. 35 (DPIA krav)
        - EU AI Act risk-baseret klassifikation
        - Datatilsynet AI guidelines
        """
        self.recommendations = []

        # Tjek DPIA krav
        self._check_dpia_requirements(form_data)

        # Tjek AI Act compliance
        self._check_ai_act_requirements(form_data)

        # Tjek bias testing krav
        self._check_bias_testing_requirements(form_data)

        # Tjek sikkerhedskrav
        self._check_security_requirements(form_data)

        # Tjek menneske-i-loop krav
        self._check_human_oversight_requirements(form_data)

        # Tjek transparens krav
        self._check_transparency_requirements(form_data)

        # Tjek juridisk grundlag
        self._check_legal_basis_requirements(form_data)

        # Sorter efter prioritet
        self.recommendations.sort(key=lambda r: r.prioritet)

        return self.recommendations

    def _check_dpia_requirements(self, data: Dict[str, Any]):
        """
        GDPR Art. 35: DPIA er påkrævet hvis mindst 2 af følgende kriterier er opfyldt:

        9 kriterier fra EDPB:
        1. Evaluering/scoring (profiling)
        2. Automatiseret beslutningstagning med juridisk effekt
        3. Systematisk monitorering
        4. Følsomme data (special categories)
        5. Storskala behandling
        6. Matching/kombination af datasæt
        7. Sårbare personer (børn, ældre, etc.)
        8. Innovativ teknologi
        9. Transfer uden for EU
        """
        dpia_score = 0
        criteria_met = []

        # Kriterium 1: Evaluering/scoring
        if data.get('bruger_ml') or data.get('profiling'):
            dpia_score += 1
            criteria_met.append("Bruger ML/profiling til evaluering")

        # Kriterium 2: Automatiseret beslutningstagning
        if data.get('autonome_beslutninger') or data.get('automatisk_beslutning'):
            dpia_score += 1
            criteria_met.append("Træffer automatiserede beslutninger")

        # Kriterium 4: Følsomme data
        sensitive_data_types = data.get('persondata_typer', [])
        if any(t in str(sensitive_data_types).lower() for t in [
            'helbredsoplysninger', 'genetiske', 'biometriske',
            'race', 'religion', 'politisk', 'fagforening', 'seksuel'
        ]):
            dpia_score += 1
            criteria_met.append("Behandler følsomme personoplysninger")

        # Kriterium 5: Storskala behandling
        if data.get('antal_registrerede', '').lower() in ['mere end 10.000', 'mere end 100.000']:
            dpia_score += 1
            criteria_met.append("Storskala behandling af persondata")

        # Kriterium 7: Sårbare personer
        målgruppe = data.get('målgruppe', '').lower()
        if any(v in målgruppe for v in ['børn', 'ældre', 'handicappede', 'psykisk', 'sårbar']):
            dpia_score += 1
            criteria_met.append("Målgruppe inkluderer sårbare personer")

        # Kriterium 8: Innovativ teknologi (AI er typisk innovativ)
        if data.get('bruger_ml') or data.get('ai_risiko_kategori') in ['limited', 'high', 'unacceptable']:
            dpia_score += 1
            criteria_met.append("Bruger innovativ AI/ML teknologi")

        # Hvis 2+ kriterier er opfyldt: DPIA er PÅKRÆVET
        if dpia_score >= 2:
            self.recommendations.append(Recommendation(
                type="DPIA",
                prioritet=1,  # KRITISK
                titel="📋 Gennemfør Data Protection Impact Assessment (DPIA)",
                beskrivelse=f"Dit AI-system opfylder {dpia_score} DPIA-kriterier, hvilket gør DPIA obligatorisk under GDPR Art. 35. "
                           f"Kriterier opfyldt: {', '.join(criteria_met)}",
                lovgrundlag="GDPR Art. 35 - Data Protection Impact Assessment",
                handlinger=[
                    "1. Download Datatilsynets DPIA skabelon",
                    "2. Identificer og beskriv behandlingsaktiviteter",
                    "3. Vurder nødvendighed og proportionalitet",
                    "4. Identificer risici for registreredes rettigheder",
                    "5. Planlæg konkrete afbødende foranstaltninger",
                    "6. Dokumenter vurderingen og beslutninger",
                    "7. Inddrag DPO (databeskyttelsesrådgiver) hvis relevant",
                    "8. Revurder DPIA ved væsentlige ændringer"
                ],
                ressourcer=[
                    {"titel": "Datatilsynets DPIA guide", "url": "https://www.datatilsynet.dk/hvad-siger-reglerne/vejledning/konsekvensanalyse"},
                    {"titel": "EU DPIA template", "url": "https://gdpr.eu/data-protection-impact-assessment-template/"},
                    {"titel": "ICO DPIA guidance", "url": "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/"}
                ]
            ))
        elif dpia_score == 1:
            # Anbefal DPIA selvom ikke påkrævet
            self.recommendations.append(Recommendation(
                type="DPIA",
                prioritet=2,  # HØJ
                titel="📋 Overvej Data Protection Impact Assessment (DPIA)",
                beskrivelse=f"Dit system opfylder {dpia_score} DPIA-kriterie. Selvom ikke formelt påkrævet, "
                           "anbefales DPIA for at demonstrere compliance og best practice.",
                lovgrundlag="GDPR Art. 35 - Data Protection Impact Assessment (frivillig)",
                handlinger=[
                    "1. Vurder om yderligere kriterier kan være relevante",
                    "2. Dokumentér hvorfor DPIA ikke er påkrævet (hvis du vælger at springe over)",
                    "3. Overvej alligevel at gennemføre DPIA for best practice"
                ],
                ressourcer=[
                    {"titel": "DPIA decision flowchart", "url": "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/"}
                ]
            ))

    def _check_ai_act_requirements(self, data: Dict[str, Any]):
        """
        EU AI Act krav baseret på risiko-klassifikation:
        - Unacceptable risk: FORBUDT
        - High risk: Omfattende compliance krav
        - Limited risk: Transparens krav
        - Minimal risk: Ingen specifikke krav
        """
        ai_risk = data.get('ai_risiko_kategori', 'minimal').lower()

        if ai_risk == 'unacceptable':
            self.recommendations.append(Recommendation(
                type="juridisk_rådgivning",
                prioritet=1,  # KRITISK
                titel="⚠️ KRITISK: AI-systemet kan være forbudt under EU AI Act",
                beskrivelse="Dit system er klassificeret som 'unacceptable risk' under EU AI Act. "
                           "Sådanne systemer er forbudt i EU fra februar 2025.",
                lovgrundlag="EU AI Act Art. 5 - Prohibited AI Practices",
                handlinger=[
                    "1. STOP udvikling og deployment omgående",
                    "2. Kontakt juridisk rådgiver specialiseret i AI regulation",
                    "3. Vurder om systemet kan redesignes til lavere risiko-kategori",
                    "4. Dokumentér alle beslutninger grundigt"
                ],
                ressourcer=[
                    {"titel": "EU AI Act - Prohibited practices", "url": "https://artificialintelligenceact.eu/high-level-summary/"},
                    {"titel": "AI Act compliance checker", "url": "https://artificialintelligenceact.eu/assessment/eu-ai-act-compliance-checker/"}
                ]
            ))

        elif ai_risk == 'high':
            self.recommendations.append(Recommendation(
                type="dokumentation",
                prioritet=1,  # KRITISK
                titel="📚 High-Risk AI System: Omfattende compliance dokumentation påkrævet",
                beskrivelse="Dit AI-system er klassificeret som high-risk under EU AI Act. "
                           "Dette medfører omfattende krav til dokumentation, test og governance fra august 2025.",
                lovgrundlag="EU AI Act Art. 9-15 - High-Risk AI Systems",
                handlinger=[
                    "1. Etablér risk management system (Art. 9)",
                    "2. Dokumentér data governance praksis (Art. 10)",
                    "3. Udarbejd teknisk dokumentation (Art. 11 & Annex IV)",
                    "4. Implementér record-keeping system (logs) (Art. 12)",
                    "5. Sikr transparens og information til brugere (Art. 13)",
                    "6. Implementér human oversight mekanismer (Art. 14)",
                    "7. Sikr accuracy, robustness og cybersecurity (Art. 15)",
                    "8. Planlæg conformity assessment (CE marking)"
                ],
                ressourcer=[
                    {"titel": "AI Act compliance timeline", "url": "https://artificialintelligenceact.eu/implementation-timeline/"},
                    {"titel": "High-risk AI requirements", "url": "https://securiti.ai/infographics/eu-ai-act-august-2-2025/"}
                ]
            ))

            # Tilføj krav om bias testing for high-risk systemer
            self.recommendations.append(Recommendation(
                type="test",
                prioritet=1,
                titel="🧪 High-Risk AI: Obligatorisk bias og fairness testing",
                beskrivelse="High-risk AI systemer skal testes for bias, diskrimination og fairness før deployment.",
                lovgrundlag="EU AI Act Art. 10 (Data Governance) & Art. 15 (Accuracy/Robustness)",
                handlinger=[
                    "1. Test for demografisk bias (køn, alder, etnicitet, etc.)",
                    "2. Evaluer fairness metrics (disparate impact, equal opportunity)",
                    "3. Dokumentér test resultater og afbødende tiltag",
                    "4. Etablér kontinuerlig monitoring efter deployment",
                    "5. Opret plan for bias mitigation"
                ],
                ressourcer=[
                    {"titel": "AI Fairness 360 (IBM)", "url": "https://aif360.mybluemix.net/"},
                    {"titel": "Fairlearn (Microsoft)", "url": "https://fairlearn.org/"},
                    {"titel": "EU Guidelines on AI Ethics", "url": "https://digital-strategy.ec.europa.eu/en/library/ethics-guidelines-trustworthy-ai"}
                ]
            ))

    def _check_bias_testing_requirements(self, data: Dict[str, Any]):
        """Tjek om bias testing er nødvendigt"""
        # Hvis systemet påvirker individer eller træffer beslutninger
        if data.get('påvirker_individer') or data.get('autonome_beslutninger'):
            målgruppe = data.get('målgruppe', '').lower()

            # Særligt kritisk hvis det påvirker sårbare grupper
            if any(v in målgruppe for v in ['borgere', 'ansøgere', 'patienter', 'elever']):
                self.recommendations.append(Recommendation(
                    type="test",
                    prioritet=2,  # HØJ
                    titel="🧪 Gennemfør bias og fairness testing",
                    beskrivelse="Dit AI-system træffer beslutninger der påvirker individer. "
                               "Test for ubevidst bias er essentielt for fair behandling.",
                    lovgrundlag="GDPR Art. 22 (Automatiseret beslutningstagning) & EU AI Act Art. 10",
                    handlinger=[
                        "1. Identificér potentielle bias-dimensioner (køn, alder, bopæl, etc.)",
                        "2. Analyser træningsdata for repræsentativitet",
                        "3. Test model output for diskrimination",
                        "4. Dokumentér findings og korrigerende handlinger",
                        "5. Etablér monitoring for bias efter deployment"
                    ],
                    ressourcer=[
                        {"titel": "Datatilsynets guide til algoritmer", "url": "https://www.datatilsynet.dk/hvad-siger-reglerne/vejledning/automatiske-individuelle-afgoerelser"},
                        {"titel": "Fairness testing tools", "url": "https://github.com/fairlearn/fairlearn"}
                    ]
                ))

    def _check_security_requirements(self, data: Dict[str, Any]):
        """Tjek sikkerhedskrav"""
        if data.get('behandler_persondata'):
            # Basis sikkerhedskrav for alle systemer med persondata
            prioritet = 2  # HØJ

            # Forhøj til KRITISK hvis følsomme data
            sensitive_data_types = data.get('persondata_typer', [])
            if any(t in str(sensitive_data_types).lower() for t in [
                'helbredsoplysninger', 'genetiske', 'biometriske', 'cpr'
            ]):
                prioritet = 1

            self.recommendations.append(Recommendation(
                type="test",
                prioritet=prioritet,
                titel="🔒 Gennemfør sikkerhedsaudit og penetration testing",
                beskrivelse="Persondata skal beskyttes med passende tekniske og organisatoriske foranstaltninger.",
                lovgrundlag="GDPR Art. 32 - Security of Processing",
                handlinger=[
                    "1. Gennemfør risikovurdering af IT-sikkerhed",
                    "2. Implementér kryptering (data at rest og in transit)",
                    "3. Etablér adgangskontrol og authentication",
                    "4. Test for almindelige sårbarheder (OWASP Top 10)",
                    "5. Opret incident response plan",
                    "6. Dokumentér sikkerhedsforanstaltninger",
                    "7. Planlæg regelmæssige sikkerhedsaudits"
                ],
                ressourcer=[
                    {"titel": "NIST Cybersecurity Framework", "url": "https://www.nist.gov/cyberframework"},
                    {"titel": "OWASP AI Security", "url": "https://owasp.org/www-project-machine-learning-security-top-10/"},
                    {"titel": "Datatilsynet sikkerhedsvejledning", "url": "https://www.datatilsynet.dk/hvad-siger-reglerne/vejledning/sikkerhed"}
                ]
            ))

    def _check_human_oversight_requirements(self, data: Dict[str, Any]):
        """Tjek krav til menneskelig kontrol"""
        if data.get('autonome_beslutninger') and not data.get('menneske_i_loop'):
            self.recommendations.append(Recommendation(
                type="risikovurdering",
                prioritet=1,  # KRITISK
                titel="👤 Implementér menneske-i-loop (human oversight)",
                beskrivelse="Automatiserede beslutninger der påvirker individer kræver menneskelig kontrol.",
                lovgrundlag="GDPR Art. 22 & EU AI Act Art. 14 (Human Oversight)",
                handlinger=[
                    "1. Design interface for menneskelig review af AI-beslutninger",
                    "2. Definer hvornår menneskelig intervention er påkrævet",
                    "3. Træn personale i at forstå og overrule AI-beslutninger",
                    "4. Dokumentér oversight procedures",
                    "5. Etablér eskalationsproces for tvivlstilfælde",
                    "6. Log alle menneskelige interventioner"
                ],
                ressourcer=[
                    {"titel": "EU Guidelines on Human Oversight", "url": "https://digital-strategy.ec.europa.eu/en/library/ethics-guidelines-trustworthy-ai"},
                    {"titel": "GDPR Art. 22 guide", "url": "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/rights-related-to-automated-decision-making-including-profiling/"}
                ]
            ))

    def _check_transparency_requirements(self, data: Dict[str, Any]):
        """Tjek transparens krav"""
        if data.get('bruger_ml') or data.get('autonome_beslutninger'):
            self.recommendations.append(Recommendation(
                type="dokumentation",
                prioritet=2,  # HØJ
                titel="📄 Udarbejd transparens dokumentation og bruger-information",
                beskrivelse="Brugere har ret til at vide at de interagerer med AI og hvordan beslutninger træffes.",
                lovgrundlag="GDPR Art. 13-14 (Information Obligation) & EU AI Act Art. 13",
                handlinger=[
                    "1. Udarbejd privacy notice der forklarer AI-brug",
                    "2. Beskriv AI-systemets logik i forståelige termer",
                    "3. Informér om betydningen og konsekvenser af AI-beslutninger",
                    "4. Forklar registreredes rettigheder (indsigt, sletning, mv.)",
                    "5. Opret FAQ om AI-systemet",
                    "6. Gør information let tilgængelig i interface"
                ],
                ressourcer=[
                    {"titel": "GDPR privacy notice templates", "url": "https://gdpr.eu/privacy-notice/"},
                    {"titel": "AI transparency guidelines", "url": "https://digital-strategy.ec.europa.eu/en/library/ethics-guidelines-trustworthy-ai"}
                ]
            ))

    def _check_legal_basis_requirements(self, data: Dict[str, Any]):
        """Tjek juridisk grundlag"""
        if data.get('behandler_persondata') and not data.get('juridisk_grundlag'):
            self.recommendations.append(Recommendation(
                type="juridisk_rådgivning",
                prioritet=1,  # KRITISK
                titel="⚖️ KRITISK: Identificér juridisk grundlag for databehandling",
                beskrivelse="Al behandling af personoplysninger kræver et gyldigt juridisk grundlag under GDPR Art. 6.",
                lovgrundlag="GDPR Art. 6 - Lawfulness of Processing",
                handlinger=[
                    "1. Identificér relevant juridisk grundlag:",
                    "   a) Samtykke (Art. 6(1)(a))",
                    "   b) Kontraktopfyldelse (Art. 6(1)(b))",
                    "   c) Lovmæssig forpligtelse (Art. 6(1)(c))",
                    "   d) Vital interesse (Art. 6(1)(d))",
                    "   e) Offentlig opgave (Art. 6(1)(e)) - Relevant for offentlige myndigheder",
                    "   f) Legitim interesse (Art. 6(1)(f))",
                    "2. Dokumentér valg af grundlag og begrundelse",
                    "3. Hvis følsomme data: identificér særskilt grundlag (Art. 9)",
                    "4. Opdater privacy notice med juridisk grundlag"
                ],
                ressourcer=[
                    {"titel": "Datatilsynets guide til behandlingsgrundlag", "url": "https://www.datatilsynet.dk/hvad-siger-reglerne/grundlaeggende-begreber-/behandling-af-personoplysninger"},
                    {"titel": "ICO lawful basis tool", "url": "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/lawful-basis-interactive-guidance-tool/"}
                ]
            ))


def get_recommendations_from_form(form_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Public API funktion der returnerer anbefalinger baseret på formular data.

    Returns:
        List af anbefalinger som dicts (til JSON serialization)
    """
    engine = RecommendationEngine()
    recommendations = engine.analyze_and_recommend(form_data)

    # Konverter til dicts
    return [
        {
            "type": r.type,
            "prioritet": r.prioritet,
            "prioritet_label": ["", "KRITISK", "HØJ", "MEDIUM", "LAV"][r.prioritet],
            "titel": r.titel,
            "beskrivelse": r.beskrivelse,
            "lovgrundlag": r.lovgrundlag,
            "handlinger": r.handlinger,
            "ressourcer": r.ressourcer
        }
        for r in recommendations
    ]
