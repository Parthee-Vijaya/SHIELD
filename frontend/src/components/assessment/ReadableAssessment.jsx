import React, { useState } from 'react';
import styled from 'styled-components';
import StructuredReportText from './StructuredReportText';
import { modelNote } from '../../utils/modelPresentation';
import { buildReadableTopics } from './readableTopics';

const Page = styled.section`
  min-width: 0;
  color: ${p => p.theme.colors.ink};
  overflow-wrap: anywhere;
  h2 { margin: 0 0 12px; font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.2; letter-spacing: -0.035em; }
  h3 { margin: 0 0 14px; font-size: 1.35rem; line-height: 1.3; letter-spacing: -0.02em; }
  h4 { margin: 0 0 10px; font-size: 1.12rem; line-height: 1.4; }
  h5 { margin: 0 0 10px; font-size: 1rem; line-height: 1.4; }
  p, li, dd { font-size: 0.94rem; line-height: 1.65; }
  p { max-width: 72ch; }
  details { margin-top: 12px; }
  summary { width: fit-content; max-width: 100%; cursor: pointer; font-size: 0.85rem; line-height: 1.6; font-weight: 600; }
  summary:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 4px; }
  section[id], h4[id] { scroll-margin-top: 100px; }
`;
const Introduction = styled.header`
  padding: clamp(20px, 3vw, 32px);
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadiusLarge};
  > p:first-child { margin: 0 0 10px; font-size: 0.74rem; font-weight: 650; letter-spacing: 0.06em; color: ${p => p.theme.colors.inkSoft}; text-transform: uppercase; }
`;
const Conclusion = styled.p`
  font-size: clamp(1.1rem, 2vw, 1.35rem) !important;
  font-weight: 650;
  line-height: 1.4 !important;
  color: ${p => p.$blocked ? p.theme.colors.danger : p.theme.colors.ink};
  margin: 18px 0 10px;
`;
const Note = styled.p`
  font-size: 0.82rem !important;
  color: ${p => p.theme.colors.inkSoft};
  margin: 9px 0 0;
`;
const Counts = styled.dl`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin: 24px 0 0;
  padding-top: 18px;
  border-top: 1px solid ${p => p.theme.colors.line};
  dt { color: ${p => p.theme.colors.inkSoft}; font-size: 0.77rem; line-height: 1.5; }
  dd { font-size: 1.65rem; margin: 4px 0 0; font-weight: 630; }
  @media (max-width: 440px) { gap: 10px; dt { font-size: 0.73rem; } }
`;
const Section = styled.section`
  padding: 34px 0;
  border-bottom: 1px solid ${p => p.theme.colors.line};
  min-width: 0;
  > p { margin: 0 0 14px; }
`;
const Contents = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding: 18px 0;
  border-bottom: 1px solid ${p => p.theme.colors.line};
  a { color: ${p => p.theme.colors.ink}; font-size: 0.85rem; font-weight: 600; text-underline-offset: 5px; }
