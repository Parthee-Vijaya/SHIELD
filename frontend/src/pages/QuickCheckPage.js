import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import ReactSelect from 'react-select';
import {
  FaRocket,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
  FaSpinner,
  FaExternalLinkAlt,
  FaBalanceScale
} from 'react-icons/fa';
import axios from 'axios';
import { FAGOMRAADE_OPTIONS } from '../utils/fagomraadeOptions';
import Tooltip from '../components/Tooltip';

const QuickCheckContainer = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  text-align: center;
  margin-bottom: 2rem;

  h1 {
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
  }

  p {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 1.1rem;
  }
`;

const CheckForm = styled.form`
  background: white;
  padding: 2rem;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  margin-bottom: 2rem;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: ${props => props.columns || '1fr'};
  gap: 1.5rem;
  margin-bottom: 1.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  label {
    font-weight: 600;
    color: ${props => props.theme.colors.gray[700]};
  }
`;

const LabelWithTooltip = styled.div`
  display: flex;
  align-items: center;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
`;

const TextArea = styled.textarea`
  padding: 0.75rem;
  border: 2px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
    outline: none;
  }
`;

const Select = styled.select`
  padding: 0.75rem;
  border: 2px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  background: white;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
    outline: none;
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: ${props => props.theme.colors.primary};
    flex-shrink: 0;
  }

  span {
    color: ${props => props.theme.colors.gray[700]};
    flex: 1;
  }
`;

const SubmitButton = styled.button`
  background: ${props => props.theme.colors.primary};
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
  width: 100%;

  &:hover {
    background: ${props => props.theme.colors.primary}dd;
    transform: translateY(-1px);
  }

  &:disabled {
    background: ${props => props.theme.colors.gray[400]};
    cursor: not-allowed;
    transform: none;
  }
`;

const ResultsContainer = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  overflow: hidden;
`;

const ResultsHeader = styled.div`
  background: ${props => props.theme.colors.success};
  color: white;
  padding: 1.5rem 2rem;
  text-align: center;

  h2 {
    margin: 0 0 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  p {
    margin: 0;
    opacity: 0.9;
  }
`;

const ResultsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  padding: 2rem;
`;

const ResultCard = styled.div`
  text-align: center;

  .icon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
    font-size: 24px;
  }

  .high-risk .icon {
    background: ${props => props.theme.colors.danger}20;
    color: ${props => props.theme.colors.danger};
  }

  .medium-risk .icon {
    background: ${props => props.theme.colors.warning}20;
    color: ${props => props.theme.colors.warning};
  }

  .low-risk .icon {
    background: ${props => props.theme.colors.success}20;
    color: ${props => props.theme.colors.success};
  }

  h3 {
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
  }

  .value {
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .description {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.875rem;
  }
`;

const DetailsSection = styled.div`
  padding: 2rem;
  border-top: 1px solid ${props => props.theme.colors.gray[200]};

  h3 {
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 1rem;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    padding: 0.5rem 0;
    color: ${props => props.theme.colors.gray[700]};
    border-bottom: 1px solid ${props => props.theme.colors.gray[100]};

    &:last-child {
      border-bottom: none;
    }

    &:before {
      content: "• ";
      color: ${props => props.theme.colors.primary};
      font-weight: bold;
    }
  }
`;

const SummaryBanner = styled.div`
  background: ${props => props.theme.mode === 'dark'
    ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.78), rgba(59, 130, 246, 0.25))'
    : 'linear-gradient(135deg, rgba(219, 234, 254, 0.9), rgba(59, 130, 246, 0.18))'};
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 1.8rem 2.2rem;
  border: 1px solid ${props => `${props.theme.colors.primary}29`};
  margin: 0 2rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
`;

const SummaryBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  background: ${props => props.$tone.background};
  color: ${props => props.$tone.text};
  border: 1px solid ${props => props.$tone.border};
  width: fit-content;
`;

const SummaryMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  color: ${props => props.theme.colors.gray[700]};
  font-size: 0.9rem;
`;

const SummaryMetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;

  span {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${props => props.theme.colors.gray[500]};
  }

  strong {
    font-size: 0.95rem;
    color: ${props => props.theme.colors.gray[800]};
  }
`;

const RiskScoreDisplay = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 150px;
`;

const RiskScoreValue = styled.div`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${props => props.theme.colors.gray[800]};
  display: flex;
  align-items: baseline;
  gap: 0.3rem;

  .score {
    font-size: 1.5rem;
    color: ${props => props.$scoreColor || props.theme.colors.gray[800]};
  }

  .max {
    font-size: 0.9rem;
    color: ${props => props.theme.colors.gray[600]};
  }
`;

const RiskScoreBar = styled.div`
  width: 100%;
  height: 8px;
  background: ${props => props.theme.colors.gray[200]};
  border-radius: 999px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: ${props => props.$percentage || 0}%;
    background: ${props => props.$barColor || props.theme.colors.primary};
    border-radius: 999px;
    transition: width 0.6s ease-out;
  }
`;

const SummaryText = styled.p`
  margin: 0;
  line-height: 1.6;
  max-width: 720px;
  color: ${props => props.theme.mode === 'dark'
    ? 'rgba(226, 232, 240, 0.92)'
    : '#1f2937'};
