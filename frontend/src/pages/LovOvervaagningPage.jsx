import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

/**
 * LovOvervaagningPage — Citation-Verifierens administrative arbejdsflade.
 *
 * Friskhedsstatus og regelkatalog hentes som to uafhængige queries. React
 * Query starter dem i samme render, så katalogopslag ikke skaber et
 * fetch-waterfall. Siden kan fortsat bruges, hvis kataloget er utilgængeligt.
 */

async function fetchFreshness() {
  const res = await axios.get('/api/v3/law/freshness');
  return res.data;
}

async function fetchRules() {
  const res = await axios.get('/api/v3/rules');
  return res.data;
}

async function runFreshness() {
  const res = await axios.post('/api/v3/law/freshness/run', {}, { timeout: 240000 });
  return res.data;
}

async function fetchReassessments() {
  const res = await axios.get('/api/v3/law/reassessments', { params: { limit: 200 } });
  return res.data;
}

async function updateReassessment({ id, status, resolutionNote }) {
  const res = await axios.patch(`/api/v3/law/reassessments/${encodeURIComponent(id)}`, {
    status,
    resolution_note: resolutionNote?.trim() || null,
  });
  return res.data;
}

const Page = styled.div`
  width: min(1320px, calc(100% - 48px));
  margin: 0 auto;
  padding: 4.25rem 0 7.5rem;
  color: ${(p) => p.theme.colors.ink};

  @media (max-width: 720px) {
    width: calc(100% - 32px);
    padding: 2.75rem 0 4.5rem;
  }
`;

const Hero = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: clamp(2.5rem, 7vw, 7.5rem);
  align-items: end;
  padding-bottom: clamp(3rem, 6vw, 5.25rem);
  border-bottom: 1px solid ${(p) => p.theme.colors.line};

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
  }
`;

const Eyebrow = styled.div`
  margin-bottom: 0.75rem;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 1.5;
  text-transform: uppercase;
`;

const Title = styled.h1`
  max-width: 820px;
  margin: 0 0 1.25rem;
  color: ${(p) => p.theme.colors.ink};
  font-family: ${(p) => p.theme.fonts.display};
  font-size: clamp(3.25rem, 5.2vw, 4.4rem);
  font-weight: 590;
  letter-spacing: -0.052em;
  line-height: 1;

  @media (max-width: 720px) {
    font-size: clamp(2.4rem, 11vw, 3.25rem);
    letter-spacing: -0.04em;
  }
`;

const Lede = styled.p`
  max-width: 760px;
  margin: 0;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1.08rem;
  line-height: 1.68;

  @media (max-width: 720px) {
    font-size: 1rem;
    line-height: 1.62;
  }
`;

const ActionPanel = styled.aside`
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 1.6rem;
  background: ${(p) => p.theme.colors.card};
  border-top: 4px solid ${(p) => p.theme.colors.primary};

  h2 {
    margin: 0 0 0.6rem;
    color: ${(p) => p.theme.colors.ink};
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.35rem;
    font-weight: 620;
    letter-spacing: -0.025em;
    line-height: 1.25;
  }

  > p {
    margin: 0 0 1.25rem;
    color: ${(p) => p.theme.colors.inkSoft};
    font-family: ${(p) => p.theme.fonts.body};
    font-size: 0.91rem;
    line-height: 1.55;
  }