`;
const TopicLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(210px, 0.8fr) minmax(0, 2.2fr);
  align-items: start;
  gap: 32px;
  margin-top: 26px;
  @media (max-width: 850px) { grid-template-columns: minmax(0, 1fr); gap: 24px; }
`;
const TopicMenu = styled.nav`
  display: grid;
  gap: 3px;
  button {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
    padding: 13px 14px;
    border-radius: ${p => p.theme.borderRadius};
    border: 0;
    border-left: 3px solid transparent;
    background: transparent;
    text-align: left;
    font: inherit;
    font-size: 0.9rem;
    line-height: 1.5;
    color: ${p => p.theme.colors.inkSoft};
    cursor: pointer;
    span { flex: 0 0 1.4em; white-space: nowrap; font-size: 0.73rem; opacity: 0.8; }
    &:hover { background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.ink}; }
    &[aria-pressed='true'] { border-left-color: ${p => p.theme.colors.primary}; background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.ink}; font-weight: 650; }
  }
  @media (max-width: 850px) { display: none; }
`;
const MobileTopics = styled.label`
  display: none;
  min-width: 0;
  font-size: 0.85rem;
  font-weight: 650;
  select { display: block; width: 100%; min-height: 48px; margin-top: 8px; padding: 10px; background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.ink}; border: 1px solid ${p => p.theme.colors.line}; font: inherit; font-weight: 400; }
  select:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
  @media (max-width: 850px) { display: block; }
`;
const TopicPanel = styled.section`
  min-width: 0;
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadiusLarge};
  padding: clamp(18px, 3vw, 30px);
  background: ${p => p.theme.colors.surface};
  > header { padding-bottom: 22px; border-bottom: 1px solid ${p => p.theme.colors.line}; }
  > header p { margin: 0; color: ${p => p.theme.colors.inkSoft}; }
  @media (max-width: 850px) { padding: 20px; }
`;
const TopicSection = styled.article`
  padding: 26px 0;
  border-bottom: 1px solid ${p => p.theme.colors.line};
  &:last-child { padding-bottom: 0; border-bottom: 0; }
`;
const SectionMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-bottom: 13px;
  font-size: 0.76rem;
  line-height: 1.5;
  color: ${p => p.theme.colors.inkSoft};
`;
const ReviewLabel = styled.span`
  padding-left: 9px;
  border-left: 2px solid ${p => p.theme.colors.warning};
`;
const Expand = styled.details`
  border-radius: ${p => p.theme.borderRadius};
  margin-top: 24px !important;
  padding: 16px 20px;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.line};
  > summary { font-size: 0.9rem; }
  &[open] > summary { margin-bottom: 22px; }
  @media (max-width: 440px) { padding: 14px; }
`;
const Advice = styled.article`
  padding: 24px 0;
  border-top: 1px solid ${p => p.theme.colors.line};
  > small { display: block; color: ${p => p.theme.colors.inkSoft}; font-size: 0.73rem; font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }
  h5 { margin-top: 22px; }
`;
const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 32px;
  border-bottom: 1px solid ${p => p.theme.colors.line};
  > section { border-bottom: 0; }
  @media (max-width: 740px) { grid-template-columns: minmax(0, 1fr); gap: 0; > section + section { padding-top: 0; } }
`;
const List = styled.ul`
  margin: 0;
  padding-left: 21px;
  > li { margin: 0 0 14px; padding-left: 3px; }
  > li:last-child { margin-bottom: 0; }
`;
const Action = styled.button`
  display: inline-block;
  padding: 10px 0;
  margin-top: 10px;
  border: 0;
  background: transparent;
  color: ${p => p.theme.colors.primary};
  font: inherit;
  font-size: 0.86rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 4px;
`;
const Notice = styled.aside`
  margin-top: 20px;
  padding: 14px 0 14px 17px;
  border-left: 3px solid ${p => p.theme.colors.warning};
  p { margin: 5px 0 0; }
`;
const RiskRows = styled.ol`
  list-style: none;
  padding: 0;
  margin: 20px 0 0;
  > li { padding: 20px 0; border-top: 1px solid ${p => p.theme.colors.line}; }
  dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; margin: 16px 0 0; }
  dt { font-size: 0.78rem; font-weight: 650; margin-bottom: 5px; }
  dd { margin: 0; }
  small { display: block; color: ${p => p.theme.colors.inkSoft}; line-height: 1.6; margin-top: 8px; }
  @media (max-width: 740px) { dl { grid-template-columns: minmax(0, 1fr); } }
`;

