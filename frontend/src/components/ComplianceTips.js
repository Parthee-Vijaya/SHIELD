import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaLightbulb,
  FaExclamationTriangle,
  FaCheckCircle,
  FaInfoCircle,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';

const TipsContainer = styled(motion.div)`
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(15, 23, 42, 0.5)'
    : 'rgba(255, 255, 255, 0.7)'};
  backdrop-filter: blur(10px);
  border-radius: ${props => props.theme.borderRadiusLarge};
  border: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.2)'
    : 'rgba(148, 163, 184, 0.25)'};
  padding: 1.5rem;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${props => props.theme.colors.gradients.primary};
  }
`;

const TipHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;

  h3 {
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${props => props.theme.mode === 'dark'
      ? props.theme.colors.white
      : props.theme.colors.gray[800]};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    svg {
      color: ${props => props.theme.colors.primary};
    }
  }
`;

const Navigation = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const NavButton = styled.button`
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.1)'
    : 'rgba(148, 163, 184, 0.15)'};
  border: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.2)'
    : 'rgba(148, 163, 184, 0.25)'};
  color: ${props => props.theme.mode === 'dark'
    ? props.theme.colors.white
    : props.theme.colors.gray[700]};
  border-radius: ${props => props.theme.borderRadius};
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.primary};
    color: white;
    border-color: ${props => props.theme.colors.primary};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  svg {
    font-size: 0.8rem;
  }
`;

const TipContent = styled(motion.div)`
  display: flex;
  gap: 1rem;
`;

const TipIcon = styled.div`
  font-size: 2rem;
  color: ${props => {
    switch (props.$type) {
      case 'warning': return '#f59e0b';
      case 'success': return '#10b981';
      case 'info': return '#3b82f6';
      default: return '#8b5cf6';
    }
  }};
  min-width: 3rem;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0.25rem;
`;

const TipText = styled.div`
  flex: 1;
  min-width: 0;
`;

const TipTitle = styled.h4`
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: ${props => props.theme.mode === 'dark'
    ? props.theme.colors.white
    : props.theme.colors.gray[900]};
`;

const TipDescription = styled.p`
  font-size: 0.875rem;
  line-height: 1.6;
  margin: 0 0 0.75rem 0;
  color: ${props => props.theme.mode === 'dark'
    ? 'rgba(226, 232, 240, 0.8)'
    : 'rgba(51, 65, 85, 0.85)'};
`;

const TipActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const ActionTag = styled.span`
  font-size: 0.7rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-weight: 500;
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(139, 92, 246, 0.2)'
    : 'rgba(139, 92, 246, 0.15)'};
  color: ${props => props.theme.mode === 'dark'
    ? '#c084fc'
    : '#7c3aed'};
  border: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(139, 92, 246, 0.3)'
    : 'rgba(139, 92, 246, 0.25)'};
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const TipCounter = styled.div`
  font-size: 0.7rem;
  color: ${props => props.theme.colors.textMuted};
  margin-top: 1rem;
  text-align: center;
`;

