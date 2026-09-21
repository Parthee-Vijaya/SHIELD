import React from 'react';
import styled from 'styled-components';
import StructuredReportText from './StructuredReportText';
import { modelNote } from '../../utils/modelPresentation';

const Page = styled.section`
  min-width: 0;
  color: ${p => p.theme.colors.ink};
  overflow-wrap: anywhere;
  h2 { margin: 0 0 12px; font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.2; letter-spacing: -0.035em; }
  h3 { margin: 0 0 12px; font-size: 1.16rem; line-height: 1.35; }
  h4 { margin: 0 0 8px; font-size: 0.95rem; line-height: 1.5; }
  p, li, dd { font-size: 0.94rem; line-height: 1.65; }
  p { max-width: 78ch; }
  details { margin-top: 12px; }
  summary { width: fit-content; max-width: 100%; cursor: pointer; font-size: 0.85rem; line-height: 1.6; font-weight: 600; }
  summary:focus-visible, button:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 4px; }
`;
const Introduction = styled.header`
  padding: 28px 0;
  border-bottom: 1px solid ${p => p.theme.colors.line};
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
  padding: 26px 0;
  border-bottom: 1px solid ${p => p.theme.colors.line};
  min-width: 0;
  > p { margin: 0 0 14px; }
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
    additionalRisks: Array.isArray(result.additional_risks || result.ai_generation?.additional_risks) ? (result.additional_risks || result.ai_generation?.additional_risks) : [],
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

export default function ReadableAssessment({ result = {}, onOpenDetails }) {
  const view = readableAssessmentModel(result);
  const model = result.ai_generation?.model;
  const open = (id, label) => onOpenDetails && <Action type="button" onClick={() => onOpenDetails(id)}>{label} →</Action>;
  const approvals = records(view.approval.items);
  return <Page id="readable-assessment" tabIndex={-1} aria-label="Læsevenlig vurdering">
    <Introduction>
      <p>Beslutningsgrundlag · kort fortalt</p>
      <h2>Det vigtigste om vurderingen</h2>
      <Note>Et overblik fra den gemte rapportversion. Du kan åbne punkterne og gå videre til hele vurderingen.</Note>
      <Conclusion $blocked={view.blocked}>{view.conclusion}</Conclusion>
      <p>{view.explanation}</p>
      <Counts aria-label="Åbne punkter i vurderingen">
        <div><dt>Blokerer godkendelse</dt><dd>{view.blockers.length}</dd></div>
        <div><dt>Manglende oplysninger</dt><dd>{view.missing.length}</dd></div>
        <div><dt>Spørgsmål til afklaring</dt><dd>{view.questions.length}</dd></div>
      </Counts>
      {view.blocked && !view.blockers.length && <Note>Rapportens status er blokeret, men årsagen er ikke gemt som et særskilt punkt. Læs hele vurderingen, og få årsagen afklaret.</Note>}
    </Introduction>

    <Section aria-label="Beslutning om brug">
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

    {view.limitations.length > 0 && <Section aria-label="Forbehold for grundlaget">
      <h3>Forbehold for grundlaget ({view.limitations.length})</h3>
      <p>Disse forbehold beskriver begrænsninger ved materialet eller vurderingen. Tag dem med i den faglige gennemgang, også når de ikke er opført som en særskilt mangel.</p>
      <Findings items={view.limitations} name="Forbehold for grundlaget" model={model} explain={false} />
      {open('analysis', 'Se forbehold i den fulde vurdering')}
    </Section>}

    {text(result.executive_summary) && <Section aria-label="Vurderingens hovedbudskab"><h3>Hvad siger vurderingen?</h3><BriefText value={result.executive_summary} model={model} limit={520} />{open('analysis', 'Læs hele konsekvensanalysen')}</Section>}

    <Section aria-label="Blokerende forhold"><h3>Det skal håndteres før godkendelse</h3><Findings items={view.blockers} name="Blokerende forhold" model={model} empty="Der er ingen særskilte blokeringer registreret. En faglig beslutning er stadig nødvendig." /></Section>
    <Columns>
      <Section aria-label="Manglende oplysninger"><h3>Det mangler vi at vide</h3><Findings items={view.missing} name="Manglende oplysninger" model={model} empty="Ingen særskilte mangler er registreret i denne version." /></Section>
      <Section aria-label="Spørgsmål til afklaring"><h3>Det skal afklares</h3><Findings items={view.questions} name="Spørgsmål til afklaring" model={model} empty="Ingen yderligere spørgsmål er registreret i denne version." /></Section>
    </Columns>

    <Section aria-label="Næste skridt"><h3>Sådan kommer sagen videre</h3><Findings items={view.nextSteps} name="Næste skridt" ordered explain={false} model={model} empty="Der er ikke gemt en konkret handlingsplan. Aftal med de ansvarlige, hvem der følger op på punkterne, hvilken dokumentation der skal leveres, og hvornår sagen kan gennemgås igen." />{open('followup', 'Åbn opfølgning og alle afklaringer')}</Section>

    <Section aria-label="Vigtigste risici"><h3>Risici at tage stilling til</h3><p>Hvad kan gå galt for de mennesker, hvis oplysninger løsningen behandler – og hvad kan begrænse risikoen?</p>
      {view.risks.length > 0 ? <>
        <Note>Viser {Math.min(3, view.risks.length)} af {view.risks.length} risici. Høj og meget høj risiko efter foreslåede tiltag vises først; risici uden angivet niveau vises før mellem og lav. Tiltagenes effekt skal stadig dokumenteres.</Note>
        <RiskRows aria-label="Prioriterede risici">{view.risks.slice(0, 3).map((risk, index) => <li key={`${risk.id || index}-${risk.originalIndex}`}>
          <h4>{modelNote(risk.area || risk.title || `Risiko ${risk.originalIndex + 1}`, model)}</h4>
          <Note>Risiko efter foreslåede tiltag: <strong>{level(risk.residual_risk)[0]}</strong></Note>
          <BriefText value={risk.scenario || 'Det er ikke beskrevet, hvad der kan gå galt.'} model={model} />
          <dl>
            <div><dt>Hvorfor er det vigtigt?</dt><dd><BriefText value={risk.rationale || 'Begrundelsen skal dokumenteres ved den faglige gennemgang.'} model={model} />{text(risk.consequences) && <details><summary>Hvem kan blive berørt – og hvordan?</summary><StructuredReportText text={modelNote(risk.consequences, model)} /></details>}</dd></div>
            <div><dt>Forslag til at begrænse risikoen</dt><dd><BriefText value={Array.isArray(risk.measures) ? strings(risk.measures).join('\n') : risk.measures || 'Der mangler konkrete forslag til at begrænse risikoen.'} model={model} /><small>Forslag – gennemførelse og effekt er ikke dokumenteret alene ved denne tekst.</small></dd></div>
          </dl>
        </li>)}</RiskRows>
      </> : <Note>Der er ikke gemt særskilte risici i denne version. Det dokumenterer ikke, at løsningen er uden risiko.</Note>}
      {view.additionalRisks.length > 0 && <Notice><strong>{view.additionalRisks.length} supplerende {view.additionalRisks.length === 1 ? 'risiko er' : 'risici er'} beskrevet uden en særskilt beregnet score</strong><p>De skal også indgå i den faglige gennemgang.</p></Notice>}
      {open('risks', `Se alle risici og forslag${view.risks.length + view.additionalRisks.length ? ` (${view.risks.length + view.additionalRisks.length})` : ''}`)}
    </Section>

    <Section aria-label="Anbefalinger adskilt fra vurderingen"><h3>Anbefalinger til overvejelse</h3><p>Forslag til den videre dialog. De ændrer ikke vurderingen eller godkendelsen og viser ikke, at en løsning er gennemført.</p>
      {view.recommendationOrigin === 'rule_based' && <Note>Vejledende forslag ud fra sagens oplysninger. Forslagene er ikke del af rapportens tidligere JEV-kontrol.</Note>}
      {view.recommendations.length ? <List aria-label="Anbefalinger">{view.recommendations.slice(0, 3).map((item, index) => <li key={item.id || index}><h4>{modelNote(item.title || 'Anbefaling', model)}</h4><BriefText value={item.proposal} model={model} /><details><summary>Forudsætninger og dokumentation</summary><BriefText value={item.prerequisites || 'Forudsætningerne skal afklares.'} model={model} /><BriefText value={item.verification || 'Det skal aftales, hvordan effekten dokumenteres.'} model={model} /></details></li>)}</List> : <Note>Der er ikke gemt særskilte anbefalinger. Forslag til at begrænse de konkrete risici fremgår ovenfor.</Note>}
      {view.recommendations.length > 3 && <Note>Yderligere {view.recommendations.length - 3} anbefalinger findes i den fulde oversigt.</Note>}
      {open('recommendations', `Se anbefalinger med forudsætninger${view.recommendations.length ? ` (${view.recommendations.length})` : ''}`)}
    </Section>
  </Page>;
}