const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()) : [];
const unique = values => [...new Set(values)];
const records = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const riskLevels = {
  very_high: ['Meget høj', 4], 'meget høj': ['Meget høj', 4], high: ['Høj', 3], høj: ['Høj', 3],
  medium: ['Mellem', 2], mellem: ['Mellem', 2], middel: ['Mellem', 2], low: ['Lav', 1], lav: ['Lav', 1],
};
const level = value => riskLevels[text(value).toLowerCase()] || ['Ikke angivet', 2.5];
const rights = { information: 'oplysningspligt', access: 'indsigt', rectification: 'berigtigelse', erasure: 'sletning', restriction: 'begrænsning', portability: 'dataportabilitet', objection: 'indsigelse', automated_decision_review: 'menneskelig prøvelse af automatiske afgørelser' };
const rightsPrefix = 'Rettighedsprocedurer mangler for: ';
const findingLabel = value => value.startsWith(rightsPrefix)
  ? `${rightsPrefix}${value.slice(rightsPrefix.length).replace(/\.$/, '').split(',').map(key => rights[key.trim()] || key.trim()).join(', ')}.` : value;
// These exact formats are import metadata, not reservations about the evidence.
// Unknown notes remain visible, including document extraction limitations.
const isPlatformMetadata = value => /^(?:Testudkast|Udkast) udarbejdet i Codex med [^;]+; JEV-kontrol via AI Gateway\.$/i.test(value)
  || /^Model og (?:test)?kørsels-ID er (?:angivet|oplyst).*\b(?:Codex|import)/i.test(value)
  || /^Codex-forbrug er ikke tilgængeligt i denne import\.$/i.test(value);

// Explain the task behind common legal terms without deciding it for the reader.
export function findingExplanation(value) {
  const patterns = [
    [/oplyste kontroller|implementeringsevidens/i, 'Virker sikkerhedsforanstaltningerne i praksis?', 'Få dokumentation for, at de beskrevne kontroller er taget i brug og virker. En plan eller et aftalekrav er ikke det samme som en gennemført kontrol.'],
    [/rettighedsprocedure|oplysningspligt|indsigtsret/i, 'Hvordan hjælpes borgerne med deres rettigheder?', 'Aftal, hvem der informerer de berørte personer og håndterer deres henvendelser om oplysningerne.'],
    [/artikel\s*9|art\.?\s*9|følsomme oplysninger|særlige kategorier/i, 'Må følsomme oplysninger bruges til opgaven?', 'Få præciseret, hvilke følsomme oplysninger der er nødvendige, og hvilket grundlag kommunen har for at bruge dem.'],
    [/artikel\s*6|art\.?\s*6|behandlingsgrundlag|hjemmel/i, 'Hvad giver kommunen ret til at bruge oplysningerne?', 'Få beskrevet grundlaget for at bruge personoplysninger til netop denne opgave. Det skal gennemgås med de juridisk ansvarlige.'],
    [/tredjeland|uden\s*for\s*(?:EU|EØS)|udenfor\s*(?:EU|EØS)|international.*overfør/i, 'Hvor kan oplysningerne blive tilgået?', 'Afklar både, hvor data opbevares, og om andre kan få adgang fra lande uden for EU/EØS. Dokumentationen skal dække hele leverandørkæden.'],
    [/databehandleraftale/i, 'Hvad har leverandøren forpligtet sig til?', 'Få afklaret, hvad aftalen dækker, og om den passer til den konkrete brug af løsningen.'],
    [/underdatabehandler/i, 'Hvem behandler oplysningerne for leverandøren?', 'Få dokumenteret, hvilke andre virksomheder der medvirker, hvad de gør, og hvor behandlingen foregår.'],
    [/slet|opbevaringsfrist|opbevaringsperiode/i, 'Hvornår bliver oplysningerne slettet?', 'Afklar, hvilke kopier der findes, hvor længe de er nødvendige, og hvordan sletning kan dokumenteres.'],
    [/CPR/i, 'Hvordan skal CPR-numre håndteres?', 'Få afklaret, om CPR-numre er nødvendige i opgaven, og hvilket grundlag der er for at bruge dem.'],
    [/DPIA|konsekvensanalyse/i, 'Hvad betyder løsningen for de berørte personer?', 'Afklar de mulige konsekvenser, og dokumentér, hvordan de bliver håndteret i den konkrete anvendelse.'],
  ];
  const match = patterns.find(([pattern]) => pattern.test(value));
  return match ? { title: match[1], explanation: match[2] } : null;
}