`;

const FindingsList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const FindingItem = styled.li`
  background: ${props => props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius};
  padding: 1rem 1.2rem;
  border-left: 4px solid ${props => props.theme.colors.primary};
  display: flex;
  flex-direction: column;
  gap: 0.45rem;

  strong {
    font-size: 0.9rem;
    color: ${props => props.theme.colors.gray[800]};
  }

  span {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.9rem;
    line-height: 1.45;
  }
`;

const SeverityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  background: ${props => props.severity === 'hard_stop'
    ? 'rgba(220, 38, 38, 0.15)'
    : 'rgba(201, 68, 22, 0.15)'};
  color: ${props => props.severity === 'hard_stop'
    ? '#991b1b'
    : '#7f1d1d'};
  border: 1px solid ${props => props.severity === 'hard_stop'
    ? 'rgba(220, 38, 38, 0.35)'
    : 'rgba(201, 68, 22, 0.4)'};
  width: fit-content;
`;

const FlowList = styled.ol`
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`;

const FlowItem = styled.li`
  color: ${props => props.theme.colors.gray[700]};
  line-height: 1.45;

  strong {
    display: block;
    font-weight: 600;
    color: ${props => props.theme.colors.gray[800]};
  }
`;

const ObligationList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;

  li {
    background: ${props => props.theme.colors.gray[50]};
    border-radius: ${props => props.theme.borderRadius};
    padding: 0.75rem 1rem;
    color: ${props => props.theme.colors.gray[700]};
  }
`;

const ShortSummaryBox = styled.div`
  background: ${props => props.theme.colors.gray[50]};
  border-left: 4px solid ${props => props.theme.colors.primary};
  border-radius: ${props => props.theme.borderRadius};
  padding: 1.5rem;
  margin: 0 2rem 2rem;

  h3 {
    margin: 0 0 0.75rem;
    color: ${props => props.theme.colors.gray[800]};
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  p {
    margin: 0;
    color: ${props => props.theme.colors.gray[700]};
    line-height: 1.6;
    font-size: 0.95rem;
  }
`;

const PrecedentsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const PrecedentItem = styled.a`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: ${props => props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.gray[100]};
    border-color: ${props => props.theme.colors.primary};
    transform: translateX(2px);
  }

  .icon {
    color: ${props => props.theme.colors.primary};
    margin-top: 0.25rem;
    flex-shrink: 0;
  }

  .content {
    flex: 1;

    .title {
      font-weight: 600;
      color: ${props => props.theme.colors.gray[800]};
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .authority {
      font-size: 0.875rem;
      color: ${props => props.theme.colors.gray[600]};
    }
  }
`;

const CTASection = styled.div`
  margin-top: 2.5rem;
  background: ${props => props.theme.mode === 'dark'
    ? 'linear-gradient(135deg, rgba(30,41,59,0.75), rgba(59,130,246,0.2))'
    : 'linear-gradient(135deg, rgba(219, 234, 254, 0.7), rgba(59, 130, 246, 0.12))'};
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 1.8rem 2.2rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: center;
  justify-content: space-between;
  border: 1px solid ${props => props.theme.colors.primary}1A;

  h3 {
    margin: 0 0 0.4rem;
    color: ${props => props.theme.colors.gray[800]};
  }

  p {
    margin: 0;
    color: ${props => props.theme.colors.gray[600]};
    max-width: 520px;
  }
`;

const CTAButton = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.9rem 1.8rem;
  border-radius: 999px;
  background: ${props => props.theme.colors.gradients.primary};
  color: ${props => props.theme.colors.white};
  font-weight: 600;
  text-decoration: none;
  box-shadow: ${props => props.theme.shadows.md};
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }
`;

const PhaseContainer = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  margin-bottom: 1.5rem;
  overflow: hidden;
  border-left: 4px solid ${props => props.$phaseColor || '#C94416'};
`;

const PhaseHeader = styled.div`
  background: ${props => props.$phaseColor || '#C94416'}15;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};

  h3 {
    margin: 0;
    color: ${props => props.theme.colors.gray[800]};
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    svg {
      color: ${props => props.$phaseColor || '#C94416'};
    }
  }

  p {
    margin: 0.5rem 0 0;
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.9rem;
  }
`;

const PhaseBody = styled.div`
  padding: 1.5rem;
`;

const PhaseBanner = styled.div`
  background: linear-gradient(135deg, rgba(201, 68, 22, 0.1), rgba(232, 90, 40, 0.08));
  border: 1px solid rgba(201, 68, 22, 0.2);
  border-radius: ${props => props.theme.borderRadius};
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;

  .icon {
    font-size: 2rem;
    color: #C94416;
  }

  .content {
    flex: 1;

    h4 {
      margin: 0 0 0.5rem;
      color: ${props => props.theme.colors.gray[800]};
      font-size: 1rem;
    }

    p {
      margin: 0;
      color: ${props => props.theme.colors.gray[700]};
      line-height: 1.5;
    }
  }
`;

const ProgressTracker = styled(motion.div)`
  background: ${props => props.theme.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.85) 100%)'
    : 'linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(249, 250, 251, 0.95) 100%)'};
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 2rem 2.5rem;
  margin-bottom: 2rem;
  border: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.15)'
    : 'rgba(201, 68, 22, 0.12)'};
  box-shadow: ${props => props.theme.mode === 'dark'
    ? '0 10px 40px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)'
    : '0 10px 40px rgba(201, 68, 22, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)'};
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #C94416 0%, #E85A28 50%, #C94416 100%);
    background-size: 200% 100%;
    animation: shimmer 2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%, 100% { background-position: 200% 0; }
    50% { background-position: 0% 0; }
  }