`;

const PrimaryButton = styled.button`
  min-height: 48px;
  width: 100%;
  padding: 0.75rem 1.15rem;
  background: ${(p) => p.theme.colors.primary};
  border: 1px solid ${(p) => p.theme.colors.primary};
  border-radius: 0;
  color: ${(p) => p.theme.colors.white};
  cursor: pointer;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.9rem;
  font-weight: 680;
  line-height: 1.35;
  transition: background-color 0.18s ease-out, border-color 0.18s ease-out;

  &:hover:not(:disabled) {
    background: ${(p) => p.theme.colors.primaryDark};
    border-color: ${(p) => p.theme.colors.primaryDark};
  }

  &:focus-visible {
    outline: 3px solid ${(p) => p.theme.colors.secondary};
    outline-offset: 3px;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.64;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const SecondaryButton = styled.button`
  min-height: 44px;
  padding: 0.65rem 1rem;
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.primary};
  border-radius: 0;
  color: ${(p) => p.theme.colors.primaryDark};
  cursor: pointer;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.88rem;
  font-weight: 650;

  &:hover {
    background: ${(p) => p.theme.colors.primarySoft};
  }

  &:focus-visible {
    outline: 3px solid ${(p) => p.theme.colors.secondary};
    outline-offset: 3px;
  }
`;

const feedbackColors = (theme, tone) => {
  if (tone === 'success') {
    return {
      background: theme.colors.successSoft,
      border: theme.colors.success,
      color: theme.colors.success,
    };
  }
  if (tone === 'danger') {
    return {
      background: theme.colors.dangerSoft,
      border: theme.colors.danger,
      color: theme.colors.danger,
    };
  }
  if (tone === 'progress') {
    return {
      background: theme.colors.warningSoft,
      border: theme.colors.warning,
      color: theme.colors.warning,
    };
  }
  return {
    background: theme.colors.paperSoft,
    border: theme.colors.line,
    color: theme.colors.inkSoft,
  };
};

const ManualFeedback = styled.div`
  min-height: 3.25rem;
  margin-top: 0.85rem;
  padding: 0.8rem 0.9rem;
  background: ${(p) => feedbackColors(p.theme, p.$tone).background};
  border-left: 3px solid ${(p) => feedbackColors(p.theme, p.$tone).border};
  color: ${(p) => feedbackColors(p.theme, p.$tone).color};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.82rem;
  line-height: 1.45;
`;

const SummarySection = styled.section`
  padding: clamp(3rem, 6vw, 5rem) 0;
`;

const SectionHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2rem;
  align-items: end;
  margin-bottom: 1.75rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: ${(p) => p.theme.colors.ink};
  font-family: ${(p) => p.theme.fonts.display};
  font-size: clamp(2rem, 3vw, 2.65rem);
  font-weight: 590;
  letter-spacing: -0.045em;
  line-height: 1.08;
`;

const SectionMeta = styled.p`
  margin: 0;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.78rem;
  line-height: 1.5;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  padding: 1px;
  background: ${(p) => p.theme.colors.line};

  @media (max-width: 940px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const statTone = (theme, tone) => {
  if (tone === 'success') return theme.colors.success;
  if (tone === 'danger') return theme.colors.danger;
  if (tone === 'warning') return theme.colors.warning;
  return theme.colors.secondary;
};

const StatCard = styled.article`
  min-height: 154px;
  padding: 1.55rem 1.6rem;
  background: ${(p) => p.theme.colors.card};
  border-top: 4px solid ${(p) => statTone(p.theme, p.$tone)};

  .label {
    margin-bottom: 0.8rem;
    color: ${(p) => p.theme.colors.inkSoft};
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  .value {
    margin-bottom: 0.45rem;
    color: ${(p) => statTone(p.theme, p.$tone)};
    font-family: ${(p) => p.theme.fonts.display};
    font-size: clamp(2.35rem, 4vw, 3rem);
    font-weight: 680;
    letter-spacing: -0.045em;
    line-height: 1;
  }

  .detail {
    color: ${(p) => p.theme.colors.inkSoft};
    font-family: ${(p) => p.theme.fonts.body};
    font-size: 0.88rem;
    line-height: 1.45;
  }
`;

const RulesSection = styled.section`
  padding-top: clamp(3rem, 6vw, 5rem);
  border-top: 1px solid ${(p) => p.theme.colors.line};
`;

const ReassessmentSection = styled.section`
  padding: clamp(3rem, 6vw, 5rem) 0;
  border-top: 1px solid ${(p) => p.theme.colors.line};
`;

const ReassessmentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 820px) { grid-template-columns: 1fr; }
`;

const ReassessmentCard = styled.article`
  display: grid;
  gap: 1.1rem;
  padding: 1.45rem;
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-top: 4px solid ${(p) => p.theme.colors.warning};

  h3 { margin: 0; color: ${(p) => p.theme.colors.ink}; font: 620 1.18rem/1.3 ${(p) => p.theme.fonts.display}; }
  p { margin: 0; color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.88rem; line-height: 1.55; }
  dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; margin: 0; }
  dt { color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  dd { margin: 0.25rem 0 0; overflow-wrap: anywhere; color: ${(p) => p.theme.colors.ink}; font-size: 0.82rem; }

  a.case-link { color: ${(p) => p.theme.colors.primaryDark}; font-weight: 680; text-decoration: underline; text-underline-offset: 3px; }
`;

const ResolutionForm = styled.form`
  display: grid;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid ${(p) => p.theme.colors.line};

  label { color: ${(p) => p.theme.colors.ink}; font-size: 0.78rem; font-weight: 650; }
  textarea { width: 100%; min-height: 86px; padding: 0.7rem; border: 1px solid ${(p) => p.theme.colors.line}; border-radius: 0; background: ${(p) => p.theme.colors.inputBackground}; color: ${(p) => p.theme.colors.ink}; resize: vertical; }
  small { color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.72rem; }
`;

const Notice = styled.div`
  margin-bottom: 1.5rem;
  padding: 0.9rem 1rem;
  background: ${(p) => p.theme.colors.warningSoft};
  border-left: 3px solid ${(p) => p.theme.colors.warning};
  color: ${(p) => p.theme.colors.warning};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.88rem;
  line-height: 1.5;
`;

const StatePanel = styled.div`
  padding: clamp(2rem, 5vw, 3.25rem);
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  line-height: 1.6;

  p {
    max-width: 680px;
    margin: 0 0 1rem;
  }
`;

const RuleList = styled.div`
  border-top: 1px solid ${(p) => p.theme.colors.line};
`;

const ruleTone = (theme, state) => {
  if (state === 'green') {
    return {
      color: theme.colors.success,
      background: theme.colors.successSoft,
      border: theme.colors.success,
    };
  }
  if (state === 'red') {
    return {
      color: theme.colors.danger,
      background: theme.colors.dangerSoft,
      border: theme.colors.danger,
    };
  }
  return {
    color: theme.colors.inkSoft,
    background: theme.colors.paperSoft,
    border: theme.colors.line,
  };
};

const RuleCard = styled.article`
  display: grid;
  grid-template-columns: minmax(320px, 1.1fr) minmax(500px, 0.9fr);
  gap: clamp(2.5rem, 5vw, 5.5rem);
  padding: clamp(2rem, 4vw, 3rem) 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
`;

const RuleIdentity = styled.div`
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  gap: 1.25rem;
`;

const StatusRail = styled.div`
  min-height: 100%;
  background: ${(p) => ruleTone(p.theme, p.$state).border};
`;

const RuleKicker = styled.div`
  margin-bottom: 0.55rem;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  line-height: 1.45;
  text-transform: uppercase;
`;

const RuleTitle = styled.h3`
  margin: 0 0 0.65rem;
  color: ${(p) => p.theme.colors.ink};
  font-family: ${(p) => p.theme.fonts.display};
  font-size: clamp(1.35rem, 2.2vw, 1.75rem);
  font-weight: 620;
  letter-spacing: -0.032em;
  line-height: 1.18;
`;

const RuleTechnicalId = styled.div`
  overflow-wrap: anywhere;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.76rem;
  line-height: 1.55;
`;

const SourceLink = styled.a`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  align-items: baseline;
  margin-top: 1.15rem;
  color: ${(p) => p.theme.colors.primaryDark};
  font-family: ${(p) => p.theme.fonts.sans};
  line-height: 1.45;
  text-decoration: none;

  .source-name {
    font-size: 0.92rem;
    font-weight: 680;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }

  .source-domain {
    color: ${(p) => p.theme.colors.inkSoft};
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.74rem;
  }

  &:hover .source-name {
    color: ${(p) => p.theme.colors.primary};
  }

  &:focus-visible {
    outline: 3px solid ${(p) => p.theme.colors.secondary};
    outline-offset: 4px;
  }
`;

const RuleMessage = styled.div`
  margin-top: 1.15rem;
  padding: 0.85rem 1rem;
  background: ${(p) => ruleTone(p.theme, p.$state).background};
  border-left: 3px solid ${(p) => ruleTone(p.theme, p.$state).border};
  color: ${(p) => ruleTone(p.theme, p.$state).color};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.86rem;
  line-height: 1.5;

  strong {
    display: block;
    margin-bottom: 0.2rem;
    font-family: ${(p) => p.theme.fonts.sans};
    font-weight: 700;
  }
`;

const DetailGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 1px;
  background: ${(p) => p.theme.colors.line};

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const Detail = styled.div`
  min-height: 92px;
  padding: 1rem 1.1rem;
  background: ${(p) => p.theme.colors.card};

  dt {
    margin: 0 0 0.5rem;
    color: ${(p) => p.theme.colors.inkSoft};
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: ${(p) => p.theme.colors.ink};
    font-family: ${(p) => p.theme.fonts.body};
    font-size: 0.89rem;
    line-height: 1.5;
  }

  time,
  .mono {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.79rem;
  }
`;

const StatusBadge = styled.span`
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
  min-height: 28px;
  padding: 0.3rem 0.55rem;
  background: ${(p) => ruleTone(p.theme, p.$state).background};
  border: 1px solid ${(p) => ruleTone(p.theme, p.$state).border};
  border-radius: 0;
  color: ${(p) => ruleTone(p.theme, p.$state).color};
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.015em;
  line-height: 1.35;

  .symbol {
    font-weight: 800;
  }
`;

const RULE_TITLES = {
  'ai_act.art13.transparens_og_brugerinformation': 'Transparens og brugerinformation',
  'ai_act.art14.menneskelig_overvaagning': 'Menneskelig overvågning',
  'ai_act.art5.forbudte_praksisser': 'Forbudte AI-praksisser',
  'ai_act.art50.transparens': 'Oplysningspligt og transparens',
  'ai_act.art6.hojrisiko_klassifikation': 'Klassifikation som højrisiko-AI',
  'forvaltningsloven.par19.partshoring': 'Partshøring',
  'forvaltningsloven.par22.begrundelsespligt': 'Begrundelsespligt',
  'forvaltningsloven.par24.begrundelsens_indhold': 'Begrundelsens indhold',
  'forvaltningsloven.par3.inhabilitet': 'Inhabilitet',
  'gdpr.art22.automatiseret_individuel_afgorelse': 'Automatiserede individuelle afgørelser',
  'gdpr.art32.sikkerhed_ved_behandling': 'Behandlingssikkerhed',
  'gdpr.art35.dpia_pligt': 'Pligt til konsekvensanalyse (DPIA)',
  'gdpr.art5.principper_for_behandling': 'Principper for behandling af personoplysninger',
  'gdpr.art6.retsgrundlag_for_behandling': 'Retsgrundlag for behandling',
  'offentlighedsloven.par13.dataudtraek_og_sammenstilling': 'Dataudtræk og sammenstilling',
};

const STATUS_COPY = {
  green: {
    label: 'Verificeret',
    symbol: '✓',
    description: 'Lovcitatet er fundet i den officielle kilde.',
  },
  red: {
    label: 'Kræver juridisk review',
    symbol: '!',
    description: 'Lovcitatet kunne ikke bekræftes automatisk.',
  },
  grey: {
    label: 'Ikke verificeret',
    symbol: '—',
    description: 'Der foreligger endnu ikke et entydigt kontrolresultat.',
  },
};

const SOURCE_NAMES = {
  'eur-lex.europa.eu': 'EUR-Lex',
  'www.retsinformation.dk': 'Retsinformation',
  'retsinformation.dk': 'Retsinformation',
};

const FALLBACK_LAWS = {
  ai_act: 'EU AI-forordningen',
  gdpr: 'Databeskyttelsesforordningen (GDPR)',
  forvaltningsloven: 'Forvaltningsloven',
  offentlighedsloven: 'Offentlighedsloven',
};

const fmtDate = (iso, dateOnly = false) => {
  if (!iso) return 'Ikke registreret';
  try {
    const options = dateOnly
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      };
    return new Date(iso).toLocaleString('da-DK', options);
  } catch {
    return 'Ikke registreret';
  }
};

const stateOf = (item) => {
  if ((item.snippet || '').toLowerCase().includes('delvis match')) return 'red';
  if (item.citation_found && !item.flagged_for_review) return 'green';
  if (item.flagged_for_review) return 'red';
  return 'grey';
};

const humanizeRuleId = (ruleId = '') => {
  const slug = ruleId.split('.').slice(2).join(' ') || ruleId;
  if (!slug) return 'Regel uden navn';
  const words = slug.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const fallbackArticle = (ruleId = '') => {
  const part = ruleId.split('.')[1] || '';
  if (part.startsWith('art')) return `Artikel ${part.slice(3)}`;
  if (part.startsWith('par')) return `§ ${part.slice(3)}`;
  return 'Artikel ikke angivet';
};

const sourceDetails = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();
    return {
      name: SOURCE_NAMES[domain] || domain.replace(/^www\./, ''),
      domain: domain.replace(/^www\./, ''),
      url,
    };
  } catch {
    return { name: 'Officiel kilde', domain: url, url };
  }
};

const verificationMethod = (method) => {
  if (method === 'playwright') return 'Browserkontrol';
  if (method === 'requests') return 'Automatisk kildekontrol';
  return 'Ikke registreret';
};

const LovOvervaagningPage = () => {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canRunVerification = hasRole('Hammeren.Admin');
  const [resolutionNotes, setResolutionNotes] = useState({});
  const {
    data: freshnessData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery('v3-freshness', fetchFreshness);
  const {
    data: rulesData,
    isError: isRulesError,
  } = useQuery('v3-rules', fetchRules, {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const {
    data: reassessmentData,
    isLoading: isReassessmentsLoading,
    isError: isReassessmentsError,
    error: reassessmentsError,
    refetch: refetchReassessments,
  } = useQuery('law-reassessments', fetchReassessments);

  const rulesById = useMemo(
    () => new Map((rulesData?.rules || []).map((rule) => [rule.id, rule])),
    [rulesData],
  );
  const items = useMemo(() => freshnessData?.items || [], [freshnessData]);
  const counts = useMemo(() => ({
    green: items.filter((item) => stateOf(item) === 'green').length,
    red: items.filter((item) => stateOf(item) === 'red').length,
    grey: items.filter((item) => stateOf(item) === 'grey').length,
  }), [items]);
  const coverage = items.length > 0 ? Math.round((counts.green / items.length) * 100) : 0;
  const activeReassessments = useMemo(
    () => (reassessmentData?.reassessments || []).filter((item) => ['open', 'in_progress'].includes(item.status)),
    [reassessmentData],
  );

  const runMutation = useMutation(runFreshness, {
    onSuccess: (nextData) => {
      queryClient.setQueryData('v3-freshness', nextData);
      queryClient.invalidateQueries('v3-freshness');
      queryClient.invalidateQueries('law-reassessments');
    },
  });
  const reassessmentMutation = useMutation(updateReassessment, {
    onSuccess: () => queryClient.invalidateQueries('law-reassessments'),
  });

  let manualTone = 'idle';
  let manualMessage = canRunVerification
    ? 'Den automatiske kontrol kører dagligt. En manuel kontrol kan tage op til fire minutter.'
    : 'Den automatiske daglige kontrol kører fortsat; kontakt en S.H.I.E.L.D.-administrator ved behov for en ekstra kørsel.';
  if (runMutation.isLoading) {
    manualTone = 'progress';
    manualMessage = 'Verifikationen kører. Behold siden åben, mens de officielle kilder kontrolleres.';
  } else if (runMutation.isError) {
    manualTone = 'danger';
    manualMessage = `Verifikationen kunne ikke gennemføres: ${String(runMutation.error?.message || runMutation.error)}`;
  } else if (runMutation.isSuccess) {
    manualTone = 'success';
    manualMessage = `Verifikationen er gennemført. ${runMutation.data?.count ?? items.length} regler er opdateret.`;
  }

  return (
    <Page>
      <Hero>
        <div>
          <Eyebrow>S.H.I.E.L.D. · juridisk kildekontrol</Eyebrow>
          <Title>Lovovervågning med dokumenteret friskhed</Title>
          <Lede>
            S.H.I.E.L.D. kontrollerer dagligt, om hvert lovcitat stadig findes i den
            officielle kilde. Afvigelser sendes til juridisk review, så kommunens
            vurderinger bygger på et synligt og efterprøvbart retsgrundlag.
          </Lede>
        </div>

        <ActionPanel aria-labelledby="manual-verification-title">
          <h2 id="manual-verification-title">Manuel verifikation</h2>
          <p>Kør en ny kontrol, når en lovtekst eller regel er blevet ændret.</p>
          {canRunVerification ? (
            <PrimaryButton
              type="button"
              disabled={runMutation.isLoading}
              aria-busy={runMutation.isLoading}
              aria-controls="law-status-list"
              aria-describedby="manual-verification-feedback"
              onClick={() => runMutation.mutate()}
            >
              {runMutation.isLoading ? 'Kontrollerer kilder…' : 'Kør verifikation nu'}
            </PrimaryButton>
          ) : <p>Kun en bruger med Administrator-rollen kan starte en manuel kildekontrol.</p>}
          <ManualFeedback
            id="manual-verification-feedback"
            $tone={manualTone}
            role={runMutation.isError ? 'alert' : 'status'}
            aria-live={runMutation.isError ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            {manualMessage}
          </ManualFeedback>
        </ActionPanel>
      </Hero>

      <SummarySection aria-labelledby="freshness-summary-title">
        <SectionHeader>
          <div>
            <Eyebrow>Aktuel kontrolstatus</Eyebrow>
            <SectionTitle id="freshness-summary-title">Retsgrundlaget i overblik</SectionTitle>
          </div>
          <SectionMeta>
            {freshnessData?.checked_at
              ? `Status hentet ${fmtDate(freshnessData.checked_at)}`
              : 'Afventer friskhedsdata'}
          </SectionMeta>
        </SectionHeader>

        <SummaryGrid aria-label="Opsummering af kildekontrol">
          <StatCard $tone={counts.red > 0 ? 'danger' : 'success'}>
            <div className="label">Samlet dækningsgrad</div>
            <div className="value">{isLoading ? '…' : `${counts.green}/${items.length}`}</div>
            <div className="detail">{isLoading ? 'Henter status' : `${coverage} % verificeret`}</div>
          </StatCard>
          <StatCard $tone="success">
            <div className="label">Verificeret</div>
            <div className="value">{isLoading ? '…' : counts.green}</div>
            <div className="detail">Citatet findes i den officielle kilde</div>
          </StatCard>
          <StatCard $tone={counts.red > 0 ? 'danger' : 'success'}>
            <div className="label">Kræver juridisk review</div>
            <div className="value">{isLoading ? '…' : counts.red}</div>
            <div className="detail">Skal gennemgås, før reglen godkendes</div>
          </StatCard>
          <StatCard $tone={counts.grey > 0 ? 'warning' : 'neutral'}>
            <div className="label">Ikke verificeret</div>
            <div className="value">{isLoading ? '…' : counts.grey}</div>
            <div className="detail">Mangler et entydigt kontrolresultat</div>
          </StatCard>
        </SummaryGrid>
      </SummarySection>

      <ReassessmentSection aria-labelledby="reassessment-title">
        <SectionHeader>
          <div>
            <Eyebrow>{isReassessmentsLoading ? 'Kontrollerer sager' : `${activeReassessments.length} aktive opgaver`}</Eyebrow>
            <SectionTitle id="reassessment-title">Sager påvirket af lovændringer</SectionTitle>
          </div>
          <SectionMeta>Lovversion → sagsafhængighed → dokumenteret genvurdering</SectionMeta>
        </SectionHeader>

        {isReassessmentsError ? (
          <StatePanel role="alert">
            <p>Kunne ikke hente genvurderingskøen: {String(reassessmentsError?.message || reassessmentsError)}</p>
            <SecondaryButton type="button" onClick={() => refetchReassessments()}>Prøv igen</SecondaryButton>
          </StatePanel>
        ) : null}

        {!isReassessmentsError && !isReassessmentsLoading && activeReassessments.length === 0 ? (
          <StatePanel role="status">
            <p>Ingen eksisterende sager afventer genvurdering. Hvis en overvåget kildes checksum ændres, opretter S.H.I.E.L.D. automatisk en opgave på alle sager, der bygger på kilden.</p>
          </StatePanel>
        ) : null}

        {activeReassessments.length ? (
          <ReassessmentGrid>
            {activeReassessments.map((item) => {
              const source = item.source || {};
              const caseRecord = item.case || {};
              const note = resolutionNotes[item.id] || '';
              const isUpdatingThis = reassessmentMutation.isLoading && reassessmentMutation.variables?.id === item.id;
              return (
                <ReassessmentCard key={item.id}>
                  <div>
                    <RuleKicker>{item.status === 'in_progress' ? 'Under genvurdering' : 'Ny genvurdering'}</RuleKicker>
                    <h3>{caseRecord.title || caseRecord.case_id || 'Berørt kommunal sag'}</h3>
                  </div>
                  <p>{item.reason}</p>
                  <dl>
                    <div><dt>Retskilde</dt><dd>{source.title || source.source_key || 'Overvåget kilde'}</dd></div>
                    <div><dt>Myndighed</dt><dd>{source.authority || 'Ikke registreret'}</dd></div>
                    <div><dt>Ansvarlig</dt><dd>{item.assigned_to || caseRecord.assigned_to || 'Ikke tildelt'}</dd></div>
                    <div><dt>Frist</dt><dd>{fmtDate(item.due_at, true)}</dd></div>
                  </dl>
                  {source.source_url ? <SourceLink href={source.source_url} target="_blank" rel="noreferrer noopener"><span className="source-name">Se den officielle kilde ↗</span><span className="source-domain">{sourceDetails(source.source_url)?.domain}</span></SourceLink> : null}
                  <Link className="case-link" to={`/sager/${encodeURIComponent(item.case_db_id)}`}>Gå til samlet sag →</Link>

                  {item.status === 'open' ? (
                    <SecondaryButton type="button" disabled={isUpdatingThis} onClick={() => reassessmentMutation.mutate({ id: item.id, status: 'in_progress' })}>
                      {isUpdatingThis ? 'Tildeler…' : 'Tag opgaven i behandling'}
                    </SecondaryButton>
                  ) : (
                    <ResolutionForm onSubmit={(event) => {
                      event.preventDefault();
                      reassessmentMutation.mutate({ id: item.id, status: 'completed', resolutionNote: note });
                    }}>
                      <label htmlFor={`reassessment-note-${item.id}`}>Konklusion og udførte ændringer</label>
                      <textarea id={`reassessment-note-${item.id}`} value={note} onChange={(event) => setResolutionNotes((current) => ({ ...current, [item.id]: event.target.value }))} minLength={20} required placeholder="Beskriv hvad der er kontrolleret, hvilken vurdering der er opdateret, og hvorfor sagen fortsat kan godkendes eller skal ændres…" />
                      <small>Mindst 20 tegn. Afslutningen opdaterer sagens låste lovversionsreference.</small>
                      <PrimaryButton type="submit" disabled={isUpdatingThis || note.trim().length < 20}>{isUpdatingThis ? 'Afslutter…' : 'Afslut genvurdering'}</PrimaryButton>
                    </ResolutionForm>
                  )}
                </ReassessmentCard>
              );
            })}
          </ReassessmentGrid>
        ) : null}

        {reassessmentMutation.isError ? <Notice role="alert">Genvurderingen kunne ikke opdateres: {String(reassessmentMutation.error?.response?.data?.detail || reassessmentMutation.error?.message)}</Notice> : null}
      </ReassessmentSection>

      <RulesSection aria-labelledby="rules-title">
        <SectionHeader>
          <div>
            <Eyebrow>{isLoading ? 'Regelkatalog' : `${items.length} regler`}</Eyebrow>
            <SectionTitle id="rules-title">Regler og officielle kilder</SectionTitle>
          </div>
          <SectionMeta>Alle datoer og kontrolfelter vises på mobil</SectionMeta>
        </SectionHeader>

        {isRulesError && (
          <Notice role="status">
            Regelkataloget kunne ikke hentes. Friskhedsstatus vises fortsat med
            læsbare fallback-navne og de kilder, der er gemt i kontrolloggen.
          </Notice>
        )}

        {isError && (
          <StatePanel role="alert">
            <p>Kunne ikke hente lovovervågningens status: {String(error?.message || error)}</p>
            <SecondaryButton type="button" onClick={() => refetch()}>
              Prøv at hente status igen
            </SecondaryButton>
          </StatePanel>
        )}

        {!isError && items.length === 0 && (
          <StatePanel role="status" aria-live="polite">
            {isLoading
              ? 'Henter status fra lovovervågningen…'
              : 'Verifikationen er endnu ikke kørt. Brug den manuelle kontrol ovenfor for at oprette første resultat.'}
          </StatePanel>
        )}

        {items.length > 0 && (
          <RuleList id="law-status-list" aria-busy={isLoading}>
            {items.map((item) => {
              const state = stateOf(item);
              const copy = STATUS_COPY[state];
              const catalogRule = rulesById.get(item.rule_id);
              const sourceUrl = catalogRule?.kilde?.url || item.source_url;
              const source = sourceDetails(sourceUrl);
              const ruleParts = item.rule_id.split('.');
              const law = catalogRule?.kilde?.lov || FALLBACK_LAWS[ruleParts[0]] || 'Retsgrundlag';
              const article = catalogRule?.kilde?.artikel || fallbackArticle(item.rule_id);
              const title = RULE_TITLES[item.rule_id] || humanizeRuleId(item.rule_id);
              const headingId = `rule-${item.rule_id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
              const message = item.error_message
                || (item.snippet?.startsWith('Delvis match') ? item.snippet : null);

              return (
                <RuleCard key={item.rule_id} aria-labelledby={headingId}>
                  <RuleIdentity>
                    <StatusRail $state={state} aria-hidden="true" />
                    <div>
                      <RuleKicker>{law} · {article}</RuleKicker>
                      <RuleTitle id={headingId}>{title}</RuleTitle>
                      <RuleTechnicalId>{item.rule_id}</RuleTechnicalId>

                      {source && (
                        <SourceLink
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Åbn ${source.name}, den officielle kilde til ${title}, i en ny fane`}
                        >
                          <span className="source-name">{source.name} ↗</span>
                          <span className="source-domain">{source.domain}</span>
                        </SourceLink>
                      )}

                      {message && (
                        <RuleMessage $state={state}>
                          <strong>Kontrolbemærkning</strong>
                          {message}
                        </RuleMessage>
                      )}
                    </div>
                  </RuleIdentity>

                  <DetailGrid>
                    <Detail>
                      <dt>Status</dt>
                      <dd>
                        <StatusBadge $state={state}>
                          <span className="symbol" aria-hidden="true">{copy.symbol}</span>
                          {copy.label}
                        </StatusBadge>
                      </dd>
                    </Detail>
                    <Detail>
                      <dt>Senest kontrolleret</dt>
                      <dd>
                        {item.last_checked_at ? (
                          <time dateTime={item.last_checked_at}>{fmtDate(item.last_checked_at)}</time>
                        ) : 'Ikke registreret'}
                      </dd>
                    </Detail>
                    <Detail>
                      <dt>Kontrolmetode</dt>
                      <dd>{verificationMethod(item.verification_method)}</dd>
                    </Detail>
                    <Detail>
                      <dt>HTTP-svar fra kilden</dt>
                      <dd className="mono">
                        {item.http_status ? `${item.http_status} · kilde tilgængelig` : 'Intet svar registreret'}
                      </dd>
                    </Detail>
                    <Detail>
                      <dt>Katalogets verifikationsdato</dt>
                      <dd>
                        {catalogRule?.kilde?.sidst_verificeret ? (
                          <time dateTime={catalogRule.kilde.sidst_verificeret}>
                            {fmtDate(catalogRule.kilde.sidst_verificeret, true)}
                          </time>
                        ) : 'Ikke tilgængelig'}
                      </dd>
                    </Detail>
                    <Detail>
                      <dt>Kontrolresultat</dt>
                      <dd>{copy.description}</dd>
                    </Detail>
                  </DetailGrid>
                </RuleCard>
              );
            })}
          </RuleList>
        )}
      </RulesSection>
    </Page>
  );
};

export default LovOvervaagningPage;
