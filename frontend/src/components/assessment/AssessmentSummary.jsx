import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import StructuredReportText from './StructuredReportText';

const Panel = styled.section`
  margin: 26px 0;
  padding: clamp(18px, 3vw, 28px);
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadiusLarge};
  min-width: 0;
  overflow-wrap: anywhere;
  h2 { margin: 0 0 10px; font-size: 1.5rem; }
  h3 { font-size: 0.98rem; margin: 0 0 10px; }
  p, li { font-size: 0.87rem; line-height: 1.6; }
  ul, ol { padding-left: 20px; }
  li { margin: 8px 0; }
  details { margin-top: 14px; }
  summary { cursor: pointer; font-size: 0.85rem; font-weight: 600; }
  summary:focus-visible { outline: 2px solid ${p => p.theme.colors.primary}; outline-offset: 4px; }
  a { color: ${p => p.theme.colors.primary}; }
`;

const Conclusion = styled.p`
  color: ${p => p.$blocked ? p.theme.colors.danger : p.theme.colors.ink};
  font-size: 1.05rem !important;
  font-weight: 600;
  margin: 0 0 20px;
`;

const Facts = styled.div`
  border-radius: ${p => p.theme.borderRadius};
  overflow: hidden;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  border: 1px solid ${p => p.theme.colors.line};
  margin-bottom: 24px;
  > section { padding: 16px; min-width: 0; border-right: 1px solid ${p => p.theme.colors.line}; }
  > section:last-child { border: 0; }
  small { display: block; font-size: 0.72rem; color: ${p => p.theme.colors.inkSoft}; margin-bottom: 8px; }
  strong { display: block; font-size: 0.9rem; line-height: 1.5; }
  a { display: inline-block; margin-top: 8px; font-size: 0.76rem; }
  @media (max-width: 700px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > section:first-child { grid-column: 1 / -1; border-right: 0; border-bottom: 1px solid ${p => p.theme.colors.line}; }
  }
`;

const Findings = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 26px;
  > section { min-width: 0; }
  @media (max-width: 740px) { grid-template-columns: minmax(0, 1fr); gap: 20px; }
`;

const Note = styled.p`
  color: ${p => p.theme.colors.inkSoft};
  font-size: 0.77rem !important;
  line-height: 1.6;
`;

const Advice = styled.section`
  border-radius: ${p => p.theme.borderRadiusLarge};
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid ${p => p.theme.colors.line};
  border-left: 4px solid ${p => p.theme.colors.secondary};
  background: ${p => p.theme.colors.surface};
  min-width: 0;
  overflow-wrap: anywhere;
  h2 { margin: 0 0 12px; font-size: 1.4rem; }
  h3 { margin: 5px 0 12px; font-size: 1.05rem; }
  article { padding: 23px 0; border-top: 1px solid ${p => p.theme.colors.line}; }
  article:last-child { padding-bottom: 0; }
  p { font-size: 0.86rem; line-height: 1.65; }
  .proposal-tag { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: ${p => p.theme.colors.secondary}; font-weight: 700; }
  .advice-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 28px; margin-top: 16px; }
  .advice-fields > div { min-width: 0; }
  .advice-fields strong { display: block; font-size: 0.78rem; margin-bottom: 5px; }
  @media (max-width: 700px) { .advice-fields { grid-template-columns: minmax(0, 1fr); } }