const complianceTips = [
  {
    id: 1,
    type: 'warning',
    icon: FaExclamationTriangle,
    title: 'GDPR Artikel 22 - Automatiserede Beslutninger',
    description: 'Husk at borgere har ret til ikke at være underlagt udelukkende automatiserede beslutninger med retlig effekt. Dit AI-system skal have human oversight hvis det træffer afgørelser om kredit, job, forsikring eller offentlige ydelser.',
    tags: ['GDPR', 'Højrisiko', 'Human Oversight']
  },
  {
    id: 2,
    type: 'tip',
    icon: FaLightbulb,
    title: 'AI Act Højrisiko Checklist',
    description: 'Før du implementerer et AI-system, tjek om det falder under højrisiko kategorier: biometrisk identifikation, kritisk infrastruktur, uddannelse/jobrekruttering, retshåndhævelse eller adgang til offentlige ydelser. Højrisiko systemer kræver konformitetsvurdering og CE-mærkning.',
    tags: ['AI Act', 'Risikovurdering', 'CE-Mærkning']
  },
  {
    id: 3,
    type: 'success',
    icon: FaCheckCircle,
    title: 'DPIA er Din Ven',
    description: 'Data Protection Impact Assessment (DPIA) er påkrævet for højrisiko databehandling. Start altid med en DPIA før du implementerer AI-profilering, automatiserede beslutninger eller systematisk monitoring. EDPB har guidelines der specificerer at de fleste AI/ML-systemer kræver DPIA.',
    tags: ['GDPR', 'DPIA', 'Best Practice']
  },
  {
    id: 4,
    type: 'info',
    icon: FaInfoCircle,
    title: 'Datatilsynets Fokusområder 2025',
    description: 'Datatilsynet har iværksat fokuskampagner om AI i rekruttering og kreditvurdering. Sørg for at dit HR-system eller kreditscoring har dokumentation for fairness, bias-tests og human review procedures. Virksomheder kan søge vejledning hos Datatilsynet før implementering.',
    tags: ['Datatilsynet', 'Compliance', '2025']
  },
  {
    id: 5,
    type: 'warning',
    icon: FaExclamationTriangle,
    title: 'Privacy by Design er Lovkrav',
    description: 'GDPR Artikel 25 kræver at databeskyttelse integreres fra projektets start. Dit AI-system skal bruge dataminimering, pseudonymisering og kryptering som standard. Kun nødvendige personoplysninger må behandles, og brugere skal have maksimale privatlivsindstillinger som default.',
    tags: ['GDPR', 'Privacy by Design', 'Påkrævet']
  },
  {
    id: 6,
    type: 'tip',
    icon: FaLightbulb,
    title: 'Bias Testing er Kritisk',
    description: 'Test dit AI-system for bias across protected characteristics (køn, alder, etnicitet). Brug metrics som Demographic Parity, Equal Opportunity og Disparate Impact Ratio. EU standarder kræver bias testing på repræsentative datasæt for højrisiko AI. Tools: IBM Fairness 360, Microsoft Fairlearn.',
    tags: ['Fairness', 'Testing', 'EU Standarder']
  },
  {
    id: 7,
    type: 'success',
    icon: FaCheckCircle,
    title: 'Modelkort Dokumentation',
    description: 'Best practice er at oprette modelkort for alle AI-systemer. Dokumenter: formål, træningsdata, arkitektur, performance metrics, begrænsninger, bias tests, retligt grundlag for databehandling, DPIA-resultater og incident logs. Google Model Cards og Hugging Face sætter standarden.',
    tags: ['Dokumentation', 'Transparens', 'Best Practice']
  },
  {
    id: 8,
    type: 'info',
    icon: FaInfoCircle,
    title: 'General Purpose AI (GPAI) Krav',
    description: 'Hvis du bruger GPT-4, Claude eller lignende GPAI-modeller, skal du være opmærksom på særlige krav om dokumentation af træningsdata, energiforbrug, modelkort og risikohåndtering. Leverandøren skal dele teknisk dokumentation så du kan vurdere compliance-risici for din specifikke anvendelse.',
    tags: ['AI Act', 'GPAI', 'LLM']
  },
  {
    id: 9,
    type: 'warning',
    icon: FaExclamationTriangle,
    title: 'Incident Rapportering Deadline',
    description: 'Alvorlige hændelser med højrisiko AI skal rapporteres til myndighederne inden for 15 dage. Sørg for at have incident response procedures på plads: detection af model drift/bias, escalation procedures, corrective actions og myndighedsrapportering templates klar.',
    tags: ['AI Act', 'Incident Response', '15 dage']
  },
  {
    id: 10,
    type: 'tip',
    icon: FaLightbulb,
    title: 'AI Governance Framework',
    description: 'Etabler en AI-styregruppe med tværfaglig ekspertise fra jura, IT-sikkerhed, HR og compliance. Opret AI-politikker, risikoregister over AI-systemer, godkendelsesprocesser for nye projekter og løbende monitoring. Best practice: AI Ethics Board til at evaluere AI-risici før implementering.',
    tags: ['Governance', 'Organisation', 'Best Practice']
  }
];

const ComplianceTips = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    // Auto-rotate every 30 seconds
    const interval = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % complianceTips.length);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handlePrevious = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + complianceTips.length) % complianceTips.length);
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % complianceTips.length);
  };

  const currentTip = complianceTips[currentIndex];
  const IconComponent = currentTip.icon;

  const variants = {
    enter: (direction) => ({
      x: direction > 0 ? 20 : -20,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction) => ({
      x: direction < 0 ? 20 : -20,
      opacity: 0
    })
  };

  return (
    <TipsContainer
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <TipHeader>
        <h3>
          <FaLightbulb />
          Compliance Tips
        </h3>
        <Navigation>
          <NavButton onClick={handlePrevious} title="Forrige tip">
            <FaChevronLeft />
          </NavButton>
          <NavButton onClick={handleNext} title="Næste tip">
            <FaChevronRight />
          </NavButton>
        </Navigation>
      </TipHeader>

      <AnimatePresence mode="wait" custom={direction}>
        <TipContent
          key={currentTip.id}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
        >
          <TipIcon $type={currentTip.type}>
            <IconComponent />
          </TipIcon>

          <TipText>
            <TipTitle>{currentTip.title}</TipTitle>
            <TipDescription>{currentTip.description}</TipDescription>
            <TipActions>
              {currentTip.tags.map((tag) => (
                <ActionTag key={tag}>{tag}</ActionTag>
              ))}
            </TipActions>
          </TipText>
        </TipContent>
      </AnimatePresence>

      <TipCounter>
        Tip {currentIndex + 1} af {complianceTips.length}
      </TipCounter>
    </TipsContainer>
  );
};

export default ComplianceTips;