// Read-only projection: no model calls, changed scores, or inferred approvals.
export function readableAssessmentModel(result = {}) {
  const guide = result.reading_guide || {};
  const combined = key => unique([...strings(guide[key]), ...strings(result[key])].map(findingLabel));
  const blockers = combined('blockers');
  const missing = combined('missing_information').filter(item => !blockers.includes(item));
  const questions = combined('open_questions').filter(item => !blockers.includes(item) && !missing.includes(item));
  const blocked = blockers.length > 0 || result.status === 'blocked';
  const requiresAction = result.status === 'requires_action' || missing.length > 0 || questions.length > 0;
  const staleIds = new Set(strings(result.editorial_revision?.stale_check_ids));
  const checks = records(result.ai_generation?.review?.checks).filter(check => !staleIds.has(check.id) && !strings(check.section_ids).some(id => staleIds.has(id)));
  const risks = (Array.isArray(result.risks) ? result.risks : []).filter(Boolean).map((risk, index) => ({
    ...(typeof risk === 'string' ? { scenario: risk } : risk), originalIndex: index,
  })).sort((a, b) => level(b.residual_risk)[1] - level(a.residual_risk)[1] || a.originalIndex - b.originalIndex);
  return {
    blockers, missing, questions, blocked, checks, risks,
    limitations: unique([...strings(result.ai_generation?.limitations), ...strings(result.limitations)]
      .filter(item => !isPlatformMetadata(item))
      .map(item => item.replace(/^Dokumentversion [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}: /i, ''))),
    flags: checks.filter(check => check.requires_review),
    nextSteps: combined('next_steps'),
    conclusion: blocked ? 'Der er forhold, som blokerer for godkendelse' : requiresAction ? 'Sagen kræver afklaring og handling' : result.status === 'ready_for_review' ? 'Vurderingen er klar til faglig gennemgang' : 'Vurderingen skal gennemgås fagligt',
    explanation: blocked ? 'De blokerende forhold nedenfor skal håndteres, før sagen kan lægges frem til godkendelse. Den ansvarlige skal dokumentere løsningerne og få vurderingen gennemgået igen.' : requiresAction ? 'Der mangler oplysninger eller handlinger, før beslutningsgrundlaget er på plads. Brug punkterne nedenfor til dialogen med leverandøren og de ansvarlige i organisationen.' : 'Den gemte vurdering kan bruges som grundlag for en samtale med de fagligt ansvarlige. Den viser ikke i sig selv, at løsningen er godkendt til brug.',
    approval: guide.approval || { status: 'unknown', label: 'Godkendelse fremgår ikke af denne rapportversion', items: [] },
    recommendations: records(guide.recommendations || result.recommendations),
    recommendationOrigin: guide.recommendation_origin,
    additionalRisks: (Array.isArray(result.additional_risks || result.ai_generation?.additional_risks) ? (result.additional_risks || result.ai_generation?.additional_risks) : [])
      .filter(item => (typeof item === 'string' && item.trim()) || (item && typeof item === 'object' && !Array.isArray(item))),
  };
}

function BriefText({ value, model, limit = 330 }) {
  const content = modelNote(text(value), model);
  if (!content) return null;
  if (content.length <= limit) return <StructuredReportText text={content} />;
  const boundary = content.slice(0, limit).lastIndexOf(' ');
  const preview = `${content.slice(0, boundary > limit / 2 ? boundary : limit).trim()}…`;
  return <><p>{preview}</p><details><summary>Læs hele punktet</summary><StructuredReportText text={content} /></details></>;
}

function Finding({ value, model, explain }) {
  const explanation = explain && findingExplanation(value);
  return <>{explanation && <h4>{explanation.title}</h4>}<BriefText value={value} model={model} />{explanation && <Note>{explanation.explanation}</Note>}</>;
}