`;

const list = value => Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.trim()) : [];
const unique = value => [...new Set(list(value))];

export function summaryGuide(result) {
  if (result.reading_guide) return result.reading_guide;
  const blockers = unique(result.blockers);
  const missing = unique(result.missing_information).filter(item => !blockers.includes(item));
  return {
    conclusion: blockers.length || result.status === 'blocked' ? 'Kan ikke godkendes på det foreliggende grundlag' : result.status === 'ready_for_review' ? 'Klar til faglig gennemgang – ikke automatisk godkendt' : 'Kræver faglig gennemgang og afklaring',
    approval: { status: 'unknown', label: 'Godkendelse fremgår ikke af denne rapportversion', items: [] },
    blockers, missing_information: missing, open_questions: unique(result.open_questions), next_steps: unique(result.next_steps),
    documented_controls: [], recommendations: result.recommendations || [], recommendation_origin: 'saved',
  };
}

function FindingsList({ items, empty, limit = 3 }) {
  const values = list(items);
  const finding = value => {
    if (value.length <= 240) return value;
    const lead = value.split(/:\s/)[0];
    const preview = lead.length < 210 ? lead : `${value.slice(0, 190).replace(/\s+\S*$/, '')}…`;
    return <details><summary>{preview}</summary><StructuredReportText text={value} /></details>;
  };
  return values.length ? <>
    <ul>{values.slice(0, limit).map((value, index) => <li key={index}>{finding(value)}</li>)}</ul>
    {values.length > limit && <details><summary>{values.length - limit === 1 ? 'Se det sidste punkt' : `Se de øvrige ${values.length - limit} punkter`}</summary><ul>{values.slice(limit).map((value, index) => <li key={index}>{finding(value)}</li>)}</ul></details>}
  </> : <Note>{empty}</Note>;
}

export default function AssessmentSummary({ result, caseDbId, onFollowup }) {
  const guide = summaryGuide(result);
  const controls = guide.documented_controls || [];
  const missing = unique([...(guide.missing_information || []), ...(guide.open_questions || [])]);
  return <Panel aria-label="Vurderingsresumé">
    <h2>Vurderingsresumé</h2>
    <Conclusion $blocked={guide.blockers?.length > 0 || result.status === 'blocked'}>{guide.conclusion}</Conclusion>
    <Facts>
      <section><small>Menneskelig godkendelse</small><strong>{guide.approval?.label || 'Godkendelse skal afklares'}</strong>{caseDbId && <Link to={`/sager/${caseDbId}?tab=approvals`}>Se beslutninger og vilkår på sagen →</Link>}</section>
      <section><small>Blokerende forhold</small><strong>{list(guide.blockers).length}</strong><Note>Skal håndteres før godkendelse</Note></section>
      <section><small>Kontroller med indsendt evidens</small><strong>{controls.length}</strong><Note>Evidens er ikke en godkendelse</Note></section>
    </Facts>
    {(guide.approval?.items || []).map(item => <details key={item.id}>
      <summary>Registreret beslutning · {item.decided_by || 'Afventer beslutningstager'}</summary>
      <Note>{item.decided_at ? new Date(item.decided_at).toLocaleString('da-DK') : 'Ingen beslutningsdato'}. {!item.is_identity_verified && 'Beslutningstagerens identitet er ikke verificeret.'}</Note>
      <StructuredReportText text={item.reason || 'Ingen begrundelse registreret endnu.'} />
      {list(item.conditions).length > 0 && <><h3>Vilkår for godkendelsen</h3><FindingsList items={item.conditions} /></>}
    </details>)}
    <Findings>
      <section><h3>Mangler før godkendelse</h3><FindingsList items={guide.blockers} empty="Ingen særskilte blokeringer registreret. Det er ikke i sig selv en godkendelse." /></section>
      <section><h3>Skal afklares og dokumenteres</h3><FindingsList items={missing} empty="Ingen yderligere afklaringer registreret i denne version. Faglig gennemgang kræves fortsat." /></section>
    </Findings>
    {list(guide.next_steps).length > 0 && <details><summary>Vejen frem mod godkendelse</summary><ol>{list(guide.next_steps).map((step, index) => <li key={index}>{step}</li>)}</ol><Note>Afklaringer, dokumenteret implementering og en ny faglig beslutning kræves; forslag alene lukker ikke et punkt.</Note></details>}
    {controls.length > 0 && <details><summary>Se kontroller med indsendt evidens ({controls.length})</summary>{controls.map((control, index) => <section key={index}><h3>{control.title}</h3><StructuredReportText text={control.evidence} /></section>)}</details>}
    <details><summary>Læs vurderingens resumé</summary><StructuredReportText text={result.executive_summary || 'Der er ikke gemt en sammenfatning i denne version.'} /></details>
    {onFollowup && <Note><button type="button" onClick={onFollowup} style={{ border: 0, padding: 0, background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Se alle afklaringer og næste skridt →</button></Note>}
  </Panel>;
}

export function AssessmentRecommendations({ result, sourceReferences = ids => ids.join(' · ') }) {
  const guide = summaryGuide(result);
  const items = guide.recommendations || [];
  return <Advice aria-label="Anbefalinger – adskilt fra vurderingen">
    <h2>Anbefalinger til næste skridt</h2>
    <p>Forslag til faglig drøftelse. De er adskilt fra vurderingens konklusion, dokumenterer ikke implementering og ændrer ikke risikoscorer eller godkendelsesstatus.</p>
    <Note>{guide.recommendation_origin === 'rule_based'
      ? 'Vejledende systemforslag ud fra sagens gemte oplysninger. De er ikke en del af den historiske AI-tekst eller dens JEV-kontrol.'
      : 'Forslag fra den gemte rapportversion. Faglig gennemgang af relevans, mulighed og effekt er nødvendig.'}</Note>
    {items.length ? items.map((item, index) => <article key={item.id || index}>
      <span className="proposal-tag">Anbefaling · ikke besluttet</span>
      <h3>{item.title}</h3>
      <StructuredReportText text={item.proposal} />
      <div className="advice-fields">
        <div><strong>Hvorfor undersøge det?</strong><StructuredReportText text={item.rationale} /></div>
        <div><strong>Forudsætninger og begrænsninger</strong><StructuredReportText text={item.prerequisites} /></div>
        <div><strong>Sådan kan effekten dokumenteres</strong><StructuredReportText text={item.verification} /></div>
      </div>
      {list(item.source_ids).length > 0 && <Note>Grundlag for forslaget: {sourceReferences(item.source_ids)}</Note>}
      {list(result.editorial_revision?.stale_check_ids).includes(`recommendation:${item.id}`) && <Note>Kræver nyt kvalitetstjek: rapportteksten er ændret, og den tidligere JEV-kontrol dækker ikke anbefalingens relevans i den nye version.</Note>}
    </article>) : <p>Der er ikke gemt særskilte anbefalinger til denne version. Mulige risikobegrænsende foranstaltninger fremgår af risikovurderingen.</p>}
  </Advice>;
}
