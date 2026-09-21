import { sourceLabel } from '../components/assessment/EvidenceNavigator';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Link, useSearchParams } from 'react-router-dom';
import BRAND from '../config/brand';
import AssessmentSummary, { AssessmentRecommendations } from '../components/assessment/AssessmentSummary';
import StructuredReportText from '../components/assessment/StructuredReportText';
import ReadableAssessment from '../components/assessment/ReadableAssessment';
import { modelLabel, modelNotes } from '../utils/modelPresentation';
import RiskAssessmentPanel from '../components/assessment/RiskAssessmentPanel';
import ReportEditor from '../components/assessment/ReportEditor';
import ChoiceWithOtherField from '../components/ChoiceWithOtherField';
import DepartmentField from '../components/DepartmentField';
import FieldHelp from '../components/FieldHelp';
import { PROCESSING_VERSION_OPTIONS } from '../features/dpia/planningFields';
import { useAuth } from '../contexts/AuthContext';
import {
  CONTROL_OPTIONS,
  DATA_CATEGORY_OPTIONS,
  DATA_SUBJECT_OPTIONS,
  DRAFT_STORAGE_KEY,
  INITIAL_ASSESSMENT,
  OPTION_LABELS,
  RIGHTS_PROCEDURE_OPTIONS,
  loadDraft,
  requiresOfficialLegalSource,
  toAssessmentRequest,
  validateAssessment,
  validateStep,
} from '../features/dpia/assessmentModel';

const STEPS = [
  ['Ramme og formål', 'Hvad løsningen gør, og hvem der er ansvarlig'],
  ['Personoplysninger', 'Registrerede, datatyper og behandlingens omfang'],
  ['Teknologi og overførsler', 'Leverandør, hosting, AI og automatisering'],
  ['Styring og kontrol', 'Hjemmel, sletning og eksisterende sikkerhed'],
];
// Allow the server's maximum one-hour batch run plus one minute for its response.
const AI_GENERATION_TIMEOUT_MS = 61 * 60 * 1000;

const Page = styled.div`
  max-width: ${p => p.$reading ? '1080px' : '1320px'};
  margin: 0 auto;
  padding: clamp(42px, 6vw, 78px) 20px 110px;
  color: ${p => p.theme.colors.text};

  @media (max-width: 600px) { padding: 34px 14px 76px; }
`;

const Hero = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 350px);
  gap: clamp(32px, 6vw, 90px);
  align-items: end;
  padding: 0 0 clamp(36px, 5vw, 58px);
  margin-bottom: 0;
  border-bottom: 1px solid ${p => p.theme.colors.border};

  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;

const Eyebrow = styled.div`
  margin-bottom: 10px;
  color: ${p => p.theme.colors.primary};
  font: 680 0.68rem/1.2 ${p => p.theme.fonts.mono};
  letter-spacing: 0.13em;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0 0 12px;
  max-width: min(100%, 860px);
  font-size: clamp(3rem, 6vw, 4.5rem);
  font-weight: 580;
  line-height: 1.01;
  letter-spacing: -0.055em;
  overflow-wrap: break-word;

  &:focus { outline: none; }

  @media (max-width: 600px) {
    font-size: clamp(2.1rem, 9vw, 2.6rem);
    letter-spacing: -0.045em;
  }
`;

const Lead = styled.p`
  max-width: 780px;
  margin: 0;
  color: ${p => p.theme.colors.textMuted};
  font-size: 1.05rem;
  line-height: 1.7;
`;

const SafetyNote = styled.div`
  max-width: 350px;
  padding: 20px 22px;
  border-left: 4px solid ${p => p.theme.colors.primary};
  background: ${p => p.theme.colors.primarySoft};
  color: ${p => p.theme.colors.text};
  font-size: 0.84rem;
  line-height: 1.6;
`;

const Workspace = styled.section`
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  overflow: hidden;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};

  @media (max-width: 880px) { display: block; }
`;

const StepNav = styled.ol`
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;
  border-right: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceAlt};

  @media (max-width: 880px) {
    display: grid;
    grid-template-columns: repeat(4, minmax(145px, 1fr));
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid ${p => p.theme.colors.border};
  }
`;

const StepItem = styled.li`
  min-width: 0;
  min-height: 118px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  border-left: 4px solid ${p => p.$active ? p.theme.colors.primary : 'transparent'};
  background: ${p => p.$active ? p.theme.colors.surface : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};

  &:last-child { border-bottom: 0; }
  button { display: block; width: 100%; min-height: inherit; padding: 26px 24px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  button:hover { background: ${p => p.theme.colors.primarySoft}; }
  button:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: -4px; }
  strong { display: block; margin-top: 12px; font-size: 0.9rem; line-height: 1.35; }
  span { display: block; color: ${p => p.$active ? p.theme.colors.primary : p.theme.colors.textFaded}; font: 600 0.65rem ${p => p.theme.fonts.mono}; }

  @media (max-width: 880px) {
    min-height: 98px;
    button { padding: 18px; }
    border-left: 0;
    border-right: 1px solid ${p => p.theme.colors.border};
    border-bottom: 4px solid ${p => p.$active ? p.theme.colors.primary : 'transparent'};
  }
`;

const FormBody = styled.div`
  min-width: 0;
  padding: clamp(34px, 5vw, 66px);
`;