function Findings({ items, empty, name, model, ordered = false, explain = true }) {
  if (!items.length) return <Note>{empty}</Note>;
  return <>
    <List as={ordered ? 'ol' : 'ul'} aria-label={name}>{items.slice(0, 3).map((item, index) => <li key={index}><Finding value={item} model={model} explain={explain} /></li>)}</List>
    {items.length > 3 && <details><summary>Vis alle {items.length} punkter – {items.length - 3} flere</summary><List as={ordered ? 'ol' : 'ul'} start={ordered ? 4 : undefined} aria-label={`Flere ${name.toLowerCase()}`}>{items.slice(3).map((item, index) => <li key={index}><Finding value={item} model={model} explain={explain} /></li>)}</List></details>}
  </>;
}

function TopicOverview({ result, model, onOpenDetails }) {
  const topics = buildReadableTopics(result);
  const [selected, setSelected] = useState(null);
  const active = topics.find(topic => topic.id === selected) || topics[0];
  if (!active) return null;
  return <Section id="readable-topics" aria-label="Vurderingen emne for emne">
    <h3>Vurderingen, emne for emne</h3>
    <p>Vælg det, du vil undersøge. Her er vurderingens konkrete oplysninger og forbehold samlet under hvert emne.</p>
    <Note>Oplysninger fra en aftale beskriver, hvad der er aftalt. De dokumenterer ikke i sig selv, at kravene er opfyldt i praksis.</Note>
    <TopicLayout>
      <TopicMenu aria-label="Emner i vurderingen">{topics.map((topic, index) => <button
        type="button" key={topic.id} aria-pressed={active.id === topic.id} aria-controls="readable-topic-panel"
        onClick={() => setSelected(topic.id)}
      ><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{topic.title}</button>)}</TopicMenu>
      <MobileTopics>Vælg emne<select value={active.id} onChange={event => setSelected(event.target.value)} aria-controls="readable-topic-panel">{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></MobileTopics>
      <TopicPanel id="readable-topic-panel" aria-labelledby={`readable-topic-${active.id}`}>
        <header><h4 id={`readable-topic-${active.id}`}>{active.title}</h4><p>{active.description}</p></header>
        {active.sections.map((section, index) => <TopicSection key={`${section.id}-${index}`}>
          <SectionMeta><span>{section.id ? `Rapportafsnit ${section.id}` : 'Rapportafsnit'}</span><ReviewLabel>{section.reviewLabel}</ReviewLabel></SectionMeta>
          <h5>{section.label}</h5>
          <StructuredReportText text={modelNote(section.text || 'Der er ikke gemt en beskrivelse. Oplysningerne skal indhentes og vurderes fagligt.', model)} headingLevel={6} />
          {onOpenDetails && <Action type="button" onClick={() => onOpenDetails('analysis', section.id)}>Se afsnittet og kildegrundlaget →</Action>}
        </TopicSection>)}
      </TopicPanel>
    </TopicLayout>
  </Section>;
}

function ReadableRisk({ risk, model }) {
  const implementation = {
    not_started: 'Ikke påbegyndt', planned: 'Planlagt', in_progress: 'Under gennemførelse',
    implemented: 'Registreret som gennemført', verified: 'Registreret som efterprøvet',
    requires_verification: 'Skal efterprøves', not_implemented: 'Ikke gennemført',
  }[risk.implementation_status] || 'Gennemførelse er ikke dokumenteret her';
  return <>
    <h4>{modelNote(risk.area || risk.title || `Risiko ${risk.originalIndex + 1}`, model)}</h4>
    <SectionMeta><span>Før tiltag: <strong>{level(risk.inherent_risk)[0]}</strong></span><span>Efter foreslåede tiltag: <strong>{level(risk.residual_risk)[0]}</strong></span></SectionMeta>
    <h5>Hvad kan gå galt?</h5>
    <StructuredReportText text={modelNote(risk.scenario || 'Det er ikke beskrevet, hvad der kan gå galt.', model)} headingLevel={6} />
    <dl>
      <div><dt>Hvorfor er det en risiko?</dt><dd><StructuredReportText text={modelNote(risk.rationale || 'Begrundelsen skal dokumenteres ved den faglige gennemgang.', model)} headingLevel={6} /></dd></div>
      <div><dt>Hvem kan blive berørt – og hvordan?</dt><dd><StructuredReportText text={modelNote(risk.consequences || 'Det skal præciseres, hvem der kan blive berørt, og hvad konsekvensen kan være.', model)} headingLevel={6} /></dd></div>
    </dl>
    <Notice><h5>Forslag til at begrænse risikoen</h5><StructuredReportText text={modelNote(Array.isArray(risk.measures) ? strings(risk.measures).map(item => `- ${item}`).join('\n') : risk.measures || 'Der mangler konkrete forslag til at begrænse risikoen.', model)} headingLevel={6} /><small>Forslag – gennemførelse og effekt er ikke dokumenteret alene ved denne tekst.</small></Notice>
    <dl>
      <div><dt>Ansvar og opfølgning</dt><dd>{modelNote(risk.owner || 'Ansvarlig skal aftales.', model)}{risk.due_date && <small>Frist: {risk.due_date}</small>}</dd></div>
      <div><dt>Status for tiltag</dt><dd>{implementation}</dd></div>
    </dl>
  </>;
}

function Recommendation({ item, model }) {
  return <Advice>
    <small>Anbefaling · forslag til overvejelse</small>
    <h4>{modelNote(item.title || 'Anbefaling', model)}</h4>
    <StructuredReportText text={modelNote(item.proposal, model)} headingLevel={5} />
    {text(item.rationale) && <><h5>Hvorfor overveje dette?</h5><StructuredReportText text={modelNote(item.rationale, model)} headingLevel={6} /></>}
    <h5>Hvad forudsætter det?</h5><StructuredReportText text={modelNote(item.prerequisites || 'Forudsætningerne skal afklares.', model)} headingLevel={6} />
    <h5>Hvordan følges der op?</h5><StructuredReportText text={modelNote(item.verification || 'Det skal aftales, hvordan effekten dokumenteres.', model)} headingLevel={6} />
  </Advice>;
}

export default function ReadableAssessment({ result = {}, onOpenDetails }) {
  const view = readableAssessmentModel(result);
  const model = result.ai_generation?.model;
  const open = (id, label) => onOpenDetails && <Action type="button" onClick={() => onOpenDetails(id)}>{label} →</Action>;
  const approvals = records(view.approval.items);
  return <Page id="readable-assessment" tabIndex={-1} aria-label="Læsevenlig vurdering">
    <Introduction>
      <p>Beslutningsgrundlag · kort fortalt</p>
      <h2>Det vigtigste om vurderingen</h2>
      <Note>Start med beslutningen, og gå derefter gennem oplysninger, risici og næste handling. De enkelte emner forklarer grundlaget og de forhold, der stadig er uafklarede.</Note>
      <Conclusion $blocked={view.blocked}>{view.conclusion}</Conclusion>
      <p>{view.explanation}</p>
      <Counts aria-label="Åbne punkter i vurderingen">
        <div><dt>Blokerer godkendelse</dt><dd>{view.blockers.length}</dd></div>
        <div><dt>Manglende oplysninger</dt><dd>{view.missing.length}</dd></div>
        <div><dt>Spørgsmål til afklaring</dt><dd>{view.questions.length}</dd></div>
      </Counts>
      {view.blocked && !view.blockers.length && <Note>Rapportens status er blokeret, men årsagen er ikke gemt som et særskilt punkt. Læs hele vurderingen, og få årsagen afklaret.</Note>}
    </Introduction>

    <Contents aria-label="Indhold i den læsevenlige vurdering">
      <a href="#readable-decision">Beslutning</a>
      {records(result.sections).length > 0 && <a href="#readable-topics">Oplysninger og aftaler</a>}
      <a href="#readable-blockers">Mangler og afklaringer</a>
      <a href="#readable-next-steps">Næste skridt</a>
      <a href="#readable-risks">Risici og tiltag</a>
      <a href="#readable-advice">Anbefalinger</a>
    </Contents>

    <Section id="readable-decision" aria-label="Beslutning om brug">
      <h3>Er løsningen godkendt?</h3>
      <p><strong>{modelNote(view.approval.label || 'Godkendelse skal afklares', model)}</strong></p>
      <Note>Vurderingens status og en menneskelig godkendelse er to forskellige ting. Fravær af blokeringer eller et positivt kvalitetstjek er ikke en godkendelse.</Note>
      {approvals.map((item, index) => <details key={item.id || index}><summary>Læs den registrerede beslutning{item.decided_by ? ` · ${item.decided_by}` : ''}</summary>
        <BriefText value={item.reason || 'Begrundelsen er ikke angivet.'} model={model} />
        {item.is_identity_verified !== true && <Note>Beslutningstagerens identitet er ikke verificeret.</Note>}
        {strings(item.conditions).length > 0 && <><h4>Vilkår, der skal følges</h4><Findings items={strings(item.conditions)} name="Vilkår" model={model} explain={false} /></>}
      </details>)}
      {view.flags.length > 0 && <Notice aria-label="Kvalitetstjek kræver opfølgning"><strong>{view.flags.length} {view.flags.length === 1 ? 'punkt kræver' : 'punkter kræver'} opfølgning efter JEV-kontrol</strong><p>JEV har peget på dele af teksten, der skal kontrolleres nærmere mod dokumentationen.</p>{open('analysis', 'Se kvalitetstjek og begrundelser')}</Notice>}
      {result.editorial_revision && <Notice aria-label="Rapporten er fagligt redigeret"><strong>Rapporten er fagligt redigeret</strong><p>De ændrede formuleringer skal gennemgås igen. En tidligere JEV-kontrol dækker ikke de ændrede formuleringer.</p>{open('analysis', 'Se ændringer og kontrolgrundlag')}</Notice>}
    </Section>

    <TopicOverview result={result} model={model} onOpenDetails={onOpenDetails} />

    {view.limitations.length > 0 && <Section aria-label="Forbehold for grundlaget">
      <h3>Forbehold for grundlaget ({view.limitations.length})</h3>
      <p>Disse forbehold beskriver begrænsninger ved materialet eller vurderingen. Tag dem med i den faglige gennemgang, også når de ikke er opført som en særskilt mangel.</p>
      <Findings items={view.limitations} name="Forbehold for grundlaget" model={model} explain={false} />
      {open('analysis', 'Se forbehold i den fulde vurdering')}
    </Section>}

    {text(result.executive_summary) && <Section aria-label="Vurderingens hovedbudskab"><h3>Vurderingens samlede resumé</h3><StructuredReportText text={modelNote(result.executive_summary, model)} headingLevel={4} />{open('analysis', 'Læs hele konsekvensanalysen')}</Section>}

    <Section id="readable-blockers" aria-label="Blokerende forhold"><h3>Det skal håndteres før godkendelse</h3><Findings items={view.blockers} name="Blokerende forhold" model={model} empty="Der er ingen særskilte blokeringer registreret. En faglig beslutning er stadig nødvendig." /></Section>
    <Columns>
      <Section aria-label="Manglende oplysninger"><h3>Det mangler vi at vide</h3><Findings items={view.missing} name="Manglende oplysninger" model={model} empty="Ingen særskilte mangler er registreret i denne version." /></Section>
      <Section aria-label="Spørgsmål til afklaring"><h3>Det skal afklares</h3><Findings items={view.questions} name="Spørgsmål til afklaring" model={model} empty="Ingen yderligere spørgsmål er registreret i denne version." /></Section>
    </Columns>

    <Section id="readable-next-steps" aria-label="Næste skridt"><h3>Sådan kommer sagen videre</h3><Findings items={view.nextSteps} name="Næste skridt" ordered explain={false} model={model} empty="Der er ikke gemt en konkret handlingsplan. Aftal med de ansvarlige, hvem der følger op på punkterne, hvilken dokumentation der skal leveres, og hvornår sagen kan gennemgås igen." />{open('followup', 'Åbn opfølgning og alle afklaringer')}</Section>

    <Section id="readable-risks" aria-label="Vigtigste risici"><h3>Risici at tage stilling til</h3><p>Hvad kan gå galt for de mennesker, hvis oplysninger løsningen behandler – og hvad kan begrænse risikoen?</p>
      {view.risks.length > 0 ? <>
        <Note>De første {Math.min(3, view.risks.length)} af {view.risks.length} risici vises nedenfor. Høj og meget høj risiko efter foreslåede tiltag vises først; risici uden angivet niveau vises før mellem og lav. Tiltagenes effekt skal stadig dokumenteres.</Note>
        <RiskRows aria-label="Prioriterede risici">{view.risks.slice(0, 3).map((risk, index) => <li key={`${risk.id || index}-${risk.originalIndex}`}><ReadableRisk risk={risk} model={model} /></li>)}</RiskRows>
        {view.risks.length > 3 && <Expand><summary>Læs de øvrige {view.risks.length - 3} risici her</summary><RiskRows aria-label="Øvrige risici">{view.risks.slice(3).map((risk, index) => <li key={`${risk.id || index}-${risk.originalIndex}`}><ReadableRisk risk={risk} model={model} /></li>)}</RiskRows></Expand>}
      </> : <Note>Der er ikke gemt særskilte risici i denne version. Det dokumenterer ikke, at løsningen er uden risiko.</Note>}
      {view.additionalRisks.length > 0 && <Notice><strong>{view.additionalRisks.length} supplerende {view.additionalRisks.length === 1 ? 'risiko er' : 'risici er'} beskrevet uden en særskilt beregnet score</strong><p>De skal også indgå i den faglige gennemgang.</p><Expand><summary>Læs de supplerende risici</summary><RiskRows aria-label="Supplerende risici">{view.additionalRisks.map((risk, index) => <li key={risk.id || index}><ReadableRisk risk={typeof risk === 'string' ? { scenario: risk, originalIndex: index } : { ...risk, scenario: risk.scenario || risk.description || risk.text, originalIndex: index }} model={model} /></li>)}</RiskRows></Expand></Notice>}
      {open('risks', `Se alle risici og forslag${view.risks.length + view.additionalRisks.length ? ` (${view.risks.length + view.additionalRisks.length})` : ''}`)}
    </Section>

    <Section id="readable-advice" aria-label="Anbefalinger adskilt fra vurderingen"><h3>Anbefalinger til overvejelse</h3><p>Forslag til den videre dialog. De ændrer ikke vurderingen eller godkendelsen og viser ikke, at en løsning er gennemført.</p>
      {view.recommendationOrigin === 'rule_based' && <Note>Vejledende forslag ud fra sagens oplysninger. Forslagene er ikke del af rapportens tidligere JEV-kontrol.</Note>}
      {view.recommendations.length ? <div aria-label="Anbefalinger">{view.recommendations.slice(0, 3).map((item, index) => <Recommendation key={item.id || index} item={item} model={model} />)}</div> : <Note>Der er ikke gemt særskilte anbefalinger. Forslag til at begrænse de konkrete risici fremgår ovenfor.</Note>}
      {view.recommendations.length > 3 && <Expand><summary>Læs de øvrige {view.recommendations.length - 3} anbefalinger her</summary>{view.recommendations.slice(3).map((item, index) => <Recommendation key={item.id || index} item={item} model={model} />)}</Expand>}
      {open('recommendations', `Se anbefalinger med forudsætninger${view.recommendations.length ? ` (${view.recommendations.length})` : ''}`)}
    </Section>
  </Page>;
}
