"""
Database Initialization Script

Initializes database with schema and optionally loads mock data
for testing and demonstration purposes.
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timedelta, UTC
from uuid import uuid4
import logging

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy.orm import Session
from src.database.connection import engine, Base, SessionLocal, check_db_connection
from src.database.models import (
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_database():
    """Initialize database schema."""
    logger.info("Initializing database schema...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database schema created successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to create database schema: {e}")
        return False


def load_mock_data():
    """Load realistic mock data for testing."""
    logger.info("Loading mock compliance assessment data...")

    db = SessionLocal()
    try:
        # Mock Assessment 1: GO - Simpel chatbot
        assessment_id_1 = str(uuid4())
        assessment1 = ComplianceControlAssessment(
            id=assessment_id_1,
            created_at=datetime.now(UTC) - timedelta(days=45),
            system_navn="Borgerservice Chatbot",
            system_beskrivelse="Simpel FAQ chatbot til borgerservice der besvarer almindelige spørgsmål om åbningstider, kontaktinfo og procedurer",
            fagomraade="Borgerservice",
            organisation="Kalundborg Kommune",
            team="Digitalisering",
            kontaktperson="Anne Jensen",
            beslutning="go",
            beslutning_beskrivelse="✅ AI-systemet 'Borgerservice Chatbot' kan godkendes til implementering. Risikoniveau er vurderet som lav, og alle grundlæggende compliance krav er opfyldt.",
            risiko_score=15,
            risiko_niveau="Lav",
            bruger_ml=False,
            autonome_beslutninger=False,
            ai_risiko_kategori="minimal",
            behandler_persondata=False,
            kraever_dpia=False,
            dpia_udfoert=False,
            form_data={
                "system_navn": "Borgerservice Chatbot",
                "bruger_ml": False,
                "autonome_beslutninger": False,
                "personoplysninger": False,
                "ai_risiko_kategori": "minimal"
            }
        )
        db.add(assessment1)

        # Mock Assessment 2: BETINGET-GO - Rekrutteringssystem
        assessment_id_2 = str(uuid4())
        assessment2 = ComplianceControlAssessment(
            id=assessment_id_2,
            created_at=datetime.now(UTC) - timedelta(days=30),
            system_navn="Smart Rekrutteringsassistent",
            system_beskrivelse="AI-drevet system til screening af jobansøgninger og ranking af kandidater baseret på kompetencer",
            fagomraade="HR og Personale",
            organisation="Kalundborg Kommune",
            team="HR",
            kontaktperson="Peter Nielsen",
            beslutning="betinget-go",
            beslutning_beskrivelse="⚠️ AI-systemet 'Smart Rekrutteringsassistent' kan godkendes BETINGET. Risikoniveau er høj.",
            risiko_score=62,
            risiko_niveau="Høj",
            bruger_ml=True,
            autonome_beslutninger=True,
            ai_risiko_kategori="high",
            behandler_persondata=True,
            persondata_typer=["Almindelige personoplysninger", "CV data"],
            juridisk_grundlag="Offentlig opgave (GDPR Art. 6(1)(e))",
            kraever_dpia=True,
            dpia_udfoert=False,
            form_data={
                "system_navn": "Smart Rekrutteringsassistent",
                "bruger_ml": True,
                "ai_risiko_kategori": "high"
            }
        )
        db.add(assessment2)

        # Add betingelser
        db.add(ComplianceBetingelse(
            assessment_id=assessment_id_2,
            beskrivelse="📋 Gennemfør og godkend DPIA inden idriftsættelse (GDPR Art. 35)",
            kategori="GDPR",
            prioritet=2
        ))

        # Mock Assessment 3: NO-GO
        assessment_id_3 = str(uuid4())
        assessment3 = ComplianceControlAssessment(
            id=assessment_id_3,
            created_at=datetime.now(UTC) - timedelta(days=15),
            system_navn="AutoSag - Automatisk Sagsbehandler",
            system_beskrivelse="Fuldt automatiseret system til behandling af sociale ydelser uden menneskelig involvering",
            fagomraade="Social og Sundhed",
            organisation="Kalundborg Kommune",
            beslutning="no-go",
            beslutning_beskrivelse="❌ AI-systemet kan IKKE godkendes i nuværende form.",
            risiko_score=85,
            risiko_niveau="Kritisk",
            bruger_ml=True,
            ai_risiko_kategori="high",
            behandler_persondata=True,
            kraever_dpia=True,
            form_data={"system_navn": "AutoSag"}
        )
        db.add(assessment3)

        # Add hard stop
        db.add(ComplianceHardStop(
            assessment_id=assessment_id_3,
            beskrivelse="❌ KRITISK: Behandling af personoplysninger uden gyldigt juridisk grundlag",
            artikel_reference="GDPR Art. 6"
        ))

        db.commit()
        logger.info("✅ Mock data loaded: 3 assessments created")
        return True

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to load mock data: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def main():
    """Main initialization function."""
    logger.info("🚀 Starting Database Initialization")

    if not check_db_connection():
        logger.error("❌ Cannot connect to database")
        return False

    logger.info("✅ Database connection successful")

    if not init_database():
        return False

    if not load_mock_data():
        return False

    logger.info("✅ Database Initialization Complete!")
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