const SectionHead = styled.div`
  max-width: 820px;
  margin-bottom: 42px;
  h2 { margin: 0 0 9px; font-size: clamp(1.85rem, 3vw, 2.5rem); font-weight: 590; letter-spacing: -0.04em; }
  p { margin: 0; color: ${p => p.theme.colors.textMuted}; font-size: 0.96rem; line-height: 1.6; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px 24px;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;

const Full = styled.div`grid-column: 1 / -1; min-width: 0;`;

const Field = styled.div`
  min-width: 0;
  label, legend {
    display: block;
    margin-bottom: 9px;
    color: ${p => p.theme.colors.text};
    font-size: 0.84rem;
    font-weight: 640;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  small { display: block; margin-top: 8px; color: ${p => p.theme.colors.textMuted}; font-size: 0.76rem; line-height: 1.5; }
`;
const FieldLabel = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 9px;
  min-width: 0;
  > label, > span { margin: 0; min-width: 0; font-size: 0.84rem; font-weight: 640; line-height: 1.5; }
`;

const Input = styled.input`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 48px;
  padding: 12px 14px;
  border-radius: 0;
  border-color: ${p => p.$invalid ? p.theme.colors.danger : p.theme.colors.border};
`;

const Textarea = styled.textarea`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 148px;
  resize: vertical;
  padding: 12px 14px;
  border-radius: 0;
  border-color: ${p => p.$invalid ? p.theme.colors.danger : p.theme.colors.border};
`;

const Select = styled.select`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 48px;
  padding: 12px 14px;
  border-radius: 0;
  border-color: ${p => p.$invalid ? p.theme.colors.danger : p.theme.colors.border};
`;

const ErrorText = styled.div`
  margin-top: 6px;
  color: ${p => p.theme.colors.danger};
  font-size: 0.78rem;
  font-weight: 600;
`;

const CheckGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

const VerificationList = styled.div`
  display: grid;
  gap: 10px;
`;

const VerificationCard = styled.div`
  padding: 12px;
  border: 1px solid ${p => p.$verified ? p.theme.colors.success : p.theme.colors.border};
  border-radius: 0;
  background: ${p => p.$verified ? p.theme.colors.successSoft : p.theme.colors.surface};

  > label {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin: 0;
    cursor: pointer;
  }
  input { margin-top: 4px; accent-color: ${p => p.theme.colors.success}; }
  textarea { margin-top: 10px; min-height: 82px; }
`;

const CheckLabel = styled.label`
  display: flex !important;
  gap: 10px;
  align-items: flex-start;
  min-height: 46px;
  min-width: 0;
  margin: 0 !important;
  padding: 10px 12px;
  border: 1px solid ${p => p.$checked ? p.theme.colors.primary : p.theme.colors.border};
  border-radius: 0;
  background: ${p => p.$checked ? p.theme.colors.primaryBg : p.theme.colors.surface};
  font-weight: 500 !important;
  cursor: pointer;
  input { flex: 0 0 16px; width: 16px; height: 16px; margin: 3px 0 0; accent-color: ${p => p.theme.colors.primary}; }
  span { min-width: 0; line-height: 1.5; overflow-wrap: anywhere; }
`;

const Question = styled.fieldset`
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 15px;
  border: 1px solid ${p => p.$invalid ? p.theme.colors.danger : p.theme.colors.border};
  border-radius: 0;
  legend { float: left; width: 100%; max-width: 100%; padding: 0; margin: 0 0 14px; font-size: 0.87rem; font-weight: 650; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; }
`;

const Radios = styled.div`
  clear: both;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  min-width: 0;
  label {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    min-height: 44px;
    margin: 0;
    padding: 8px 12px;
    border: 1px solid ${p => p.theme.colors.border};
    border-radius: 0;
    cursor: pointer;
    font-weight: 550;
    line-height: 1.4;
  }
  input { flex: 0 0 16px; width: 16px; height: 16px; margin: 0; accent-color: ${p => p.theme.colors.primary}; }
`;

const FormError = styled.div`
  margin-bottom: 20px;
  padding: 12px 14px;
  border: 1px solid ${p => p.theme.colors.danger};
  border-radius: 0;
  background: ${p => p.theme.colors.dangerSoft};
  color: ${p => p.theme.colors.danger};
  font-size: 0.87rem;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid ${p => p.theme.colors.border};
  @media (max-width: 560px) { align-items: stretch; flex-direction: column; }
`;

const ActionGroup = styled.div`display: flex; gap: 10px; @media (max-width: 560px) { flex-direction: column; }`;

const Button = styled.button`
  min-height: 48px;
  padding: 11px 20px;
  border: 1px solid ${p => p.$primary ? p.theme.colors.primary : p.theme.colors.border};
  border-radius: 0;
  background: ${p => p.$primary ? p.theme.colors.primary : p.theme.colors.surface};
  color: ${p => p.$primary ? '#fff' : p.theme.colors.text};
  font-size: 0.82rem;
  font-weight: 680;
  opacity: ${p => p.disabled ? 0.55 : 1};
  &:hover:not(:disabled) { background: ${p => p.$primary ? p.theme.colors.primaryDark : p.theme.colors.surfaceAlt}; }
`;

const Saved = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.74rem;

  &::before { content: '●'; color: ${p => p.theme.colors.success}; font-size: 0.6rem; }
`;

const Review = styled.div`
  padding: 18px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 0;
  background: ${p => p.theme.colors.surfaceAlt};
  h3 { margin: 0 0 10px; }
  dl { display: grid; grid-template-columns: 180px 1fr; gap: 8px 16px; margin: 0; }
  dt { color: ${p => p.theme.colors.textMuted}; }
  dd { margin: 0; font-weight: 550; }
  @media (max-width: 560px) { dl { grid-template-columns: 1fr; gap: 2px; } dd { margin-bottom: 8px; } }
`;

const LegalCheckPanel = styled.section`
  padding: clamp(22px, 3vw, 30px);
  border: 1px solid ${p => p.theme.colors.border};
  border-left: 5px solid ${p => {
    if (p.$status === 'verified_sources') return p.theme.colors.success;
    if (p.$status === 'blocked') return p.theme.colors.danger;
    return p.theme.colors.warning;
  }};
  background: ${p => p.theme.colors.surfaceAlt};
`;

const LegalCheckHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;

  h3 { margin: 0 0 8px; font-size: 1.15rem; letter-spacing: -0.02em; }
  p { max-width: 720px; margin: 0; color: ${p => p.theme.colors.textMuted}; font-size: 0.86rem; line-height: 1.6; }

  @media (max-width: 680px) {
    flex-direction: column;
    button { width: 100%; }
  }
`;

const LegalCheckStatus = styled.div`
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid ${p => p.theme.colors.border};

  > strong { display: block; margin-bottom: 6px; font-size: 0.92rem; }
  > p { margin: 0; color: ${p => p.theme.colors.textMuted}; line-height: 1.6; }
`;

const SourceReceipts = styled.div`
  display: grid;
  gap: 1px;
  margin-top: 18px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.border};
`;

const SourceReceipt = styled.article`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  padding: 16px 18px;
  background: ${p => p.theme.colors.surface};

  h4 { margin: 0 0 5px; font-size: 0.9rem; line-height: 1.4; }
  p { margin: 4px 0 0; color: ${p => p.theme.colors.textMuted}; font-size: 0.76rem; line-height: 1.5; }
  a { color: ${p => p.theme.colors.primary}; font-weight: 650; text-decoration-thickness: 1px; text-underline-offset: 3px; }
  details { margin-top: 10px; color: ${p => p.theme.colors.text}; font-size: 0.76rem; }
  summary { cursor: pointer; font-weight: 650; }

  @media (max-width: 620px) { grid-template-columns: 1fr; gap: 10px; }
`;

const SourceState = styled.span`
  align-self: start;
  min-width: 132px;
  padding: 6px 8px;
  border: 1px solid ${p => {
    if (p.$state === 'verified_exact') return p.theme.colors.success;
    if (p.$state === 'changed' || p.$state === 'unavailable') return p.theme.colors.danger;
    return p.theme.colors.warning;
  }};
  background: ${p => {
    if (p.$state === 'verified_exact') return p.theme.colors.successSoft;
    if (p.$state === 'changed' || p.$state === 'unavailable') return p.theme.colors.dangerSoft;
    return p.theme.colors.warningSoft;
  }};
  color: ${p => {
    if (p.$state === 'verified_exact') return p.theme.colors.success;
    if (p.$state === 'changed' || p.$state === 'unavailable') return p.theme.colors.danger;
    return p.theme.colors.warning;
  }};
  font: 680 0.68rem/1.35 ${p => p.theme.fonts.mono};
  text-align: center;
`;

const LegalWarnings = styled.ul`
  margin: 18px 0 0;
  padding: 14px 18px 14px 34px;
  border-left: 3px solid ${p => p.theme.colors.warning};
  background: ${p => p.theme.colors.warningSoft};
  color: ${p => p.theme.colors.text};
  font-size: 0.78rem;
  line-height: 1.55;
`;

const ResultLegalWrap = styled.div`margin-bottom: 24px;`;

const ResultTop = styled.section`
  position: relative;
  padding: clamp(34px, 5vw, 66px);
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  h1 { font-size: clamp(2rem, 4vw, 3.25rem); max-width: 100%; }
  ${p => p.$reading && `padding: 0; border: 0; background: transparent; &::before { display: none; }`}

  &::before {
    content: '';
    position: absolute;
    top: -1px;
    bottom: -1px;
    left: -1px;
    width: 8px;
    background: ${p => p.$tone};
  }
`;

const ResultMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin: 18px 0;
`;

const Pill = styled.span`
  max-width: 100%; overflow-wrap: anywhere;
  display: inline-flex;
  padding: 6px 9px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 0;
  background: ${p => p.theme.colors.surfaceAlt};
  font: 650 0.75rem ${p => p.theme.fonts.mono};
`;

const ResultActions = styled.div`display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px;`;
const CaseLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.theme.colors.text};
  font-size: 0.84rem;
  font-weight: 620;
`;

const ResultTabs = styled.div`
  display: flex; gap: 6px; flex-wrap: wrap; margin-top: 28px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  button { min-height: 48px; padding: 12px 20px; border-bottom: 3px solid transparent; font-weight: 650; }
  button[aria-selected="true"] { color: ${p => p.theme.colors.primary}; border-bottom-color: ${p => p.theme.colors.primary}; }
`;
const SectionDetails = styled.details`
  padding: 16px 0; border-top: 1px solid ${p => p.theme.colors.border};
  summary { cursor: pointer; display: flex; justify-content: space-between; gap: 16px; align-items: start; }
  summary::before { content: '+'; color: ${p => p.theme.colors.primary}; font-weight: 700; }
  &[open] summary::before { content: '−'; }
  summary strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  summary span { flex-shrink: 0; max-width: 45%; }
  p { margin: 18px 0 10px; line-height: 1.7; }
  small { color: ${p => p.theme.colors.textMuted}; }
  @media (max-width: 600px) { summary { flex-wrap: wrap; } summary span { max-width: 100%; } }
`;

const ResultGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  > [hidden] { display: none; }
  gap: 32px;
  margin-top: 32px;
  @media (max-width: 850px) { grid-template-columns: 1fr; }
`;

const Card = styled.section`
  min-width: 0; overflow-wrap: anywhere;
  margin-bottom: 24px;
  padding: 26px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 0;
  background: ${p => p.theme.colors.surface};
  h2, h3 { margin: 0 0 12px; }
  p { white-space: pre-wrap; }
  ul { margin: 0; padding-left: 20px; }
`;

const ScreeningGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: 20px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.border};

  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;

const ScreeningItem = styled.article`
  min-height: 148px;
  padding: 18px;
  background: ${p => p.$matched ? p.theme.colors.warningSoft : p.theme.colors.surfaceAlt};

  strong { display: block; margin: 11px 0 6px; font-size: 0.86rem; line-height: 1.35; }
  p { margin: 0; color: ${p => p.theme.colors.textMuted}; font-size: 0.76rem; line-height: 1.5; }
`;

const ScreeningState = styled.span`
  color: ${p => p.$matched ? p.theme.colors.warning : p.theme.colors.success};
  font: 700 0.66rem/1.2 ${p => p.theme.fonts.mono};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const SourceNote = styled.p`
  margin: 14px 0 0 !important;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.76rem;
  line-height: 1.55;
  a { color: ${p => p.theme.colors.primary}; font-weight: 650; }
`;

const SectionCard = styled.article`
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid ${p => p.theme.colors.border};
  &:first-of-type { border-top: 0; padding-top: 0; }
  header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
  h3 { font-size: 1.02rem; }
  p { margin: 8px 0; line-height: 1.65; }
  small { color: ${p => p.theme.colors.textMuted}; }
`;

const ReviewDetails = styled.details`
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid ${p => p.theme.colors.border};
  summary { cursor: pointer; font-weight: 650; }
  ul { margin-top: 14px; }
  li { margin: 10px 0; line-height: 1.5; }
  small { display: block; color: ${p => p.theme.colors.textMuted}; }
`;



const InlineError = styled.div`
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 0;
  background: ${p => p.theme.colors.dangerSoft};
  color: ${p => p.theme.colors.danger};
  font-weight: 600;
`;

const fieldId = (name) => `dpia-${name}`;
const FIELD_HELP = {
  project_name: 'Brug et genkendeligt navn på AI-løsningen og dens opgave, fx "Mødeassistent til interne møder".',
  organisation: 'Angiv den organisation, hvis brug af løsningen vurderes. Det kan være en anden kommune end portalens branding.',
  data_subjects: 'Vælg de grupper, hvis oplysninger kan indgå, fx borgere i dokumenter eller medarbejdere på en lydoptagelse.',
  personal_data_categories: 'Medtag både indholdet og de oplysninger, løsningen selv gemmer, fx navne i dokumenter, lyd og brugerlogs.',
  special_categories: 'Se på det konkrete indhold, fx oplysninger om helbred eller fagforeningsforhold. Dokumentér afgrænsningen; spørg de juridisk ansvarlige ved tvivl.',
  article_9_basis: 'Angiv det grundlag, der er afklaret med de juridisk ansvarlige for denne anvendelse. Valget her er ikke en juridisk godkendelse.',
  criminal_data: 'Overvej, om materiale kan indeholde oplysninger om lovovertrædelser eller straffesager. Beskriv anvendelsen frem for konkrete personers forhold.',
  criminal_data_basis: 'Brug det grundlag, der er dokumenteret for denne anvendelse, og få det gennemgået juridisk.',
  cpr_data: 'Medtag også CPR-numre, der kan forekomme i uploadede bilag, selv om de ikke er et selvstændigt felt i løsningen.',
  cpr_basis: 'Få afklaret med de juridisk ansvarlige, hvilket grundlag der gælder for den konkrete brug af CPR-numre.',
  vulnerable_subjects: 'Overvej fx børn, borgere i udsatte situationer eller personer, som kan have svært ved at forstå eller gøre indsigelse mod behandlingen.',
  large_scale: 'Se på antal personer, mængden af oplysninger, varighed og udbredelse. Vælg Ikke afklaret, hvis omfanget endnu ikke er beskrevet.',
  systematic_monitoring: 'Overvej fx løbende registrering af adfærd, placering eller aktivitet. En enkelt upload og løbende sporing kan være forskellige anvendelser.',
  solution_type: 'Vælg den planlagte opsætning, fx en ekstern webtjeneste, en integration eller drift i organisationens eget miljø.',
  supplier_name: 'Angiv den ansvarlige leverandør. Beskriv eventuelle andre virksomheder i dataflowet eller leverandørdokumentationen.',
  hosting_region: 'Brug dokumentation for den konkrete aftale og opsætning. Serverplacering alene siger ikke, hvor support eller underleverandører kan tilgå data.',
  transfer_outside_eea: 'Medtag både lagring og adgang, fx fjernsupport eller underleverandører. Vælg Ikke afklaret, hvis aftalerne ikke dokumenterer svaret.',
  transfer_mechanism: 'Angiv kun det overførselsgrundlag, der er dokumenteret og juridisk afklaret for den konkrete dataoverførsel.',
  model_training: 'Undersøg både input, output og eventuel viderebrug hos underleverandører. Brug aftalen og den valgte opsætning; gæt ikke ud fra en generel produktside.',
  profiling_scoring: 'Overvej fx rangering, vurdering eller forudsigelser om en persons adfærd eller behov. Beskriv, hvordan resultatet bruges.',
  data_matching: 'Overvej, om løsningen kombinerer oplysninger om de samme personer fra flere kilder, fx fagsystem og e-mail.',
  service_access_impact: 'Overvej, om output kan påvirke, hvad en person får adgang til, fx en kommunal ydelse. Medtag også indirekte beslutningsstøtte.',
  automated_decisions: 'Beskriv, om AI foreslår eller træffer beslutninger om personer, og hvem der kontrollerer resultatet før videre brug.',
  human_oversight: 'Der skal være en faktisk arbejdsgang: hvem gennemgår output, hvad kontrolleres, og hvordan kan en fejl stoppes eller rettes?',
  legal_basis: 'Vælg grundlaget for kommunens konkrete brug af oplysningerne i samråd med de juridisk ansvarlige. En aftale med leverandøren er ikke i sig selv denne afklaring.',
  retention_period: 'Beskriv frister for relevante datatyper, fx upload, udkast, logs og backups, og hvem der kontrollerer sletning. Kopiér ikke en eksempelperiode uden afklaring.',
  dpo_involved: 'Angiv, om organisationens databeskyttelsesrådgiver er inddraget, og dokumentér rådgivningen nedenfor.',
  controls: 'Markér oplyste eller planlagte tiltag. Markér først implementering som verificeret nedenfor, når der findes konkret dokumentation.',
  rights_procedures: 'Vælg de arbejdsgange, der er dokumenteret, fx hvordan en borger kan få indsigt, og hvem der håndterer henvendelsen.',
};

const FieldError = ({ name, errors }) => errors[name] ? <ErrorText id={`${fieldId(name)}-error`}>{errors[name]}</ErrorText> : null;

const TextField = ({ name, label, value, errors, onChange, textarea = false, help = FIELD_HELP[name], ...rest }) => {
  const Component = textarea ? Textarea : Input;
  return (
    <Field>
      <FieldLabel><label htmlFor={fieldId(name)}>{label}</label>{help && <FieldHelp label={label} id={`${fieldId(name)}-help`}>{help}</FieldHelp>}</FieldLabel>
      <Component
        id={fieldId(name)}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        $invalid={Boolean(errors[name])}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={[help ? `${fieldId(name)}-help` : '', errors[name] ? `${fieldId(name)}-error` : ''].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      <FieldError name={name} errors={errors} />
    </Field>
  );
};

const SelectField = ({ name, label, value, errors, onChange, options, placeholder = 'Vælg…', disabled = false, help = FIELD_HELP[name] }) => (
  <Field>
    <FieldLabel><label htmlFor={fieldId(name)}>{label}</label>{help && <FieldHelp label={label} id={`${fieldId(name)}-help`}>{help}</FieldHelp>}</FieldLabel>
    <Select id={fieldId(name)} value={value} disabled={disabled} onChange={e => onChange(name, e.target.value)} $invalid={Boolean(errors[name])} aria-invalid={Boolean(errors[name])} aria-describedby={[help ? `${fieldId(name)}-help` : '', errors[name] ? `${fieldId(name)}-error` : ''].filter(Boolean).join(' ') || undefined}>
      <option value="">{placeholder}</option>
      {Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </Select>
    <FieldError name={name} errors={errors} />
  </Field>
);

const BooleanField = ({ name, label, value, errors, onChange, allowUnknown = false, help = FIELD_HELP[name] }) => (
  <Question $invalid={Boolean(errors[name])} aria-labelledby={`${fieldId(name)}-label`} aria-invalid={Boolean(errors[name])} aria-describedby={[help ? `${fieldId(name)}-help` : '', errors[name] ? `${fieldId(name)}-error` : ''].filter(Boolean).join(' ') || undefined}>
    <legend><span id={`${fieldId(name)}-label`}>{label}</span>{help && <FieldHelp label={label} id={`${fieldId(name)}-help`}>{help}</FieldHelp>}</legend>
    <Radios>
      <label><input type="radio" name={name} checked={value === true} onChange={() => onChange(name, true)} /> Ja</label>
      <label><input type="radio" name={name} checked={value === false} onChange={() => onChange(name, false)} /> Nej</label>
      {allowUnknown && <label><input type="radio" name={name} checked={value === null} onChange={() => onChange(name, null)} /> Ikke afklaret</label>}
    </Radios>
    <FieldError name={name} errors={errors} />
  </Question>
);

const CheckboxField = ({ name, label, values, options, errors, onToggle, help = FIELD_HELP[name] }) => (
  <Field role="group" aria-labelledby={`${fieldId(name)}-label`} aria-describedby={help ? `${fieldId(name)}-help` : undefined}>
    <FieldLabel><span id={`${fieldId(name)}-label`}>{label}</span>{help && <FieldHelp label={label} id={`${fieldId(name)}-help`}>{help}</FieldHelp>}</FieldLabel>
    <CheckGrid>
      {options.map(([key, text]) => (
        <CheckLabel key={key} $checked={values.includes(key)}>
          <input type="checkbox" checked={values.includes(key)} onChange={() => onToggle(name, key)} />
          <span>{text}</span>
        </CheckLabel>
      ))}
    </CheckGrid>
    <FieldError name={name} errors={errors} />
  </Field>
);

const VerifiedControlsField = ({ planned, verified, evidence, errors, onToggle, onEvidence }) => (
  <Field>
    <label>Verificerede og implementerede kontroller</label>
    <small>Markér kun en kontrol som verificeret, når implementeringen er kontrolleret. Angiv konkret evidens, fx testrapport, konfiguration, aftale eller logudtræk. Kun verificerede kontroller kan reducere restrisikoen.</small>
    {planned.length === 0 ? <ErrorText>Vælg først planlagte eller oplyste kontroller ovenfor.</ErrorText> : (
      <VerificationList>
        {CONTROL_OPTIONS.filter(([key]) => planned.includes(key)).map(([key, text]) => {
          const isVerified = verified.includes(key);
          return (
            <VerificationCard key={key} $verified={isVerified}>
              <label>
                <input type="checkbox" checked={isVerified} onChange={() => onToggle(key)} />
                <span><strong>{text}</strong><br /><small>{isVerified ? 'Markeret som verificeret' : 'Planlagt/oplyst – endnu ikke verificeret'}</small></span>
              </label>
              {isVerified && <>
                <Textarea
                  value={evidence[key] || ''}
                  onChange={event => onEvidence(key, event.target.value)}
                  placeholder="Beskriv hvad der er kontrolleret, hvornår og hvor evidensen findes…"
                  $invalid={Boolean(errors[`control_evidence.${key}`])}
                  aria-label={`Evidens for ${text}`}
                />
                {errors[`control_evidence.${key}`] && <ErrorText>{errors[`control_evidence.${key}`]}</ErrorText>}
              </>}
            </VerificationCard>
          );
        })}
      </VerificationList>
    )}
    <FieldError name="verified_controls" errors={errors} />
  </Field>
);

const listText = (values, options) => values.map(value => options.find(([key]) => key === value)?.[1] || value).join(', ') || 'Ingen valgt';
const completenessPercent = value => Math.max(0, Math.min(100, Math.round(Number(value || 0) <= 1 ? Number(value || 0) * 100 : Number(value || 0))));
const asList = value => Array.isArray(value) ? value : value ? [value] : [];
const RISK_LABELS = {
  low: 'Lav',
  medium: 'Mellem',
  high: 'Høj',
  very_high: 'Meget høj',
};
const REVIEW_STATUS_LABELS = {
  requires_review: 'Kræver faglig gennemgang',
  missing_information: 'Mangler oplysninger',
  not_applicable: 'Ikke relevant',
};
const SECTION_SOURCE_LABELS = {
  provided_input: 'Indtastet grundlag',
  deterministic_rule: 'Vurderingsregel',
  missing_information: 'Manglende grundlag',
  ai_generated: 'AI-udarbejdet udkast',
};
const riskLabel = value => RISK_LABELS[value] || value || 'Ikke angivet';
const apiDetailMessage = detail => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(item => {
      if (typeof item === 'string') return item;
      const field = asList(item?.loc).filter(part => part !== 'body').join('.');
      return `${field ? `${field}: ` : ''}${item?.msg || 'ugyldig værdi'}`;
    }).join(' · ');
  }
  return 'Serveren kunne ikke gennemføre vurderingen.';
};

const LEGAL_VERIFICATION_FIELDS = new Set([
  'legal_basis',
  'legal_basis_reference',
  'legal_basis_source_url',
  'special_categories',
  'article_9_basis',
  'criminal_data',
  'criminal_data_basis',
  'criminal_data_legal_reference',
  'cpr_data',
  'cpr_basis',
  'cpr_legal_reference',
]);

const sourceStateLabel = state => ({
  verified_exact: 'Eksakt verificeret',
  changed: 'Teksten er ændret',
  unavailable: 'Kilden er utilgængelig',
}[state] || 'Ikke verificeret');

const safePublicSourceUrl = value => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch (_) {
    return null;
  }
};