`;

const ProgressTitle = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: ${props => props.theme.mode === 'dark'
    ? props.theme.colors.gray[100]
    : props.theme.colors.gray[800]};
  margin: 0 0 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  letter-spacing: -0.02em;

  svg {
    color: #C94416;
  }
`;

const ProgressList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const ProgressItem = styled(motion.li)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.2rem;
  border-radius: 10px;
  background: ${props => {
    if (props.$status === 'success') return props.theme.mode === 'dark'
      ? 'rgba(34, 197, 94, 0.12)'
      : 'rgba(34, 197, 94, 0.06)';
    if (props.$status === 'error') return props.theme.mode === 'dark'
      ? 'rgba(239, 68, 68, 0.12)'
      : 'rgba(239, 68, 68, 0.06)';
    if (props.$status === 'loading') return props.theme.mode === 'dark'
      ? 'rgba(59, 130, 246, 0.12)'
      : 'rgba(59, 130, 246, 0.06)';
    return props.theme.mode === 'dark'
      ? 'rgba(148, 163, 184, 0.08)'
      : 'rgba(148, 163, 184, 0.04)';
  }};
  border: 1px solid ${props => {
    if (props.$status === 'success') return 'rgba(34, 197, 94, 0.25)';
    if (props.$status === 'error') return 'rgba(239, 68, 68, 0.25)';
    if (props.$status === 'loading') return 'rgba(59, 130, 246, 0.25)';
    return 'rgba(148, 163, 184, 0.15)';
  }};
  transition: all 0.2s ease;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 10px 0 0 10px;
    background: ${props => {
      if (props.$status === 'success') return 'linear-gradient(180deg, #10b981 0%, #059669 100%)';
      if (props.$status === 'error') return 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)';
      if (props.$status === 'loading') return 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)';
      return 'linear-gradient(180deg, #94a3b8 0%, #64748b 100%)';
    }};
  }

  .icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${props => {
      if (props.$status === 'success') return '#10b981';
      if (props.$status === 'error') return '#ef4444';
      if (props.$status === 'loading') return '#3b82f6';
      return '#94a3b8';
    }};
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .text {
    flex: 1;
    font-size: 0.9rem;
    color: ${props => props.theme.mode === 'dark'
      ? props.theme.colors.gray[200]
      : props.theme.colors.gray[700]};
    font-weight: 500;
    letter-spacing: -0.01em;
  }

  .duration {
    font-size: 0.8rem;
    color: ${props => props.theme.mode === 'dark'
      ? props.theme.colors.gray[400]
      : props.theme.colors.gray[500]};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: ${props => props.theme.mode === 'dark'
      ? 'rgba(148, 163, 184, 0.1)'
      : 'rgba(148, 163, 184, 0.08)'};
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
  }
