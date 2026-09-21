"""
Compliance Database Service

Service layer for storing and retrieving compliance assessments with
intelligent recommendation engine based on decision trees.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, UTC
from uuid import uuid4
import logging

from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_

from .models import (
    ComplianceControlAssessment,
    ComplianceHardStop,
    ComplianceBetingelse,
    ComplianceAnbefaling,
    ComplianceArtefakt,
    ComplianceTest,
    ComplianceNaesteSkridt,
    ComplianceBeslutningsTrae,
    QuickCheckHistory
)
from .connection import get_db

logger = logging.getLogger(__name__)


class ComplianceService:
    """
    Service for managing compliance assessments in database.

    Provides methods to:
    - Store and retrieve compliance assessments
    - Generate intelligent recommendations based on historical data
    - Track assessment history
    - Query similar past assessments
    """

    def __init__(self, db: Session):
        """Initialize with database session."""
        self.db = db

    def save_assessment(self, assessment_data: Dict[str, Any]) -> str:
        """
        Gem en compliance control vurdering i databasen.

        Args:
            assessment_data: Komplet vurderingsdata fra ComplianceControlEngine

        Returns:
            Assessment ID (UUID)
        """
        assessment_id = str(uuid4())

        try:
            # Extract main assessment data
            cc_data = assessment_data.get('compliance_control', {})
            system_info = assessment_data.get('system_info', {})
            form_data = assessment_data.get('form_data', assessment_data)  # Fallback to full data

            # Create main assessment record
            assessment = ComplianceControlAssessment(
                id=assessment_id,
                system_navn=system_info.get('system_navn', 'Ukendt system'),
                system_beskrivelse=system_info.get('system_beskrivelse'),
                fagomraade=system_info.get('fagomraade'),
                organisation=system_info.get('organisation', 'Kalundborg Kommune'),
                team=system_info.get('team'),
                kontaktperson=system_info.get('kontaktperson'),
                beslutning=cc_data.get('beslutning', 'pending'),
                beslutning_beskrivelse=cc_data.get('beslutning_beskrivelse'),
                risiko_score=cc_data.get('risiko_score', 0),
                risiko_niveau=cc_data.get('risiko_niveau', 'Ukendt'),
                bruger_ml=form_data.get('bruger_ml', False),
                autonome_beslutninger=form_data.get('autonome_beslutninger', False),
                ai_risiko_kategori=form_data.get('ai_risiko_kategori'),
                behandler_persondata=form_data.get('personoplysninger', False),
                persondata_typer=form_data.get('persondata_typer'),
                juridisk_grundlag=form_data.get('juridisk_grundlag'),
                kraever_dpia=assessment_data.get('samlet_vurdering', {}).get('kraever_dpia', False),
                dpia_udfoert=form_data.get('dpia_udfoert', False),
                form_data=form_data,
                punkt_vurderinger=assessment_data.get('punkt_vurderinger')
            )
            self.db.add(assessment)

            # Save hard stops
            for hard_stop_text in cc_data.get('hard_stops', []):
                hard_stop = ComplianceHardStop(
                    assessment_id=assessment_id,
                    beskrivelse=hard_stop_text,
                    artikel_reference=self._extract_article_reference(hard_stop_text)
                )
                self.db.add(hard_stop)

            # Save betingelser
            for betingelse_text in cc_data.get('betingelser', []):
                betingelse = ComplianceBetingelse(
                    assessment_id=assessment_id,
                    beskrivelse=betingelse_text,
                    kategori=self._extract_category(betingelse_text),
                    prioritet=self._determine_priority(betingelse_text)
                )
                self.db.add(betingelse)

            # Save anbefalinger
            for anbefaling_text in cc_data.get('anbefalinger', []):
                anbefaling = ComplianceAnbefaling(
                    assessment_id=assessment_id,
                    beskrivelse=anbefaling_text,
                    kategori=self._extract_category(anbefaling_text),
                    prioritet=self._determine_priority(anbefaling_text)
                )
                self.db.add(anbefaling)

            # Save artefakter
            for artefakt_data in cc_data.get('nødvendige_artefakter', []):
                if isinstance(artefakt_data, dict):
                    artefakt = ComplianceArtefakt(
                        assessment_id=assessment_id,
                        navn=artefakt_data.get('navn', ''),
                        beskrivelse=artefakt_data.get('beskrivelse'),
                        kategori=artefakt_data.get('kategori'),
                        paakraevet='Påkrævet' in artefakt_data.get('kategori', ''),
                        template_url=artefakt_data.get('template_url')
                    )
                    self.db.add(artefakt)

            # Save tests
            for test_text in cc_data.get('nødvendige_tests', []):
                test = ComplianceTest(
                    assessment_id=assessment_id,
                    beskrivelse=test_text,
                    kategori=self._extract_test_category(test_text)
                )
                self.db.add(test)

            # Save næste skridt
            for i, skridt_text in enumerate(cc_data.get('næste_skridt', []), start=1):
                skridt = ComplianceNaesteSkridt(
                    assessment_id=assessment_id,
                    skridt_nummer=i,
                    beskrivelse=skridt_text
                )
                self.db.add(skridt)

            self.db.commit()
            logger.info(f"Successfully saved compliance assessment: {assessment_id}")
            return assessment_id

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error saving assessment: {e}")
            raise

    def get_assessment(self, assessment_id: str) -> Optional[Dict[str, Any]]:
        """
        Hent en compliance vurdering fra databasen.

        Args:
            assessment_id: UUID af assessment

        Returns:
            Assessment data eller None
        """
        assessment = self.db.query(ComplianceControlAssessment).filter(
            ComplianceControlAssessment.id == assessment_id
        ).first()

        if not assessment:
            return None

        return self._assessment_to_dict(assessment)

    def get_recent_assessments(self, limit: int = 10, organisation: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Hent seneste vurderinger.

        Args:
            limit: Max antal resultater
            organisation: Filter på organisation (optional)

        Returns:
            Liste af assessments
        """
        query = self.db.query(ComplianceControlAssessment)

        if organisation:
            query = query.filter(ComplianceControlAssessment.organisation == organisation)

        assessments = query.order_by(desc(ComplianceControlAssessment.created_at)).limit(limit).all()

        return [self._assessment_to_dict(a) for a in assessments]

    def get_similar_assessments(self, form_data: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
        """
        Find lignende tidligere vurderinger baseret på system karakteristika.

        Bruges til at give kontekstuelle anbefalinger baseret på historiske data.

        Args:
            form_data: Current form data
            limit: Max antal resultater

        Returns:
            Liste af lignende assessments
        """
        # Build query with similarity criteria
        query = self.db.query(ComplianceControlAssessment)

        # Match on AI risk category
        if form_data.get('ai_risiko_kategori'):
            query = query.filter(
                ComplianceControlAssessment.ai_risiko_kategori == form_data.get('ai_risiko_kategori')
            )

        # Match on personal data handling
        if form_data.get('personoplysninger'):
            query = query.filter(
                ComplianceControlAssessment.behandler_persondata == True
            )

        # Match on sector/fagområde
        if form_data.get('fagomraade'):
            query = query.filter(
                ComplianceControlAssessment.fagomraade == form_data.get('fagomraade')
            )

        # Get recent similar assessments
        assessments = query.order_by(desc(ComplianceControlAssessment.created_at)).limit(limit).all()

        return [self._assessment_to_dict(a) for a in assessments]

    def get_recommendations_from_history(self, form_data: Dict[str, Any]) -> List[Dict[str, str]]:
        """
        Generer intelligente anbefalinger baseret på historiske vurderinger.

        Implementerer simpel beslutningslogik baseret på tidligere assessments.

        Args:
            form_data: Current form data

        Returns:
            Liste af anbefalinger med type og beskrivelse
        """
        recommendations = []

        # Find similar assessments
        similar = self.get_similar_assessments(form_data, limit=10)

        if not similar:
            return recommendations

        # Analyze patterns in similar assessments
        go_count = sum(1 for a in similar if a['beslutning'] == 'go')
        no_go_count = sum(1 for a in similar if a['beslutning'] == 'no-go')
        betinget_count = sum(1 for a in similar if a['beslutning'] == 'betinget-go')

        total = len(similar)

        # Generate recommendations based on historical patterns
        if no_go_count / total > 0.5:
            recommendations.append({
                'type': 'warning',
                'beskrivelse': f"⚠ Lignende systemer er ofte afvist ({no_go_count}/{total} assessments). "
                             f"Vær særligt opmærksom på hard stops og compliance krav."
            })

        if betinget_count / total > 0.6:
            recommendations.append({
                'type': 'info',
                'beskrivelse': f"9 Lignende systemer kræver typisk betingelser ({betinget_count}/{total} assessments). "
                             f"Forbered dokumentation og compliance artefakter på forhånd."
            })

        # Analyze common hard stops
        common_hard_stops = self._analyze_common_hard_stops(similar)
        for hard_stop in common_hard_stops[:3]:  # Top 3
            recommendations.append({
                'type': 'warning',
                'beskrivelse': f"⚠ Hyppig hard stop: {hard_stop}"
            })

        # Analyze successful patterns
        successful_patterns = self._analyze_successful_patterns(similar)
        for pattern in successful_patterns[:3]:  # Top 3
            recommendations.append({
                'type': 'best_practice',
                'beskrivelse': f" Succes mønster: {pattern}"
            })

        return recommendations

    def save_quick_check(self, check_data: Dict[str, Any]) -> str:
        """
        Gem en hurtig compliance check i historikken.

        Args:
            check_data: Quick check data inkl. input og results

        Returns:
            Check ID (UUID)
        """
        check_id = str(uuid4())

        try:
            quick_check = QuickCheckHistory(
                id=check_id,
                session_id=check_data.get('session_id'),
                beskrivelse=check_data.get('beskrivelse', ''),
                ai_type=check_data.get('ai_type'),
                sektor=check_data.get('sektor'),
                behandler_persondata=check_data.get('behandler_persondata', False),
                automatiserede_beslutninger=check_data.get('automatiserede_beslutninger', False),
                enable_web_search=check_data.get('enable_web_search', True),
                ai_act_risk_level=check_data.get('results', {}).get('ai_act', {}).get('risk_level'),
                gdpr_relevant=check_data.get('results', {}).get('gdpr', {}).get('relevant'),
                gdpr_requires_dpia=check_data.get('results', {}).get('gdpr', {}).get('requires_dpia'),
                needs_full_assessment=check_data.get('results', {}).get('needs_full_assessment'),
                classification=check_data.get('results', {}).get('rule_engine', {}).get('classification'),
                decision=check_data.get('results', {}).get('rule_engine', {}).get('decision'),
                risk_score=check_data.get('results', {}).get('rule_engine', {}).get('risk_score'),
                response_data=check_data.get('results')
            )

            self.db.add(quick_check)
            self.db.commit()
            logger.info(f"Successfully saved quick check: {check_id}")
            return check_id

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error saving quick check: {e}")
            raise

    # Private helper methods

    def _assessment_to_dict(self, assessment: ComplianceControlAssessment) -> Dict[str, Any]:
        """Convert assessment ORM object to dict."""
        return {
            'id': assessment.id,
            'created_at': assessment.created_at.isoformat(),
            'system_navn': assessment.system_navn,
            'system_beskrivelse': assessment.system_beskrivelse,
            'fagomraade': assessment.fagomraade,
            'organisation': assessment.organisation,
            'beslutning': assessment.beslutning,
            'beslutning_beskrivelse': assessment.beslutning_beskrivelse,
            'risiko_score': assessment.risiko_score,
            'risiko_niveau': assessment.risiko_niveau,
            'hard_stops': [hs.beskrivelse for hs in assessment.hard_stops],
            'betingelser': [
                {
                    'beskrivelse': b.beskrivelse,
                    'kategori': b.kategori,
                    'status': b.status,
                    'prioritet': b.prioritet
                }
                for b in assessment.betingelser
            ],
            'anbefalinger': [
                {
                    'beskrivelse': a.beskrivelse,
                    'kategori': a.kategori,
                    'implementeret': a.implementeret
                }
                for a in assessment.anbefalinger
            ],
            'artefakter': [
                {
                    'navn': art.navn,
                    'beskrivelse': art.beskrivelse,
                    'kategori': art.kategori,
                    'paakraevet': art.paakraevet,
                    'fuldfoert': art.fuldfoert
                }
                for art in assessment.artefakter
            ],
            'tests': [
                {
                    'beskrivelse': t.beskrivelse,
                    'kategori': t.kategori,
                    'status': t.status
                }
                for t in assessment.tests
            ],
            'naeste_skridt': [
                {
                    'skridt_nummer': ns.skridt_nummer,
                    'beskrivelse': ns.beskrivelse,
                    'fuldfoert': ns.fuldfoert
                }
                for ns in assessment.naeste_skridt
            ],
            'form_data': assessment.form_data,
            'punkt_vurderinger': assessment.punkt_vurderinger
        }

    def _extract_article_reference(self, text: str) -> Optional[str]:
        """Extract article reference from text (e.g., 'GDPR Art. 6')."""
        import re
        match = re.search(r'(AI Act|GDPR|AI-forordningen)\s+(Art\.|Artikel)\s*\d+', text)
        return match.group(0) if match else None

    def _extract_category(self, text: str) -> Optional[str]:
        """Extract category from text."""
        if 'GDPR' in text or 'persondata' in text.lower():
            return 'GDPR'
        elif 'AI Act' in text or 'AI-forordningen' in text:
            return 'AI Act'
        elif 'uddannelse' in text.lower() or 'træning' in text.lower():
            return 'Uddannelse'
        elif 'dokumentation' in text.lower():
            return 'Dokumentation'
        else:
            return 'Generelt'

    def _determine_priority(self, text: str) -> int:
        """Determine priority based on text content (0=low, 1=medium, 2=high)."""
        if 'KRITISK' in text or 'påkrævet' in text.lower() or 'DPIA' in text:
            return 2
        elif 'skal' in text.lower() or 'obligatorisk' in text.lower():
            return 1
        else:
            return 0

    def _extract_test_category(self, text: str) -> Optional[str]:
        """Extract test category from description."""
        text_lower = text.lower()
        if 'bias' in text_lower or 'fairness' in text_lower:
            return 'Bias & Fairness'
        elif 'security' in text_lower or 'sikkerhed' in text_lower:
            return 'Security'
        elif 'gdpr' in text_lower or 'data' in text_lower:
            return 'GDPR Compliance'
        elif 'performance' in text_lower:
            return 'Performance'
        else:
            return 'Functional'

    def _analyze_common_hard_stops(self, assessments: List[Dict[str, Any]]) -> List[str]:
        """Analyze common hard stops across similar assessments."""
        hard_stop_counts: Dict[str, int] = {}

        for assessment in assessments:
            for hard_stop in assessment.get('hard_stops', []):
                # Simplify hard stop for comparison
                simplified = hard_stop[:100]  # First 100 chars
                hard_stop_counts[simplified] = hard_stop_counts.get(simplified, 0) + 1

        # Sort by frequency
        sorted_stops = sorted(hard_stop_counts.items(), key=lambda x: x[1], reverse=True)
        return [stop[0] for stop in sorted_stops if stop[1] >= 2]  # At least 2 occurrences

    def _analyze_successful_patterns(self, assessments: List[Dict[str, Any]]) -> List[str]:
        """Analyze patterns in successful (GO) assessments."""
        patterns = []

        go_assessments = [a for a in assessments if a['beslutning'] == 'go']

        if not go_assessments:
            return patterns

        # Check for common success factors
        dpia_count = sum(1 for a in go_assessments if a.get('form_data', {}).get('dpia_udfoert'))
        if dpia_count / len(go_assessments) > 0.7:
            patterns.append("DPIA gennemført på forhånd øger success rate betydeligt")

        privacy_count = sum(1 for a in go_assessments if a.get('form_data', {}).get('privacy_by_design') == 'ja')
        if privacy_count / len(go_assessments) > 0.7:
            patterns.append("Privacy by design implementation korrelerer med godkendelse")

        uddannelse_count = sum(1 for a in go_assessments if a.get('form_data', {}).get('medarbejder_uddannelse') == 'ja')
        if uddannelse_count / len(go_assessments) > 0.7:
            patterns.append("Medarbejderuddannelse er typisk på plads ved godkendte systemer")

        return patterns


def get_compliance_service(db: Session = None) -> ComplianceService:
    """Factory function to get ComplianceService instance."""
    if db is None:
        db = next(get_db())
    return ComplianceService(db)