const formatCheckTime = value => {
  if (!value) return 'ukendt tidspunkt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ukendt tidspunkt';
  return date.toLocaleString('da-DK', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const LegalVerificationBlock = ({ verification, loading = false, error = '', onVerify }) => (
  <LegalCheckPanel $status={verification?.status || (error ? 'blocked' : undefined)}>
    <LegalCheckHead>
      <div>
        <h3>Kontrollér bestemmelserne i officielle kilder</h3>
        <p>
          S.H.I.E.L.D. henter de valgte bestemmelser direkte fra EUR-Lex, Retsinformation
          og Datatilsynet. En konkret sektorhjemmel kontrolleres i Retsinformations
          strukturerede lovtekst, herunder dokumentstatus, paragraf, stykke og om
          bestemmelsen er ophævet. Kontrollen bekræfter ikke juridisk relevans.
        </p>
      </div>
      {onVerify && (
        <Button type="button" onClick={onVerify} disabled={loading}>
          {loading ? 'Kontrollerer kilder…' : verification ? 'Kontrollér igen' : 'Kontrollér online'}
        </Button>
      )}
    </LegalCheckHead>

    <div aria-live="polite">
      {error && <InlineError role="alert">{error}</InlineError>}
      {loading && !verification && <LegalCheckStatus><p>Henter og sammenholder de officielle lovtekster…</p></LegalCheckStatus>}
      {verification && (
        <LegalCheckStatus>
          <strong>{verification.status_label}</strong>
          <p>{verification.conclusion} Kontrolleret {formatCheckTime(verification.checked_at)}.</p>
          <SourceReceipts>
            {asList(verification.receipts).map(receipt => (
              <SourceReceipt key={receipt.citation_id}>
                <div>
                  <h4>{receipt.law} · {receipt.provision}</h4>
                  <p>
                    {receipt.authority} · {receipt.cached ? 'cachet kildehentning' : 'hentet live'}
                    {receipt.source_status ? ` · ${receipt.source_status === 'Valid' ? 'Gældende dokument' : `Dokumentstatus: ${receipt.source_status}`}` : ''}
                    {receipt.source_sha256 ? ` · SHA-256 ${receipt.source_sha256.slice(0, 12)}…` : ''}
                    {' · '}<a href={receipt.official_url} target="_blank" rel="noreferrer noopener">Åbn officiel kilde</a>
                  </p>
                  <p>{receipt.message}</p>
                  {receipt.matched_excerpt && (
                    <details>
                      <summary>Se fundet lovtekst</summary>
                      <p>{receipt.matched_excerpt}</p>
                    </details>
                  )}
                </div>
                <SourceState $state={receipt.match_status}>{sourceStateLabel(receipt.match_status)}</SourceState>
              </SourceReceipt>
            ))}
          </SourceReceipts>
          {asList(verification.warnings).length > 0 && (
            <LegalWarnings>
              {asList(verification.warnings).map((warning, index) => <li key={index}>{warning}</li>)}
            </LegalWarnings>
          )}
        </LegalCheckStatus>
      )}
    </div>
  </LegalCheckPanel>
);

const DpiaAssessmentPage = () => {
  const { authFetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const assessmentId = searchParams.get('assessment_id') || searchParams.get('assessment') || '';
  const queryCaseId = searchParams.get('case') || searchParams.get('case_db_id') || '';
  const procurementReviewId = searchParams.get('procurement_review') || '';
  const readableView = searchParams.get('view') === 'readable';
  const draftStorageKey = queryCaseId ? `${DRAFT_STORAGE_KEY}:${queryCaseId}:${procurementReviewId || 'manual'}` : DRAFT_STORAGE_KEY;
  const [restoredDraft] = useState(() => loadDraft(draftStorageKey));
  const [prefillLoading, setPrefillLoading] = useState(Boolean(procurementReviewId && !assessmentId));
  const [prefillError, setPrefillError] = useState('');
  const [prefillLoaded, setPrefillLoaded] = useState(false);
  const [values, setValues] = useState(() => restoredDraft?.values || { ...INITIAL_ASSESSMENT });
  const [step, setStep] = useState(() => restoredDraft?.step || 0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [savedAt, setSavedAt] = useState(restoredDraft?.savedAt || null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [resultTab, setResultTab] = useState('analysis');
  const [editingReport, setEditingReport] = useState(false);
  useEffect(() => setEditingReport(false), [assessmentId]);
  useEffect(() => setResultTab('analysis'), [assessmentId]);
  const caseDbId = result?.case_db_id || queryCaseId;
  const [loadingResult, setLoadingResult] = useState(Boolean(assessmentId));
  const [resultError, setResultError] = useState('');
  const [aiStatus, setAiStatus] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [legalVerification, setLegalVerification] = useState(null);
  const [legalVerificationError, setLegalVerificationError] = useState('');
  const [verifyingLegalBasis, setVerifyingLegalBasis] = useState(false);
  const headingRef = useRef(null);
  const legalRequestRef = useRef({ sequence: 0, controller: null });
  const generationRequestRef = useRef(null);
  const activeResultId = useRef(null);
  const editableResultId = useRef(null);

  useEffect(() => {
    if (assessmentId || procurementReviewId) return;
    const draft = loadDraft(draftStorageKey);
    setValues(draft?.values || { ...INITIAL_ASSESSMENT });
    setStep(draft?.step || 0); setSavedAt(draft?.savedAt || null);
  }, [draftStorageKey, assessmentId, procurementReviewId]);

  useEffect(() => {
    if (!procurementReviewId || assessmentId) { setPrefillLoading(false); return undefined; }
    const controller = new AbortController();
    setPrefillLoading(true); setPrefillError(''); setPrefillLoaded(false);
    authFetch(`/api/v3/cases/${encodeURIComponent(queryCaseId)}/procurement/reviews/${encodeURIComponent(procurementReviewId)}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload?.detail === 'string' ? payload.detail : 'Det gennemgåede grundlag kunne ikke hentes.');
        if (payload.case_id !== queryCaseId || payload.id !== procurementReviewId || !payload.dpia_prefill) throw new Error('Grundlaget tilhører ikke denne sag.');
        if (!controller.signal.aborted) {
          const draft = loadDraft(draftStorageKey);
          setValues(draft?.values || { ...INITIAL_ASSESSMENT, ...payload.dpia_prefill });
          setStep(draft?.step || 0); setSavedAt(draft?.savedAt || null); setPrefillLoaded(true);
        }
      })
      .catch(error => { if (!controller.signal.aborted) setPrefillError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setPrefillLoading(false); });
    return () => controller.abort();
  }, [procurementReviewId, queryCaseId, assessmentId, authFetch, draftStorageKey]);

  useEffect(() => {
    if (!assessmentId) {
      generationRequestRef.current?.abort();
      activeResultId.current = null;
      setResult(null);
      setLoadingResult(false);
      setResultError('');
      return undefined;
    }
    if (activeResultId.current === assessmentId) return undefined;
    generationRequestRef.current?.abort();
    activeResultId.current = null;
    const controller = new AbortController();
    setLoadingResult(true);
    setResultError('');
    setResult(null);
    setDownloadError('');
    setGenerationError('');
    const load = async () => {
      try {
        const response = await authFetch(`/api/dpia/assessments/${encodeURIComponent(assessmentId)}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(response.status === 404 ? 'Den gemte vurdering blev ikke fundet.' : apiDetailMessage(payload?.detail));
        if (!payload?.id || payload.id !== assessmentId) throw new Error('Serveren returnerede et ugyldigt vurderingsresultat.');
        if (controller.signal.aborted) return;
        activeResultId.current = payload.id;
        editableResultId.current = null;
        setResult(payload);
      } catch (error) {
        if (!controller.signal.aborted) setResultError(error instanceof TypeError ? 'Vurderingen kunne ikke hentes. Kontrollér forbindelsen og genindlæs siden.' : error.message);
      } finally {
        if (!controller.signal.aborted) setLoadingResult(false);
      }
    };
    load();
    return () => controller.abort();
  }, [assessmentId, authFetch]);

  useEffect(() => {
    const controller = new AbortController();
    authFetch('/api/dpia/ai/status', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(payload => { if (!controller.signal.aborted) setAiStatus(payload); })
      .catch(() => { if (!controller.signal.aborted) setAiStatus({ configured: false }); });
    return () => controller.abort();
  }, [authFetch]);

  useEffect(() => {
    if (assessmentId || result || (procurementReviewId && (!prefillLoaded || prefillLoading || prefillError))) return undefined;
    const timeout = window.setTimeout(() => {
      const timestamp = new Date().toISOString();
      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify({ values, step, savedAt: timestamp }));
        setSavedAt(timestamp);
      } catch (_) { /* Autosave is helpful, never a blocker. */ }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [values, step, assessmentId, result, draftStorageKey, procurementReviewId, prefillLoaded, prefillLoading, prefillError]);

  useEffect(() => { headingRef.current?.focus(); }, [step, result]);

  useEffect(() => () => legalRequestRef.current.controller?.abort(), []);
  useEffect(() => () => generationRequestRef.current?.abort(), []);

  const showSavedResult = payload => {
    activeResultId.current = payload.id;
    setResult(payload);
    const next = new URLSearchParams(searchParams);
    next.delete('assessment');
    next.set('assessment_id', payload.id);
    if (payload.case_db_id || caseDbId) next.set('case', payload.case_db_id || caseDbId);
    setSearchParams(next);
  };

  const update = (name, value) => {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
    setFormError('');
    if (LEGAL_VERIFICATION_FIELDS.has(name)) {
      legalRequestRef.current.sequence += 1;
      legalRequestRef.current.controller?.abort();
      legalRequestRef.current.controller = null;
      setVerifyingLegalBasis(false);
      setLegalVerification(null);
      setLegalVerificationError('');
    }
  };

  const toggle = (name, item) => {
    const current = values[name] || [];
    if (name === 'controls' && current.includes(item)) {
      setValues(previous => {
        const nextEvidence = { ...previous.control_evidence };
        delete nextEvidence[item];
        return {
          ...previous,
          controls: previous.controls.filter(value => value !== item),
          verified_controls: previous.verified_controls.filter(value => value !== item),
          control_evidence: nextEvidence,
        };
      });
      setErrors(previous => ({ ...previous, controls: undefined, verified_controls: undefined, [`control_evidence.${item}`]: undefined }));
      return;
    }
    update(name, current.includes(item) ? current.filter(value => value !== item) : [...current, item]);
  };

  const toggleVerifiedControl = (control) => {
    const isVerified = values.verified_controls.includes(control);
    setValues(previous => {
      const nextEvidence = { ...previous.control_evidence };
      if (isVerified) delete nextEvidence[control];
      return {
        ...previous,
        verified_controls: isVerified
          ? previous.verified_controls.filter(value => value !== control)
          : [...previous.verified_controls, control],
        control_evidence: nextEvidence,
      };
    });
    setErrors(previous => ({ ...previous, verified_controls: undefined, [`control_evidence.${control}`]: undefined }));
  };

  const updateControlEvidence = (control, text) => {
    setValues(previous => ({ ...previous, control_evidence: { ...previous.control_evidence, [control]: text } }));
    setErrors(previous => ({ ...previous, [`control_evidence.${control}`]: undefined }));
  };

  const goToStep = nextStep => {
    setErrors({});
    setFormError('');
    setStep(Math.max(0, Math.min(3, nextStep)));
  };
  const goNext = () => goToStep(step + 1);

  const verifyLegalSources = async () => {
    if (!values.legal_basis || values.legal_basis === 'not_assessed') {
      setLegalVerificationError('Vælg først et behandlingsgrundlag.');
      return;
    }
    legalRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const sequence = legalRequestRef.current.sequence + 1;
    legalRequestRef.current = { sequence, controller };
    setVerifyingLegalBasis(true);
    setLegalVerificationError('');
    try {
      const response = await authFetch('/api/dpia/legal-basis/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          legal_basis: values.legal_basis,
          legal_basis_reference: values.legal_basis_reference.trim(),
          legal_basis_source_url: (values.legal_basis_source_url || '').trim(),
          special_categories: values.special_categories === true,
          article_9_basis: values.special_categories ? values.article_9_basis : 'not_applicable',
          criminal_data: values.criminal_data === true,
          criminal_data_basis: values.criminal_data ? values.criminal_data_basis : 'not_applicable',
          criminal_data_legal_reference: values.criminal_data ? values.criminal_data_legal_reference.trim() : '',
          cpr_data: values.cpr_data === true,
          cpr_basis: values.cpr_data ? values.cpr_basis : 'not_applicable',
          cpr_legal_reference: values.cpr_data ? values.cpr_legal_reference.trim() : '',
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiDetailMessage(payload?.detail));
      if (!payload?.status || !Array.isArray(payload.receipts)) {
        throw new Error('Kildetjenesten returnerede et ugyldigt svar.');
      }
      if (sequence !== legalRequestRef.current.sequence) return;
      setLegalVerification(payload);
    } catch (error) {
      if (error.name === 'AbortError' || sequence !== legalRequestRef.current.sequence) return;
      setLegalVerification(null);
      setLegalVerificationError(error instanceof TypeError
        ? 'Der kunne ikke oprettes forbindelse til kildetjenesten. Ingen hjemmel er markeret som verificeret.'
        : error.message);
    } finally {
      if (sequence === legalRequestRef.current.sequence) {
        legalRequestRef.current.controller = null;
        setVerifyingLegalBasis(false);
      }
    }
  };

  const submit = async () => {
    const allErrors = validateAssessment(values);
    if (Object.keys(allErrors).length) {
      const firstInvalidStep = [0, 1, 2, 3].find(index => Object.keys(validateStep(index, values)).length) ?? 0;
      setStep(firstInvalidStep);
      setErrors(validateStep(firstInvalidStep, values));
      setFormError('Vurderingen kan ikke beregnes endnu. Udfyld de markerede felter.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const endpoint = caseDbId
        ? `/api/dpia/assessments?case_db_id=${encodeURIComponent(caseDbId)}`
        : '/api/dpia/assessments';
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(toAssessmentRequest(values)),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiDetailMessage(payload?.detail));
      }
      if (!payload?.id) throw new Error('Serveren returnerede et ugyldigt vurderingsresultat.');
      setLegalVerification(payload.legal_verification || null);
      editableResultId.current = payload.id;
      showSavedResult(payload);
    } catch (error) {
      setFormError(error instanceof TypeError
        ? 'Der kunne ikke oprettes forbindelse til vurderingsservicen. Kontrollér driften og prøv igen.'
        : error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const generateReport = async () => {
    if (!result?.id || !caseDbId || generationRequestRef.current) return;
    const controller = new AbortController();
    const sourceAssessmentId = result.id;
    generationRequestRef.current = controller;
    setGenerating(true);
    setGenerationError('');
    const timeout = window.setTimeout(() => controller.abort(), AI_GENERATION_TIMEOUT_MS);
    try {
      const response = await authFetch(`/api/dpia/assessments/${encodeURIComponent(result.id)}/generate`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (activeResultId.current !== sourceAssessmentId) return;
      if (!response.ok) throw new Error(apiDetailMessage(payload?.detail));
      if (!payload?.id || payload.id === result.id || !payload.ai_generation) throw new Error('Serveren returnerede ikke en ny AI-version. Genåbn sagen for at kontrollere vurderingerne.');
      editableResultId.current = null;
      showSavedResult(payload);
    } catch (error) {
      if (activeResultId.current !== sourceAssessmentId) return;
      setGenerationError(error.name === 'AbortError'
        ? 'Forbindelsen til udarbejdelsen fik timeout. Genåbn sagen og kontrollér, om en ny version er gemt, før du starter igen.'
        : error instanceof TypeError
          ? 'Forbindelsen blev afbrudt. Genåbn sagen og kontrollér vurderingerne, før du starter igen.'
          : error.message);
    } finally {
      window.clearTimeout(timeout);
      generationRequestRef.current = null;
      setGenerating(false);
    }
  };

  const download = async (format) => {
    if (!result?.id) return;
    setDownloading(format);
    setDownloadError('');
    try {
      const response = await authFetch(`/api/dpia/assessments/${encodeURIComponent(result.id)}/export.${format}`);
      if (!response.ok) throw new Error(`${format === 'docx' ? 'Word' : 'Excel'}-filen kunne ikke dannes.`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `konsekvensanalyse-${result.id}-v${result.version || 1}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error.message);
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    legalRequestRef.current.sequence += 1;
    legalRequestRef.current.controller?.abort();
    legalRequestRef.current.controller = null;
    window.localStorage.removeItem(draftStorageKey);
    setValues({ ...INITIAL_ASSESSMENT });
    setStep(0);
    setResult(null);
    setErrors({});
    setFormError('');
    setSavedAt(null);
    setLegalVerification(null);
    setLegalVerificationError('');
    setGenerationError('');
    const next = new URLSearchParams(searchParams);
    next.delete('assessment_id');
    next.delete('assessment');
    if (caseDbId) next.set('case', caseDbId);
    setSearchParams(next);
  };

  const editInputs = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('assessment_id');
    next.delete('assessment');
    if (caseDbId) next.set('case', caseDbId);
    setSearchParams(next);
    setResult(null);
  };

  const statusTone = useMemo(() => {
    const signal = `${result?.status || ''} ${result?.risk_level || ''}`.toLowerCase();
    if (signal.includes('blocked')) return '#a52822';
    if (signal.includes('requires_action')) return '#b07816';
    if (signal.includes('ready_for_review')) return '#2f6b2f';
    if (signal.includes('ikke_klar')) return '#a52822';
    if (signal.includes('kræver_tiltag')) return '#b07816';
    if (signal.includes('klar_til_review')) return '#2f6b2f';
    if (/critical|high|blocked|no.go/.test(signal)) return '#a52822';
    if (/medium|review|conditional/.test(signal)) return '#b07816';
    return '#2f6b2f';
  }, [result]);

  if (prefillLoading || prefillError) {
    return <Page><Eyebrow>Grundlag fra leverandørmaterialet</Eyebrow><Title>Konsekvensanalyse</Title>{prefillLoading ? <Lead role="status">Henter de gennemgåede oplysninger…</Lead> : <InlineError role="alert">{prefillError}</InlineError>}<ResultActions><CaseLink to={`/anskaffelse?case=${encodeURIComponent(queryCaseId)}&step=materials`}>Tilbage til AI-løsningens materiale</CaseLink></ResultActions></Page>;
  }

  if (loadingResult || resultError) {
    return (
      <Page>
        <Eyebrow>Gemt vurdering</Eyebrow>
        <Title ref={headingRef} tabIndex="-1">Konsekvensanalyse</Title>
        {loadingResult ? <Lead role="status">Henter den gemte version…</Lead> : <InlineError role="alert">{resultError}</InlineError>}
        {queryCaseId && <ResultActions><CaseLink to={`/sager/${queryCaseId}`}>Tilbage til samlet sag</CaseLink></ResultActions>}
      </Page>
    );
  }

  if (result) {
    const generation = result.ai_generation;
    const displayLimitations = modelNotes(generation?.limitations, generation?.model);
    const changeView = (readable, tab = 'analysis', sectionId) => {
      const next = new URLSearchParams(searchParams);
      if (readable) next.set('view', 'readable'); else next.delete('view');
      setResultTab(tab);
      setSearchParams(next);
      requestAnimationFrame(() => {
        const section = !readable && sectionId && document.getElementById(`assessment-section-${sectionId}`);
        if (section) {
          section.open = true;
          section.scrollIntoView({ block: 'start' });
          section.querySelector('summary')?.focus({ preventScroll: true });
          return;
        }
        const target = document.getElementById(readable ? 'readable-assessment' : `result-tab-${tab}`);
        target?.focus();
      });
    };
    const staleCheckIds = new Set(asList(result.editorial_revision?.stale_check_ids));
    const reviewChecks = asList(generation?.review?.checks).filter(check => !staleCheckIds.has(check.id) && !asList(check.section_ids).some(id => staleCheckIds.has(id)));
    const reviewFlags = reviewChecks.filter(check => check.requires_review);
    const sources = asList(generation?.sources);
    const sourceReferences = ids => asList(ids).map(id => sourceLabel(sources.find(source => source.id === id) || { id, title: id })).join(' · ');
    const reviewTargetLabel = target => {
      if (target === 'summary') return 'Resumé';
      if (target.startsWith('recommendation:')) return `Anbefaling · ${asList(result.recommendations).find(item => item.id === target.slice(15))?.title || target.slice(15)}`;
      if (target.startsWith('risk:')) return `Risiko ${target.slice(5)}`;
      const sectionId = target.replace(/^section:/, '');
      return asList(result.sections).find(section => section.id === sectionId)?.title || target;
    };
    return (
      <Page $reading={readableView}>
        <ResultTop $tone={statusTone} $reading={readableView}>
          <Eyebrow>Konsekvensanalyse · version {result.version || 1} · {formatCheckTime(result.created_at)}</Eyebrow>
          <Title ref={headingRef} tabIndex="-1">{result.project_name || `Konsekvensanalyse · ${result.id?.slice(0, 8) || 'gemt vurdering'}`}</Title>
          {result.organisation && <Lead><strong>Dataansvarlig organisation:</strong> {result.organisation}</Lead>}
          {!readableView && (result.department || result.processing_version) && <Lead>{[result.department, result.processing_version && `Behandling: ${result.processing_version}`].filter(Boolean).join(' · ')}</Lead>}
          {!readableView && <p><strong>{result.status_label || 'Kræver faglig gennemgang'}</strong></p>}
          <ResultActions role="group" aria-label="Visningsform">
            <Button $primary={readableView} aria-pressed={readableView} onClick={() => changeView(true)} disabled={generating || editingReport}>Læsevenlig udgave</Button>
            <Button $primary={!readableView} aria-pressed={!readableView} onClick={() => changeView(false)} disabled={generating || editingReport}>Fuld vurdering</Button>
          </ResultActions>
          {readableView ? <SourceNote>Et overblik til ledelse og faglig dialog. {generation?.model ? `Udarbejdet med ${modelLabel(generation.model)}.` : 'Baseret på den gemte vurdering.'}</SourceNote> : <ResultMeta>
            <Pill>Risiko: {riskLabel(result.risk_level)}</Pill>
            <Pill>Komplethed: {completenessPercent(result.completeness)}%</Pill>
            <Pill>DPIA påkrævet: {result.dpia_required === true ? 'Ja' : result.dpia_required === false ? 'Nej' : 'Skal afklares'}</Pill>
            <Pill>Skabelon: {result.template_version || 'ukendt'}</Pill>
            {generation?.model && <Pill>Model: {modelLabel(generation.model)}</Pill>}
            {generation && <Pill>AI-udarbejdet udkast · kræver faglig gennemgang</Pill>}
          </ResultMeta>}
          {!readableView && <AssessmentSummary result={result} caseDbId={caseDbId} onFollowup={() => { setResultTab('followup'); requestAnimationFrame(() => { document.getElementById('result-tab-followup')?.focus(); document.getElementById('result-tab-followup')?.scrollIntoView({ block: 'center' }); }); }} />}
          {!readableView && <SafetyNote>Resultatet er beslutningsstøtte. Den dataansvarlige og DPO skal kontrollere faktum, hjemmel, risici og foranstaltninger før godkendelse.</SafetyNote>}
          {!readableView && <ResultActions data-tour="assessment-downloads">
            <Button $primary onClick={() => download('docx')} disabled={Boolean(downloading)}>{downloading === 'docx' ? 'Danner Word…' : 'Hent konsekvensanalyse (Word)'}</Button>
            <Button onClick={() => download('xlsx')} disabled={Boolean(downloading)}>{downloading === 'xlsx' ? 'Danner Excel…' : 'Hent risikovurdering (Excel)'}</Button>
            {caseDbId && <CaseLink to={`/sager/${caseDbId}`}>Tilbage til samlet sag</CaseLink>}
            {!readableView && editableResultId.current === result.id && <Button onClick={editInputs} disabled={generating||editingReport}>Redigér oplysninger</Button>}
            {!readableView && <Button onClick={reset} disabled={generating||editingReport}>Start ny vurdering</Button>}
            {!readableView && caseDbId && <Button onClick={()=>setEditingReport(true)} disabled={generating||editingReport}>{editingReport?'Rapporteditor er åben':'Redigér rapportudkast'}</Button>}
          </ResultActions>}
          {!readableView && caseDbId && (
            <>
              <ResultActions data-tour="ai-report">
                <Button onClick={generateReport} disabled={generating || editingReport || !aiStatus?.configured}>
                  {generating ? 'Udarbejder og kvalitetstjekker…' : generation ? 'Opret ny AI-version' : 'Udarbejd med AI'}
                </Button>
                <CaseLink to={`/sager/${encodeURIComponent(caseDbId)}?tab=technical-runs&assessment_id=${encodeURIComponent(result.id)}`}>Teknisk kørsel</CaseLink>
                {result.parent_assessment_id && <CaseLink to={`/vurdering?assessment_id=${encodeURIComponent(result.parent_assessment_id)}&case=${encodeURIComponent(caseDbId)}`}>Se foregående version</CaseLink>}
              </ResultActions>
              <SourceNote role={generating ? 'status' : undefined}>
                {generating
                  ? `GPT udarbejder rapporten. Store kildegrundlag behandles i delanalyser og samles, før JEV kontrollerer rapporten mod sagens grundlag. Det kan tage længere tid ved mange dokumenter. Den nye version gemmes på sagen, når behandlingen er færdig.`
                  : aiStatus?.configured
                    ? 'AI udarbejder en ny version ud fra det gemte grundlag. Denne version bevares i sagens historik.'
                    : 'AI-udarbejdelse er ikke tilgængelig på serveren i øjeblikket.'}
              </SourceNote>
            </>
          )}
          {generationError && <InlineError role="alert">{generationError}</InlineError>}
          {downloadError && <InlineError role="alert">{downloadError}</InlineError>}
        </ResultTop>

        {readableView ? <>
          <ReadableAssessment result={result} onOpenDetails={(tab, sectionId) => changeView(false, tab, sectionId)} />
          <ResultActions data-tour="assessment-downloads">
            <Button onClick={() => download('docx')} disabled={Boolean(downloading)}>{downloading === 'docx' ? 'Danner Word…' : 'Hent konsekvensanalyse (Word)'}</Button>
            <Button onClick={() => download('xlsx')} disabled={Boolean(downloading)}>{downloading === 'xlsx' ? 'Danner Excel…' : 'Hent risikovurdering (Excel)'}</Button>
            {caseDbId && <CaseLink to={`/sager/${caseDbId}`}>Tilbage til samlet sag</CaseLink>}
          </ResultActions>
          <SourceNote>Word og Excel indeholder den fulde vurdering og dens dokumentation.</SourceNote>
        </> : <>
        {result.editorial_revision && <Card><h2>Fagligt redigeret rapportversion</h2><p>{result.editorial_revision.note}</p><SourceNote>{asList(result.editorial_revision.changed_targets).length} afsnit er ændret. De ændrede formuleringer kræver en ny faglig gennemgang. {generation ? 'De er ikke omfattet af den tidligere JEV-kontrol.' : 'Den redigerede tekst er ikke kontrolleret med JEV.'} Vurderingens risikoscorer og krav er bevaret.</SourceNote></Card>}
        {editingReport && <ReportEditor assessment={result} onClose={()=>setEditingReport(false)} onSaved={payload=>{setEditingReport(false);showSavedResult(payload);}} />}

        <ResultTabs role="tablist" aria-label="Læs vurderingen">
          {[
            ['analysis', 'Konsekvensanalyse'],
            ['risks', `Risikovurdering (${asList(result.risks).length})`],
            ['followup', 'Opfølgning'],
            ['recommendations', 'Anbefalinger'],
            ['sources', 'Kilder'],
          ].map(([id, label], index, tabs) => <button key={id} type="button" role="tab" id={`result-tab-${id}`} aria-controls={`result-panel-${id}`} aria-selected={resultTab === id} tabIndex={resultTab === id ? 0 : -1} onClick={() => setResultTab(id)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
            if (next !== null) { event.preventDefault(); setResultTab(tabs[next][0]); document.getElementById(`result-tab-${tabs[next][0]}`)?.focus(); }
          }}>{label}</button>)}
        </ResultTabs>
        <ResultGrid>
          <div role="tabpanel" id="result-panel-analysis" aria-labelledby="result-tab-analysis" hidden={resultTab !== 'analysis'} tabIndex="0">
            {generation && (
              <Card>
                <h2>Kvalitetstjek med JEV</h2>
                <p>{result.editorial_revision ? 'Den oprindelige AI-version blev udarbejdet med' : 'Udarbejdet med'} {modelLabel(generation.model)}. {result.editorial_revision ? 'Uændrede kontrolpunkter fra den tidligere JEV-kørsel vises nedenfor.' : `Kontrolleret med ${modelLabel(generation.review?.model || 'JEV')}.`}</p>
                <p>{reviewFlags.length ? `${reviewFlags.length} ${reviewFlags.length === 1 ? 'kontrolpunkt' : 'kontrolpunkter'} kræver opfølgning.` : reviewChecks.length ? 'JEV har ikke markeret kontrolpunkter til opfølgning.' : 'Der foreligger ikke et fuldt kvalitetstjek.'} Faglig gennemgang af faktum, hjemmel og risici kræves før godkendelse.</p>
                {reviewFlags.length > 0 && <ul>{reviewFlags.slice(0, 5).map(check => <li key={check.id}>{check.label}{asList(check.section_ids).length > 0 ? ` · ${asList(check.section_ids).map(reviewTargetLabel).join(' · ')}` : ''}</li>)}</ul>}
                {reviewChecks.length > 0 && (
                  <ReviewDetails>
                    <summary>{reviewChecks.length === 1 ? 'Se kontrolpunktet' : `Se alle ${reviewChecks.length} kontrolpunkter`}</summary>
                    <ul>{reviewChecks.map(check => (
                      <li key={check.id}>
                        <strong>{check.label}</strong> · {check.requires_review ? 'Kræver opfølgning' : 'Ingen bemærkning fra JEV'}
                        {asList(check.section_ids).length > 0 && <small>Vedrører: {asList(check.section_ids).map(reviewTargetLabel).join(' · ')}</small>}
                      </li>
                    ))}</ul>
                  </ReviewDetails>
                )}
                {displayLimitations.length > 0 && <ReviewDetails><summary>Se forbehold for AI og kildegrundlaget ({displayLimitations.length})</summary><ul>{displayLimitations.map((limitation, index) => <li key={index}><StructuredReportText text={limitation} /></li>)}</ul></ReviewDetails>}
              </Card>
            )}
            {result.legal_verification && (
              <ResultLegalWrap>
                <LegalVerificationBlock verification={result.legal_verification} />
              </ResultLegalWrap>
            )}
            {result.scope && <Card><h2>Afgrænsning</h2><StructuredReportText text={result.scope} /></Card>}
            {result.template_alignment && (
              <Card>
                <h2>EDPB 2026-skabelondækning</h2>
                <p>
                  S.H.I.E.L.D. dækker {result.template_alignment.score}% af de strukturerede områder i EDPB's
                  konsultationsudkast. Det er en komplethedskontrol, ikke en juridisk godkendelse.
                </p>
                {asList(result.template_alignment.areas).map((area) => (
                  <SectionCard key={area.id}>
                    <header>
                      <h3>{area.title}</h3>
                      <Pill>{area.state === 'covered' ? 'Dækket' : area.state === 'partial' ? 'Delvist dækket' : 'Mangler'}</Pill>
                    </header>
                    <p>{area.explanation}</p>
                    {asList(area.missing_fields).length > 0 && (
                      <small>Mangler: {asList(area.missing_fields).join(' · ')}</small>
                    )}
                  </SectionCard>
                ))}
                <SourceNote>
                  {result.template_alignment.disclaimer}{' '}
                  <a href="https://www.edpb.europa.eu/public-consultations/template-for-data-protection-impact-assessment_en" target="_blank" rel="noreferrer noopener">Se EDPB's kilde og status</a>.
                </SourceNote>
              </Card>
            )}
            {asList(result.screening_criteria).length > 0 && (
              <Card>
                <h2>Hvorfor udløses en DPIA?</h2>
                <p>{result.screening_conclusion}</p>
                <ScreeningGrid>
                  {asList(result.screening_criteria).map((criterion) => (
                    <ScreeningItem key={criterion.id} $matched={criterion.matched}>
                      <ScreeningState $matched={criterion.matched}>{criterion.matched === null ? 'Ikke afklaret' : criterion.matched ? 'Matcher' : 'Matcher ikke'}</ScreeningState>
                      <strong>{criterion.label}</strong>
                      <p>{criterion.explanation}</p>
                    </ScreeningItem>
                  ))}
                </ScreeningGrid>
                <SourceNote>
                  Screeningen følger de ni europæiske højrisikokriterier. To kriterier er en tommelfingerregel, ikke en automatisk juridisk afgørelse.{' '}
                  <a href="https://www.edpb.europa.eu/topics/accountability-and-compliance-tools/data-protection-impact-assessment_en" target="_blank" rel="noreferrer noopener">Læs EDPB's DPIA-vejledning</a>.
                </SourceNote>
              </Card>
            )}
            <Card>
              <h2>Konsekvensanalysens afsnit</h2>
              {asList(result.sections).length ? asList(result.sections).map((section, index) => (
                <SectionDetails id={`assessment-section-${section.id}`} key={section.id || index} style={{ scrollMarginTop: 100 }}>
                  <summary>
                    <strong>{section.id && `${section.id} · `}{section.title}</strong>
                    <Pill>{REVIEW_STATUS_LABELS[section.review_status] || section.review_status || 'Kræver faglig gennemgang'}</Pill>
                  </summary>
                  <StructuredReportText text={section.text} />
                  {section.source && <small>Grundlag: {SECTION_SOURCE_LABELS[section.source] || section.source}</small>}
                  {asList(section.source_ids).length > 0 && <SourceNote>Kilder: {sourceReferences(section.source_ids)}</SourceNote>}
                  {reviewFlags.filter(check => asList(check.section_ids).some(id => id === `section:${section.id}` || id === section.id)).map(check => <LegalWarnings key={check.id}><li>JEV: {check.label} — kræver opfølgning.</li></LegalWarnings>)}
                </SectionDetails>
              )) : <p>Ingen afsnit blev returneret.</p>}
            </Card>
          </div>
          <div role="tabpanel" id="result-panel-risks" aria-labelledby="result-tab-risks" hidden={resultTab !== 'risks'} tabIndex="0">
            <RiskAssessmentPanel key={result.id} risks={result.risks} reviewChecks={reviewChecks} sourceReferences={sourceReferences} riskLabel={riskLabel} />
            {asList(result.additional_risks || generation?.additional_risks).length > 0 && <Card>
              <h2>Supplerende risici til faglig vurdering</h2>
              <p>Disse scenarier supplerer de {asList(result.risks).length} katalogrisici ovenfor. De har endnu ikke en særskilt beregnet risikoscore.</p>
              {asList(result.additional_risks || generation?.additional_risks).map((risk, index) => <SectionCard key={risk.id || index}>
                <h3>{risk.title || risk.area || `Supplerende risiko ${index + 1}`}</h3>
                <h4>Hvad kan gå galt?</h4><StructuredReportText text={typeof risk === 'string' ? risk : risk.scenario || risk.description || risk.text} />
                <h4>Hvorfor er det en risiko?</h4><StructuredReportText text={risk.rationale || 'En særskilt begrundelse skal dokumenteres ved den faglige gennemgang.'} />
                <h4>Hvem rammes – og hvad er konsekvensen?</h4><StructuredReportText text={risk.consequences || 'Personkonsekvenserne skal præciseres som del af den supplerende vurdering.'} />
                <h4>Forslag til risikobegrænsning</h4><SourceNote>Forslag – ikke dokumenteret implementeret</SourceNote><StructuredReportText text={risk.measures || 'Konkrete foranstaltninger skal afklares.'} />
                {asList(risk.source_ids).length > 0 && <SourceNote>Kilder: {sourceReferences(risk.source_ids)}</SourceNote>}
              </SectionCard>)}
            </Card>}
          </div>
          <div role="tabpanel" id="result-panel-followup" aria-labelledby="result-tab-followup" hidden={resultTab !== 'followup'} tabIndex="0">
            {[
              ['Blokeringer', result.reading_guide?.blockers || result.blockers],
              ['Manglende oplysninger', result.reading_guide?.missing_information || result.missing_information],
              ['Næste skridt', result.next_steps],
              ['Åbne spørgsmål', result.open_questions || generation?.open_questions],
            ].map(([title, items]) => asList(items).length > 0 && (
              <Card key={title}><h3>{title}</h3><ul>{asList(items).map((item, index) => <li key={index}><StructuredReportText text={typeof item === 'string' ? item : item.text || JSON.stringify(item)} /></li>)}</ul></Card>
            ))}

          </div>
          <div role="tabpanel" id="result-panel-recommendations" aria-labelledby="result-tab-recommendations" hidden={resultTab !== 'recommendations'} tabIndex="0">
            <AssessmentRecommendations result={result} sourceReferences={sourceReferences} />
          </div>
          <div role="tabpanel" id="result-panel-sources" aria-labelledby="result-tab-sources" hidden={resultTab !== 'sources'} tabIndex="0">
            {sources.length > 0 && (
              <Card>
                <h2>Grundlag for denne version</h2>
                {sources.map((source, index) => {
                  const sourceUrl = safePublicSourceUrl(source.source_url || source.url);
                  return (
                  <SectionCard key={source.id || index}>
                    <h3>{source.title || source.id || `Kilde ${index + 1}`}</h3>
                    {(source.excerpt || source.text || source.description) && <ReviewDetails><summary>Læs kildeuddrag</summary><StructuredReportText text={source.excerpt || source.text || source.description} /></ReviewDetails>}
                    {source.version && <small>Dokumentversion: {source.version}</small>}
                    {sourceUrl && <SourceNote><a href={sourceUrl} target="_blank" rel="noreferrer noopener">Åbn kilde</a></SourceNote>}
                    {typeof source.retrieved_at === 'string' && <SourceNote>Hentet {formatCheckTime(source.retrieved_at)}</SourceNote>}
                  </SectionCard>
                  );
                })}
              </Card>
            )}
            {sources.length === 0 && <Card><h2>Grundlag for vurderingen</h2><p>Denne version bygger på de gemte oplysninger i spørgerammen. Eventuelle dokumenter og databehandleraftaler findes under sagens Dokumentation.</p>{caseDbId && <CaseLink to={`/sager/${caseDbId}?tab=documents`}>Se sagens dokumentation</CaseLink>}</Card>}
          </div>
        </ResultGrid>
        </>}
      </Page>
    );
  }

  const renderStep = () => {
    if (step === 0) return (
      <Grid>
        <TextField name="project_name" label="Løsningens eller projektets navn" value={values.project_name} errors={errors} onChange={update} autoComplete="off" />
        <TextField name="organisation" label="Dataansvarlig organisation" value={values.organisation} errors={errors} onChange={update} />
        <DepartmentField value={values.department} errors={errors} onChange={update} />
        <TextField name="owner" label="Faglig ansvarlig" value={values.owner} errors={errors} onChange={update} help="Navn eller rolle med ansvar for løsningen. Ældre angivelser af afdeling kan fortsat bevares her." />
        <Full><ChoiceWithOtherField name="processing_version" label="Behandlingens version eller fase" value={values.processing_version} errors={errors} onChange={update} options={PROCESSING_VERSION_OPTIONS} customLabel="Angiv anden version eller fase" help="Vælg den version eller fase, vurderingen vedrører. Brug Andet til en specifik betegnelse." /></Full>
        <TextField name="planned_start_date" label="Forventet startdato" value={values.planned_start_date} errors={errors} onChange={update} type="date" max="9999-12-31" />
        <TextField name="planned_end_date" label="Forventet slutdato" value={values.planned_end_date} errors={errors} onChange={update} type="date" min={values.planned_start_date || undefined} max="9999-12-31" />
        <TextField name="planned_start_note" label="Bemærkning til starttidspunkt (valgfrit)" value={values.planned_start_note} errors={errors} onChange={update} help="Fx afhængighed af godkendelse. Tidligere starttidspunkt angivet som tekst bevares her." maxLength={2000} />
        <TextField name="planned_end_condition" label="Ophørsvilkår (valgfrit)" value={values.planned_end_condition} errors={errors} onChange={update} placeholder="Fx pilot slutter efter fire måneder" help="Beskriv, hvornår behandlingen skal ophøre, hvis det ikke kun afhænger af en dato." maxLength={2000} />
        <Full><TextField name="purpose" label="Formål med behandlingen" value={values.purpose} errors={errors} onChange={update} textarea help="Beskriv det konkrete behov, den forventede gevinst og hvorfor personoplysninger er nødvendige. Fx: Løsningen laver udkast til referat af interne møder, som en medarbejder kontrollerer før brug." /></Full>
        <Full><TextField name="processing_description" label="Sådan behandles oplysningerne" value={values.processing_description} errors={errors} onChange={update} textarea help="Beskriv dataflowet fra indsamling til sletning. Fx: Medarbejder uploader et dokument → leverandøren behandler det → medarbejder gennemgår udkast → original og udkast slettes efter aftalte frister. Medtag også logs og andre modtagere." /></Full>
        <Full><TextField name="secondary_uses" label="Sekundære eller kompatible anvendelser" value={values.secondary_uses} errors={errors} onChange={update} textarea help="Angiv andre forventede anvendelser eller skriv, at der ikke er planlagt sekundær brug." /></Full>
      </Grid>
    );

    if (step === 1) return (
      <Grid>
        <Full><CheckboxField name="data_subjects" label="Hvem handler oplysningerne om?" values={values.data_subjects} options={DATA_SUBJECT_OPTIONS} errors={errors} onToggle={toggle} /></Full>
        <Full><CheckboxField name="personal_data_categories" label="Hvilke almindelige personoplysninger behandles?" values={values.personal_data_categories} options={DATA_CATEGORY_OPTIONS} errors={errors} onToggle={toggle} /></Full>
        <BooleanField name="special_categories" label="Behandles følsomme oplysninger efter GDPR artikel 9?" value={values.special_categories} errors={errors} onChange={update} />
        {values.special_categories === true && <SelectField name="article_9_basis" label="Undtagelsesgrundlag efter GDPR artikel 9, stk. 2" value={values.article_9_basis} errors={errors} onChange={update} options={OPTION_LABELS.article_9_basis} />}
        <BooleanField name="criminal_data" label="Behandles oplysninger om strafbare forhold?" value={values.criminal_data} errors={errors} onChange={update} />
        {values.criminal_data === true && <>
          <SelectField name="criminal_data_basis" label="Grundlag for oplysninger om strafbare forhold" value={values.criminal_data_basis} errors={errors} onChange={update} options={OPTION_LABELS.criminal_data_basis} />
          <TextField name="criminal_data_legal_reference" label="Konkret hjemmel eller reference" value={values.criminal_data_legal_reference} errors={errors} onChange={update} placeholder="Fx databeskyttelseslovens § 8, stk. …" />
        </>}
        <BooleanField name="cpr_data" label="Behandles CPR-numre?" value={values.cpr_data} errors={errors} onChange={update} />
        {values.cpr_data === true && <>
          <SelectField name="cpr_basis" label="Grundlag for behandling af CPR-numre" value={values.cpr_basis} errors={errors} onChange={update} options={OPTION_LABELS.cpr_basis} />
          <TextField name="cpr_legal_reference" label="Konkret CPR-hjemmel eller reference" value={values.cpr_legal_reference} errors={errors} onChange={update} placeholder="Angiv lov og bestemmelse" />
        </>}
        <BooleanField name="vulnerable_subjects" label="Omfatter behandlingen børn eller andre sårbare personer?" value={values.vulnerable_subjects} errors={errors} onChange={update} />
        <BooleanField name="large_scale" label="Sker behandlingen i stort omfang?" value={values.large_scale} errors={errors} onChange={update} allowUnknown />
        <BooleanField name="systematic_monitoring" label="Indebærer løsningen systematisk overvågning eller sporing?" value={values.systematic_monitoring} errors={errors} onChange={update} />
      </Grid>
    );

    if (step === 2) return (
      <Grid>
        <SelectField name="solution_type" label="Løsningstype" value={values.solution_type} errors={errors} onChange={update} options={OPTION_LABELS.solution_type} />
        <TextField name="supplier_name" label="Leverandør eller udviklingsansvarlig" value={values.supplier_name} errors={errors} onChange={update} />
        <SelectField name="hosting_region" label="Primært hostingområde" value={values.hosting_region} errors={errors} onChange={update} options={OPTION_LABELS.hosting_region} />
        <BooleanField name="transfer_outside_eea" label="Overføres eller tilgås data uden for EU/EØS?" value={values.transfer_outside_eea} errors={errors} onChange={update} allowUnknown />
        {(values.transfer_outside_eea === true || values.transfer_outside_eea === null) && <SelectField name="transfer_mechanism" label="Overførselsgrundlag" value={values.transfer_outside_eea === null ? 'not_assessed' : values.transfer_mechanism} disabled={values.transfer_outside_eea === null} errors={errors} onChange={update} options={OPTION_LABELS.transfer_mechanism} />}
        <Full>
          <BooleanField name="model_training" label="Bruges organisationens input eller output til træning af modeller?" value={values.model_training} errors={errors} onChange={update} allowUnknown />
          <SourceNote>Vælg Ikke afklaret, når den konkrete aftale eller opsætning ikke dokumenterer svaret. Et ønske om ingen træning er ikke dokumentation. Leverandørmodellens udviklingsrisici skal fortsat vurderes ved et nej.</SourceNote>
        </Full>
        <Full>
          <Review>
            <h3>Europæisk højrisikoscreening</h3>
            <p>De næste spørgsmål udfylder de kriterier, som EDPB bruger til at vurdere, om en behandling sandsynligvis medfører høj risiko. Resultatet viser hvert match og begrundelsen — også når tommelfingerreglen om to kriterier ikke er opfyldt.</p>
          </Review>
        </Full>
        <BooleanField name="profiling_scoring" label="Profilerer, scorer eller forudsiger løsningen forhold om personer?" value={values.profiling_scoring} errors={errors} onChange={update} />
        <BooleanField name="data_matching" label="Sammenstilles oplysninger fra flere registre eller datakilder?" value={values.data_matching} errors={errors} onChange={update} />
        <BooleanField name="service_access_impact" label="Kan brugen påvirke adgang til en ydelse, rettighed, mulighed eller kontrakt?" value={values.service_access_impact} errors={errors} onChange={update} />
        <BooleanField name="automated_decisions" label="Træffer eller understøtter løsningen afgørelser om personer?" value={values.automated_decisions} errors={errors} onChange={update} />
        <Full>
          <BooleanField name="human_oversight" label="Er reel menneskelig kontrol af løsningens output etableret?" value={values.human_oversight} errors={errors} onChange={update} allowUnknown />
          <SourceNote>Et krav i en aftale eller en plan dokumenterer ikke, at kontrollen er etableret. Vælg Ikke afklaret, hvis den faktiske arbejdsgang ikke er dokumenteret. Planlagte eller oplyste kontroller registreres særskilt under Styring og kontrol.</SourceNote>
        </Full>
      </Grid>
    );

    return (
      <Grid>
        <SelectField name="legal_basis" label="Primært behandlingsgrundlag" value={values.legal_basis} errors={errors} onChange={update} options={OPTION_LABELS.legal_basis} />
        <TextField
          name="legal_basis_reference"
          label={requiresOfficialLegalSource(values) ? 'Konkret lov og bestemmelse' : 'Supplerende juridisk reference'}
          value={values.legal_basis_reference}
          errors={errors}
          onChange={update}
          placeholder="Fx sektorlovens § 82, stk. 1"
          help="Angiv lov, paragraf og gerne stykke. S.H.I.E.L.D. kontrollerer, at bestemmelsen findes og ikke er markeret som ophævet."
        />
        {requiresOfficialLegalSource(values) && (
          <TextField
            name="legal_basis_source_url"
            label="Officiel lovtekst på Retsinformation"
            value={values.legal_basis_source_url}
            errors={errors}
            onChange={update}
            placeholder="https://www.retsinformation.dk/eli/lta/ÅÅÅÅ/NUMMER"
            help="Indsæt lovens officielle ELI-link. Andre domæner og frie webadresser afvises."
          />
        )}
        <Full>
          <LegalVerificationBlock
            verification={legalVerification}
            loading={verifyingLegalBasis}
            error={legalVerificationError}
            onVerify={verifyLegalSources}
          />
        </Full>
        <TextField name="retention_period" label="Opbevarings- og slettefrist" value={values.retention_period} errors={errors} onChange={update} placeholder="Fx 90 dage efter afsluttet sag" />
        <BooleanField name="dpo_involved" label="Er DPO/databeskyttelsesrådgiver inddraget?" value={values.dpo_involved} errors={errors} onChange={update} allowUnknown />
        <Full><CheckboxField name="controls" label="Planlagte eller oplyste kontroller – reducerer ikke restrisiko uden evidens" values={values.controls} options={CONTROL_OPTIONS} errors={errors} onToggle={toggle} /></Full>
        <Full><VerifiedControlsField planned={values.controls} verified={values.verified_controls} evidence={values.control_evidence} errors={errors} onToggle={toggleVerifiedControl} onEvidence={updateControlEvidence} /></Full>
        <Full><CheckboxField name="rights_procedures" label="Dokumenterede procedurer for registreredes rettigheder" values={values.rights_procedures} options={RIGHTS_PROCEDURE_OPTIONS} errors={errors} onToggle={toggle} /></Full>
        {values.rights_procedures.length > 0 && <Full><TextField name="rights_procedure_description" label="Beskriv rettighedsprocedurerne" value={values.rights_procedure_description} errors={errors} onChange={update} textarea help="Angiv ansvarlig funktion, kontaktkanal, frister, systemunderstøttelse og hvordan anmodninger dokumenteres." /></Full>}
        <Full>
          <Review>
            <h3>Supplerende felter fra EDPB's 2026-udkast</h3>
            <p>Felterne forbedrer dækningen af nødvendighed, proportionalitet og interessentinddragelse. Udkastet er endnu ikke EDPB's endelige fælles skabelon.</p>
          </Review>
        </Full>
        <Full><TextField name="alternatives_considered" label="Mindre indgribende alternativer" value={values.alternatives_considered} errors={errors} onChange={update} textarea help="Beskriv reelle alternativer, og hvorfor den valgte behandling er nødvendig." /></Full>
        <Full><TextField name="benefits_and_proportionality" label="Fordele og proportionalitetsafvejning" value={values.benefits_and_proportionality} errors={errors} onChange={update} textarea help="Sammenhold gevinsterne med påvirkningen af de registreredes rettigheder og frihedsrettigheder." /></Full>
        <Full><TextField name="dpo_advice" label="DPO's rådgivning og opfølgning" value={values.dpo_advice} errors={errors} onChange={update} textarea help="Beskriv anbefalinger og hvordan de er eller bliver håndteret." /></Full>
        <Full><TextField name="data_subject_consultation" label="Registreredes synspunkter eller begrundet fravalg" value={values.data_subject_consultation} errors={errors} onChange={update} textarea help="Dokumentér inddragelse af borgere, medarbejdere eller repræsentanter – eller hvorfor den ikke er gennemført." /></Full>
        <Full><TextField name="publication_plan" label="Plan for offentliggørelse eller ekstern deling" value={values.publication_plan} errors={errors} onChange={update} textarea help="Angiv om hele eller dele af vurderingen skal offentliggøres eller deles." /></Full>
        <Full>
          <Review>
            <h3>Kontrollér grundlaget</h3>
            <dl>
              <dt>Løsning</dt><dd>{values.project_name}</dd>
              <dt>Registrerede</dt><dd>{listText(values.data_subjects, DATA_SUBJECT_OPTIONS)}</dd>
              <dt>Datakategorier</dt><dd>{listText(values.personal_data_categories, DATA_CATEGORY_OPTIONS)}</dd>
              <dt>Leverandør</dt><dd>{values.supplier_name || 'Internt / ikke angivet'}</dd>
              <dt>Behandlingsgrundlag</dt><dd>{OPTION_LABELS.legal_basis[values.legal_basis] || 'Ikke valgt'}</dd>
              <dt>Konkret hjemmel</dt><dd>{values.legal_basis_reference || 'Ikke angivet'}</dd>
              <dt>Officiel lovtekst</dt><dd>{values.legal_basis_source_url || 'Ikke angivet'}</dd>
              <dt>Online kildetjek</dt><dd>{legalVerification?.status_label || 'Ikke gennemført endnu'}</dd>
              <dt>Kontroller</dt><dd>{values.controls.length} planlagt/oplyst · {values.verified_controls.length} verificeret med evidens</dd>
              <dt>Rettighedsprocedurer</dt><dd>{values.rights_procedures.length ? listText(values.rights_procedures, RIGHTS_PROCEDURE_OPTIONS) : 'Ingen dokumenteret'}</dd>
            </dl>
          </Review>
        </Full>
      </Grid>
    );
  };

  return (
    <Page>
      <Hero>
        <div>
          <Eyebrow>{BRAND.name} · struktureret vurdering</Eyebrow>
          <Title ref={headingRef} tabIndex="-1">{values.project_name || 'Konsekvensanalyse, der kan efterprøves'}</Title>
          <Lead>Beskriv behandlingen trin for trin. {BRAND.name} identificerer behov for konsekvensanalyse, risici, mangler og næste skridt. Konsekvensanalysen kan hentes som Word og risikovurderingen som Excel.</Lead>
        </div>
        <SafetyNote>
          {caseDbId ? 'Denne vurdering gemmes direkte på den valgte sag. ' : ''}
          Indtast ikke CPR-numre, helbredsoplysninger eller konkrete sagsakter. Vurder systemet og databehandlingen – ikke enkelte personer.
        </SafetyNote>
      </Hero>

      {prefillLoaded && <Review><h3>Grundlag fra gennemgået leverandørmateriale</h3><p>Kommunens formål og de oplysninger, du har valgt, er overført. Uafklarede felter er stadig åbne. Hjemmel og implementerede kontroller skal dokumenteres særskilt.</p><CaseLink to={`/anskaffelse?case=${encodeURIComponent(queryCaseId)}&step=review`}>Se kilder og gemt gennemgang</CaseLink></Review>}
      <Workspace data-tour="assessment-form">
        <StepNav aria-label="Vurderingens trin">
          {STEPS.map(([title], index) => <StepItem key={title} $active={index === step}><button type="button" aria-current={index === step ? 'step' : undefined} aria-controls="dpia-step-content" onClick={() => goToStep(index)}><span>Trin {index + 1} af 4</span><strong>{title}</strong></button></StepItem>)}
        </StepNav>
        <FormBody id="dpia-step-content">
          <SectionHead>
            <Eyebrow>Trin {step + 1}</Eyebrow>
            <h2>{STEPS[step][0]}</h2>
            <p>{STEPS[step][1]}</p>
            <SourceNote>Du kan frit skifte mellem trinnene og udfylde oplysningerne i din egen rækkefølge. Manglende felter kontrolleres, når du udarbejder vurderingen.</SourceNote>
          </SectionHead>
          {formError && <FormError role="alert">{formError}</FormError>}
          {renderStep()}
          <Actions>
            <Saved>{savedAt ? `Kladde gemt lokalt ${new Date(savedAt).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}` : 'Kladde gemmes automatisk i denne browser'}</Saved>
            <ActionGroup>
              {step > 0 && <Button type="button" onClick={() => goToStep(step - 1)}>Tilbage</Button>}
              {step < 3
                ? <Button type="button" $primary onClick={goNext}>Fortsæt</Button>
                : <Button type="button" $primary onClick={submit} disabled={submitting}>{submitting ? 'Udarbejder vurdering…' : 'Udarbejd vurdering'}</Button>}
            </ActionGroup>
          </Actions>
        </FormBody>
      </Workspace>
    </Page>
  );
};

export default DpiaAssessmentPage;