`;

const QuickCheckPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [progressSteps, setProgressSteps] = useState([]);
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [phaseResults, setPhaseResults] = useState({
    phase1: null,
    phase2: null,
    phase3: null
  });
  const [currentPhase, setCurrentPhase] = useState(0);

  const { register, handleSubmit, control, formState: { errors } } = useForm();

  // Timer effect
  React.useEffect(() => {
    let interval;
    if (isLoading && startTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else if (!isLoading) {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isLoading, startTime]);

  const aiTypes = [
    { value: 'generative_ai', label: 'Generativ AI' },
    { value: 'predictive_ai', label: 'Prædiktiv AI' },
    { value: 'classification', label: 'Klassifikation' },
    { value: 'recommendation', label: 'Anbefalingssystem' },
    { value: 'computer_vision', label: 'Computer Vision' },
    { value: 'nlp', label: 'Naturlig Sprogbehandling' },
    { value: 'robotics', label: 'Robotik' },
    { value: 'other', label: 'Andet' }
  ];

  const classificationLabels = {
    forbudt: 'Forbudt praksis',
    høj_risiko: 'Højrisikosystem',
    begrænset_risiko: 'Begrænset risiko',
    minimal: 'Minimal risiko',
    uden_for_scope: 'Uden for AI-forordningens anvendelsesområde'
  };

  const classificationDescriptions = {
    forbudt: 'Systemet falder under artikel 5 og må ikke idriftsættes i sin nuværende form.',
    høj_risiko: 'Systemet er omfattet af kapitel III/IV-krav og kræver omfattende dokumentation og konformitetsvurdering.',
    begrænset_risiko: 'Systemet er omfattet af gennemsigtighedsforpligtelser i artikel 52.',
    minimal: 'Systemet er omfattet af frivillig god praksis, men bør stadig følges op af governance og monitorering.',
    uden_for_scope: 'Systemet er ikke omfattet, men andre reguleringer kan stadig være relevante.'
  };

  const classificationTone = {
    forbudt: { background: 'rgba(220, 38, 38, 0.12)', text: '#991b1b', border: 'rgba(220, 38, 38, 0.4)' },
    høj_risiko: { background: 'rgba(201, 68, 22, 0.15)', text: '#7f1d1d', border: 'rgba(201, 68, 22, 0.4)' },
    begrænset_risiko: { background: 'rgba(232, 90, 40, 0.12)', text: '#92400e', border: 'rgba(232, 90, 40, 0.35)' },
    minimal: { background: 'rgba(34, 197, 94, 0.12)', text: '#166534', border: 'rgba(34, 197, 94, 0.35)' },
    uden_for_scope: { background: 'rgba(148, 163, 184, 0.2)', text: '#475569', border: 'rgba(148, 163, 184, 0.4)' }
  };

  const decisionLabels = {
    go: 'Godkendt',
    'betinget-go': 'Betinget godkendelse',
    'no-go': 'Afvist'
  };


  const updateProgress = (stepId, status, label) => {
    setProgressSteps(prev => {
      const existing = prev.find(s => s.id === stepId);
      if (existing) {
        return prev.map(s => s.id === stepId ? { ...s, status, endTime: Date.now() } : s);
      }
      return [...prev, { id: stepId, label, status, startTime: Date.now() }];
    });
  };

  const onSubmit = async (data) => {
    setIsLoading(true);
    setProgressSteps([]);
    setResults(null);
    setStartTime(Date.now());
    setElapsedTime(0);
    setPhaseResults({ phase1: null, phase2: null, phase3: null });
    setCurrentPhase(0);

    // Generate client-side session ID
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let pollInterval = null;
    let intermediatePollInterval = null;
    let pollCount = 0;
    const maxPolls = 200; // Max 100 seconds (200 * 500ms)

    try {
      // Konverter array af fagområder til string format
      const sektorString = data.sektorer && data.sektorer.length > 0
        ? data.sektorer.map(s => s.value).join(', ')
        : '';

      // Start initial progress
      updateProgress('init', 'loading', 'Starter compliance analyse...');

      // Start API request (will take 30-60 seconds)
      const responsePromise = axios.post('/api/compliance/hurtig-tjek', {
        beskrivelse: data.beskrivelse,
        ai_type: data.ai_type,
        sektor: sektorString,
        behandler_persondata: data.behandler_persondata || false,
        automatiserede_beslutninger: data.automatiserede_beslutninger || false,
        session_id: sessionId,
        enable_web_search: enableWebSearch
      });

      // Poll for intermediate results every 500ms
      intermediatePollInterval = setInterval(async () => {
        try {
          const intermediateResponse = await axios.get(`/api/compliance/intermediate/${sessionId}`);
          const intermediateData = intermediateResponse.data;

          // Update phase results when they become available
          if (intermediateData.phase_1 && !phaseResults.phase1) {
            setPhaseResults(prev => ({ ...prev, phase1: intermediateData.phase_1 }));
            setCurrentPhase(1);
          }
          if (intermediateData.phase_2 && !phaseResults.phase2) {
            setPhaseResults(prev => ({ ...prev, phase2: intermediateData.phase_2 }));
            setCurrentPhase(2);
          }
          if (intermediateData.phase_3 && !phaseResults.phase3) {
            setPhaseResults(prev => ({ ...prev, phase3: intermediateData.phase_3 }));
            setCurrentPhase(3);
          }
        } catch (err) {
          // Ignore polling errors
        }
      }, 500);

      // Poll for progress updates every 500ms
      pollInterval = setInterval(async () => {
        pollCount++;

        if (pollCount > maxPolls) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const progressResponse = await axios.get(`/api/compliance/progress/${sessionId}`);
          const progressData = progressResponse.data.progress || [];

          // Update progress steps with backend data
          progressData.forEach((update, index) => {
            updateProgress(`step-${index}`, update.status, update.message);
          });
        } catch (err) {
          // Ignore polling errors (endpoint might not have data yet)
        }
      }, 500);

      // Wait for main response
      const response = await responsePromise;

      // Stop polling
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (intermediatePollInterval) {
        clearInterval(intermediatePollInterval);
        intermediatePollInterval = null;
      }

      // Final progress check
      try {
        const finalProgress = await axios.get(`/api/compliance/progress/${sessionId}`);
        const progressData = finalProgress.data.progress || [];

        progressData.forEach((update, index) => {
          updateProgress(`step-${index}`, update.status, update.message);
        });
      } catch (err) {
        console.warn('Final progress fetch error:', err);
      }

      // Mark as complete
      updateProgress('complete', 'success', 'Analyse fuldført ✓');

      setResults(response.data);
      toast.success('Hurtig tjek gennemført!');
    } catch (error) {
      // Stop polling on error
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (intermediatePollInterval) {
        clearInterval(intermediatePollInterval);
      }
      console.error('Hurtig tjek fejl:', error);
      const message = error?.response?.data?.detail || 'Der opstod en fejl. Prøv igen.';
      toast.error(message);

      // Mark current steps as error
      setProgressSteps(prev => prev.map(s =>
        s.status === 'loading' ? { ...s, status: 'error', endTime: Date.now() } : s
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskIcon = (riskLevel) => {
    switch (riskLevel) {
      case 'unacceptable':
      case 'high':
        return FaTimesCircle;
      case 'limited':
        return FaExclamationTriangle;
      case 'minimal':
        return FaCheckCircle;
      default:
        return FaCheckCircle;
    }
  };

  const getRiskClass = (riskLevel) => {
    switch (riskLevel) {
      case 'unacceptable':
      case 'high':
        return 'high-risk';
      case 'limited':
        return 'medium-risk';
      case 'minimal':
        return 'low-risk';
      default:
        return 'low-risk';
    }
  };

  const getRiskText = (riskLevel) => {
    switch (riskLevel) {
      case 'unacceptable':
        return 'Uacceptabel';
      case 'high':
        return 'Høj';
      case 'limited':
        return 'Begrænset';
      case 'minimal':
        return 'Minimal';
      default:
        return 'Ukendt';
    }
  };

  const getRiskScoreColor = (score) => {
    if (score >= 75) return '#dc2626'; // Red for high risk
    if (score >= 50) return '#f59e0b'; // Orange for medium risk
    if (score >= 25) return '#fbbf24'; // Yellow for moderate risk
    return '#10b981'; // Green for low risk
  };

  return (
    <QuickCheckContainer>
      <PageHeader>
        <h1>Hurtig tjek</h1>
        <p>Få øjeblikkelig feedback på dit AI-systems compliance status</p>
      </PageHeader>

      <CheckForm onSubmit={handleSubmit(onSubmit)}>
        <FormRow>
          <FormGroup>
            <LabelWithTooltip>
              Beskriv dit AI-system *
              <Tooltip>
                Giv en kort beskrivelse af hvad dit AI-system gør, hvilken funktionalitet det har,
                og hvordan det bruges. F.eks.: type af algoritme, primære opgaver, og målgruppe.
              </Tooltip>
            </LabelWithTooltip>
            <TextArea
              {...register('beskrivelse', { required: 'Beskrivelse er påkrævet' })}
              placeholder="F.eks. AI-drevet rekrutteringsværktøj der screener CV'er og rangerer kandidater"
            />
            {errors.beskrivelse && (
              <span style={{ color: 'red', fontSize: '0.875rem' }}>
                {errors.beskrivelse.message}
              </span>
            )}
          </FormGroup>
        </FormRow>

        <FormRow columns="1fr 1fr">
          <FormGroup>
            <LabelWithTooltip>
              AI System Type *
              <Tooltip>
                Vælg den kategori der bedst beskriver dit AI-system. Generativ AI skaber nyt indhold,
                Prædiktiv AI forudsiger outcomes, Klassifikation kategoriserer data, etc.
              </Tooltip>
            </LabelWithTooltip>
            <Select {...register('ai_type', { required: 'AI type er påkrævet' })}>
              <option value="">Vælg type...</option>
              {aiTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
            {errors.ai_type && (
              <span style={{ color: 'red', fontSize: '0.875rem' }}>
                {errors.ai_type.message}
              </span>
            )}
          </FormGroup>

          <FormGroup>
            <LabelWithTooltip>
              Fagområder * (vælg flere hvis relevant)
              <Tooltip>
                Vælg det eller de fagområder hvor dit AI-system anvendes. Dette hjælper med at identificere
                relevante compliance krav og branche-specifikke reguleringer.
              </Tooltip>
            </LabelWithTooltip>
            <Controller
              name="sektorer"
              control={control}
              rules={{ required: 'Mindst ét fagområde er påkrævet' }}
              render={({ field }) => (
                <ReactSelect
                  {...field}
                  isMulti
                  options={FAGOMRAADE_OPTIONS.map(opt => ({ value: opt, label: opt }))}
                  placeholder="Vælg fagområder..."
                  styles={{
                    control: (base) => ({
                      ...base,
                      padding: '0.25rem',
                      borderColor: errors.sektorer ? 'red' : '#d1d5db',
                      borderWidth: '2px',
                      borderRadius: '0.375rem'
                    })
                  }}
                />
              )}
            />
            {errors.sektorer && (
              <span style={{ color: 'red', fontSize: '0.875rem' }}>
                {errors.sektorer.message}
              </span>
            )}
          </FormGroup>
        </FormRow>

        <FormRow>
          <FormGroup>
            <LabelWithTooltip>
              Databehandling
              <Tooltip>
                Angiv om dit AI-system behandler personoplysninger eller træffer automatiserede beslutninger.
                Dette påvirker GDPR-vurderingen og hjælper med at identificere om en DPIA er påkrævet.
              </Tooltip>
            </LabelWithTooltip>
            <CheckboxGroup>
              <CheckboxItem>
                <input
                  type="checkbox"
                  {...register('behandler_persondata')}
                />
                <span>Behandler personoplysninger</span>
                <Tooltip icon="question">
                  Markér hvis systemet behandler data der direkte eller indirekte kan identificere personer
                  (navn, CPR-nr, e-mail, IP-adresse, etc.). Dette udløser GDPR-krav og kræver særlig opmærksomhed.
                </Tooltip>
              </CheckboxItem>
              <CheckboxItem>
                <input
                  type="checkbox"
                  {...register('automatiserede_beslutninger')}
                />
                <span>Træffer automatiserede beslutninger med juridiske eller betydelige konsekvenser</span>
                <Tooltip icon="question">
                  Markér hvis systemet træffer beslutninger uden menneskelig involvering, der har juridiske eller
                  væsentlige konsekvenser (f.eks. afslag på lån, jobansøgning, forsikring). Dette er højrisiko under
                  både GDPR og AI Act.
                </Tooltip>
              </CheckboxItem>
              <CheckboxItem>
                <input
                  type="checkbox"
                  checked={enableWebSearch}
                  onChange={(e) => setEnableWebSearch(e.target.checked)}
                />
                <span>Inkluder web søgning efter relevante afgørelser og præcedens (anbefalet, men tager længere tid)</span>
                <Tooltip icon="question">
                  Aktivér for at søge i juridiske databaser (EUR-Lex, Datatilsynet, EDPB) efter relevante afgørelser
                  og præcedens. Dette giver mere dybdegående analyse, men øger behandlingstiden med 20-30 sekunder.
                </Tooltip>
              </CheckboxItem>
            </CheckboxGroup>
          </FormGroup>
        </FormRow>

        <SubmitButton type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <FaSpinner className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
              Analyserer...
            </>
          ) : (
            <>
              <FaRocket />
              Kør Hurtig Tjek
            </>
          )}
        </SubmitButton>
      </CheckForm>

      {progressSteps.length > 0 && (
        <ProgressTracker
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ProgressTitle>
            {results ? <FaCheckCircle style={{ color: '#059669' }} /> : <FaSpinner style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />}
            {results ? 'Analyse gennemført' : 'Analyse forløb'}
            {elapsedTime > 0 && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '0.9rem',
                fontWeight: '600',
                color: results ? '#059669' : '#C94416',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
              </span>
            )}
          </ProgressTitle>
          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e2e8f0',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '1rem'
          }}>
            <div style={{
              width: results ? '100%' : `${(progressSteps.filter(s => s.status === 'success').length / Math.max(progressSteps.length, 1)) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #C94416 0%, #059669 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>

          {/* Compact summary */}
          <div style={{
            textAlign: 'center',
            fontSize: '0.875rem',
            color: results ? '#059669' : '#64748b',
            fontWeight: results ? '600' : '400',
            marginBottom: '1rem'
          }}>
            {results
              ? '✓ Alle trin gennemført'
              : `${progressSteps.filter(s => s.status === 'success').length} af ${progressSteps.length} trin gennemført`
            }
          </div>

          {/* Show only last 3 steps */}
          <ProgressList>
            {progressSteps.slice(-3).map((step, index) => {
              const duration = step.endTime && step.startTime
                ? `${((step.endTime - step.startTime) / 1000).toFixed(1)}s`
                : null;

              return (
                <ProgressItem
                  key={step.id}
                  $status={step.status}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="icon">
                    {step.status === 'loading' && <FaSpinner style={{ animation: 'spin 1s linear infinite' }} />}
                    {step.status === 'success' && <FaCheckCircle />}
                    {step.status === 'error' && <FaTimesCircle />}
                  </div>
                  <span className="text">{step.label}</span>
                  {duration && <span className="duration">{duration}</span>}
                </ProgressItem>
              );
            })}
          </ProgressList>
        </ProgressTracker>
      )}

      {/* Phase 1: Compliance Analyse */}
      {phaseResults.phase1 && (
        <PhaseContainer
          $phaseColor="#059669"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <PhaseHeader $phaseColor="#059669">
            <h3>
              <FaCheckCircle />
              Fase 1: Compliance Analyse Færdig
            </h3>
            <p>AI Act og GDPR vurdering gennemført</p>
          </PhaseHeader>
          <PhaseBody>
            <ResultsGrid>
              <ResultCard>
                <div className={getRiskClass(phaseResults.phase1.ai_act?.risk_level)}>
                  <div className="icon">
                    {React.createElement(getRiskIcon(phaseResults.phase1.ai_act?.risk_level))}
                  </div>
                </div>
                <h3>AI Act Risikoniveau</h3>
                <div className="value">
                  {getRiskText(phaseResults.phase1.ai_act?.risk_level)}
                </div>
                <div className="description">
                  Klassifikation jf. EU AI Act
                </div>
              </ResultCard>

              <ResultCard>
                <div className={phaseResults.phase1.gdpr?.relevant ? 'high-risk' : 'low-risk'}>
                  <div className="icon">
                    {phaseResults.phase1.gdpr?.relevant ? <FaExclamationTriangle /> : <FaCheckCircle />}
                  </div>
                </div>
                <h3>GDPR Anvendelig</h3>
                <div className="value">
                  {phaseResults.phase1.gdpr?.relevant ? 'Ja' : 'Nej'}
                </div>
                <div className="description">
                  {phaseResults.phase1.gdpr?.requires_dpia ? 'DPIA påkrævet' : 'Behandling af personoplysninger'}
                </div>
              </ResultCard>

              <ResultCard>
                <div className={phaseResults.phase1.needs_full_assessment ? 'medium-risk' : 'low-risk'}>
                  <div className="icon">
                    {phaseResults.phase1.needs_full_assessment ? <FaExclamationTriangle /> : <FaCheckCircle />}
                  </div>
                </div>
                <h3>Fuld Analyse Nødvendig</h3>
                <div className="value">
                  {phaseResults.phase1.needs_full_assessment ? 'Ja' : 'Nej'}
                </div>
                <div className="description">
                  Omfattende analyse anbefalet
                </div>
              </ResultCard>
            </ResultsGrid>

            {phaseResults.phase1.ai_act?.reasons && phaseResults.phase1.ai_act.reasons.length > 0 && (
              <DetailsSection>
                <h3>AI Act Analyse</h3>
                <ul>
                  {phaseResults.phase1.ai_act.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </DetailsSection>
            )}

            {phaseResults.phase1.recommendations && phaseResults.phase1.recommendations.length > 0 && (
              <DetailsSection>
                <h3>Hurtige Anbefalinger</h3>
                <ul>
                  {phaseResults.phase1.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </DetailsSection>
            )}
          </PhaseBody>
        </PhaseContainer>
      )}

      {/* Phase 2: Web Research */}
      {currentPhase >= 2 && !phaseResults.phase2 && enableWebSearch && (
        <PhaseBanner>
          <div className="icon">
            <FaSpinner style={{ animation: 'spin 1s linear infinite' }} />
          </div>
          <div className="content">
            <h4>🌐 Søger efter præcedens og relevante afgørelser...</h4>
            <p>Scanner juridiske databaser: EUR-Lex, Datatilsynet, EDPB, DuckDuckGo</p>
          </div>
        </PhaseBanner>
      )}

      {phaseResults.phase2 && phaseResults.phase2.precedents && phaseResults.phase2.precedents.length > 0 && (
        <PhaseContainer
          $phaseColor="#0284c7"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <PhaseHeader $phaseColor="#0284c7">
            <h3>
              <FaBalanceScale />
              Fase 2: Web Research Færdig
            </h3>
            <p>Fundet {phaseResults.phase2.precedents.length} relevante kilder</p>
          </PhaseHeader>
          <PhaseBody>
            {phaseResults.phase2.precedents_summary && (
              <p style={{ marginBottom: '1rem', color: '#475569', lineHeight: 1.5 }}>
                {phaseResults.phase2.precedents_summary}
              </p>
            )}
            <PrecedentsList>
              {phaseResults.phase2.precedents.map((precedent, index) => (
                <PrecedentItem
                  key={index}
                  href={precedent.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="icon">
                    <FaBalanceScale />
                  </div>
                  <div className="content">
                    <div className="title">
                      {precedent.title}
                      <FaExternalLinkAlt size={12} />
                    </div>
                    {precedent.authority && (
                      <div className="authority">{precedent.authority}</div>
                    )}
                  </div>
                </PrecedentItem>
              ))}
            </PrecedentsList>
          </PhaseBody>
        </PhaseContainer>
      )}

      {/* Phase 3: AI Summary */}
      {currentPhase >= 3 && !phaseResults.phase3 && (
        <PhaseBanner>
          <div className="icon">
            <FaSpinner style={{ animation: 'spin 1s linear infinite' }} />
          </div>
          <div className="content">
            <h4>🤖 Genererer AI-drevet sammenfatning...</h4>
            <p>Analyserer fund og compliance data med avanceret LLM</p>
          </div>
        </PhaseBanner>
      )}

      {phaseResults.phase3 && phaseResults.phase3.short_summary && (
        <PhaseContainer
          $phaseColor="#7c3aed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <PhaseHeader $phaseColor="#7c3aed">
            <h3>
              <FaBalanceScale />
              Fase 3: AI Sammenfatning
            </h3>
            <p>Baseret på compliance analyse og web research</p>
          </PhaseHeader>
          <PhaseBody>
            <ShortSummaryBox>
              <h3>
                <FaBalanceScale />
                AI Compliance Vurdering
              </h3>
              <p>{phaseResults.phase3.short_summary}</p>
            </ShortSummaryBox>
          </PhaseBody>
        </PhaseContainer>
      )}

      {results && (
        <ResultsContainer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <ResultsHeader>
            <h2>
              <FaCheckCircle />
              Hurtig tjek gennemført!
            </h2>
            <p>Her er en øjeblikkelig analyse af dit AI-system</p>
          </ResultsHeader>

          {results.rule_engine && (
            <SummaryBanner>
              <SummaryBadge $tone={classificationTone[results.rule_engine.classification] || classificationTone.minimal}>
                {classificationLabels[results.rule_engine.classification] || 'Foreløbig vurdering'}
              </SummaryBadge>
              <SummaryText>
                {classificationDescriptions[results.rule_engine.classification] || 'Den hurtige screening placerede systemet i den laveste risikokategori. Brug resultatet som udgangspunkt for videre arbejde.'}
              </SummaryText>
              <SummaryMeta>
                <SummaryMetaItem>
                  <span>Beslutning</span>
                  <strong>{decisionLabels[results.rule_engine.decision] || 'Ikke vurderet'}</strong>
                </SummaryMetaItem>
                <SummaryMetaItem>
                  <span>AI Act risikoniveau</span>
                  <strong>{getRiskText(results.ai_act?.risk_level)}</strong>
                </SummaryMetaItem>
                <RiskScoreDisplay>
                  <span style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>
                    Risikoscore
                  </span>
                  <RiskScoreValue $scoreColor={getRiskScoreColor(results.rule_engine.risk_score ?? 0)}>
                    <span className="score">{results.rule_engine.risk_score ?? 0}</span>
                    <span className="max">ud af 100</span>
                  </RiskScoreValue>
                  <RiskScoreBar
                    $percentage={results.rule_engine.risk_score ?? 0}
                    $barColor={getRiskScoreColor(results.rule_engine.risk_score ?? 0)}
                  />
                </RiskScoreDisplay>
                <SummaryMetaItem>
                  <span>GDPR relevant</span>
                  <strong>{results.gdpr?.relevant ? 'Ja' : 'Nej'}</strong>
                </SummaryMetaItem>
              </SummaryMeta>
            </SummaryBanner>
          )}

          {results.short_summary && (
            <ShortSummaryBox>
              <h3>
                <FaBalanceScale />
                AI Compliance Vurdering
              </h3>
              <p>{results.short_summary}</p>
            </ShortSummaryBox>
          )}

          <ResultsGrid>
            <ResultCard>
              <div className={getRiskClass(results.ai_act?.risk_level)}>
                <div className="icon">
                  {React.createElement(getRiskIcon(results.ai_act?.risk_level))}
                </div>
              </div>
              <h3>AI Act Risikoniveau</h3>
              <div className="value">
                {getRiskText(results.ai_act?.risk_level)}
              </div>
              <div className="description">
                Klassifikation jf. EU AI Act
              </div>
            </ResultCard>

            <ResultCard>
              <div className={results.gdpr?.relevant ? 'high-risk' : 'low-risk'}>
                <div className="icon">
                  {results.gdpr?.relevant ? <FaExclamationTriangle /> : <FaCheckCircle />}
                </div>
              </div>
              <h3>GDPR Anvendelig</h3>
              <div className="value">
                {results.gdpr?.relevant ? 'Ja' : 'Nej'}
              </div>
              <div className="description">
                Behandling af personoplysninger
              </div>
            </ResultCard>

            <ResultCard>
              <div className={results.needs_full_assessment ? 'medium-risk' : 'low-risk'}>
                <div className="icon">
                  {results.needs_full_assessment ? <FaExclamationTriangle /> : <FaCheckCircle />}
                </div>
              </div>
              <h3>Fuld Analyse Nødvendig</h3>
              <div className="value">
                {results.needs_full_assessment ? 'Ja' : 'Nej'}
              </div>
              <div className="description">
                Omfattende analyse anbefalet
              </div>
            </ResultCard>
          </ResultsGrid>

          {results.precedents && results.precedents.length > 0 && (
            <DetailsSection>
              <h3>Relevante Præcedens & Afgørelser</h3>
              {results.precedents_summary && (
                <p style={{ marginBottom: '1rem', color: '#475569', lineHeight: 1.5 }}>
                  {results.precedents_summary}
                </p>
              )}
              <PrecedentsList>
                {results.precedents.map((precedent, index) => (
                  <PrecedentItem
                    key={index}
                    href={precedent.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="icon">
                      <FaBalanceScale />
                    </div>
                    <div className="content">
                      <div className="title">
                        {precedent.title}
                        <FaExternalLinkAlt size={12} />
                      </div>
                      {precedent.authority && (
                        <div className="authority">{precedent.authority}</div>
                      )}
                    </div>
                  </PrecedentItem>
                ))}
              </PrecedentsList>
            </DetailsSection>
          )}

          {results.ai_act?.reasons && results.ai_act.reasons.length > 0 && (
            <DetailsSection>
              <h3>AI Act Analyse</h3>
              <ul>
                {results.ai_act.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </DetailsSection>
          )}

          {results.quick_recommendations && results.quick_recommendations.length > 0 && (
            <DetailsSection>
              <h3>Hurtige Anbefalinger</h3>
              <ul>
                {results.quick_recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </DetailsSection>
          )}

          {results.rule_engine?.obligations && results.rule_engine.obligations.length > 0 && (
            <DetailsSection>
              <h3>Obligatoriske skridt (AI Act)</h3>
              <ObligationList>
                {results.rule_engine.obligations.map((item, index) => (
                  <li key={`obligation-${index}`}>{item}</li>
                ))}
              </ObligationList>
            </DetailsSection>
          )}

          {results.rule_engine?.flow && results.rule_engine.flow.length > 0 && (
            <DetailsSection>
              <h3>Beslutningsflow</h3>
              <FlowList>
                {results.rule_engine.flow.map((step, index) => (
                  <FlowItem key={`flow-${index}`}>
                    <strong>{index + 1}. {step.trin}</strong>
                    <span>{step.resultat} – {step.forklaring}</span>
                  </FlowItem>
                ))}
              </FlowList>
            </DetailsSection>
          )}

          {results.rule_engine?.summary && (
            <DetailsSection>
              <h3>Regelmotorens vurdering</h3>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                {results.rule_engine.summary}
              </p>
            </DetailsSection>
          )}

          {results.rule_engine?.findings && results.rule_engine.findings.length > 0 && (
            <DetailsSection>
              <h3>Udløste krav</h3>
              <FindingsList>
                {results.rule_engine.findings.map((finding, index) => (
                  <FindingItem key={`${finding.regel_id}-${index}`}>
                    <SeverityBadge severity={finding.alvorlighed}>
                      {finding.alvorlighed === 'hard_stop' ? 'Kritisk krav' : 'Betinget krav'}
                    </SeverityBadge>
                    <strong>{finding.regel_id} · {String(finding.kategori || '').toUpperCase()}</strong>
                    <span>{finding.anbefaling || finding.beskrivelse}</span>
                  </FindingItem>
                ))}
              </FindingsList>
            </DetailsSection>
          )}

          {results.prompt_full_assessment && (
            <CTASection>
              <div>
                <h3>Tag næste skridt med en fuld compliance control</h3>
                <p>
                  Den hurtige screening viser forhold der bør undersøges nærmere. Fortsæt til den fulde
                  compliance control for at få en dybdegående 7-punkts vurdering og konkrete handlingsplaner.
                </p>
              </div>
              <CTAButton to="/fuld-vurdering">Start fuld compliance control</CTAButton>
            </CTASection>
          )}
        </ResultsContainer>
      )}
    </QuickCheckContainer>
  );
};

export default QuickCheckPage;
