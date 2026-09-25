import React, { useId, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import StructuredReportText from './StructuredReportText';

const PAGE_SIZE = 6;
const LEVELS = {
  low: { label: 'Lav', rank: 1, tone: 'success' },
  medium: { label: 'Mellem', rank: 2, tone: 'warning' },
  high: { label: 'Høj', rank: 3, tone: 'danger' },
  very_high: { label: 'Meget høj', rank: 4, tone: 'danger' },
  unknown: { label: 'Ikke angivet', rank: 0, tone: 'textMuted' },
};
const CONTROL_LABELS = {
  access_control: 'Adgangsstyring', encryption: 'Kryptering', logging: 'Logning',
  data_minimisation: 'Dataminimering', retention_deletion: 'Opbevaring og sletning',
  vendor_management: 'Leverandørstyring', human_review: 'Menneskelig kontrol',
  testing: 'Test og kvalitetssikring', incident_response: 'Beredskab', training: 'Oplæring',
};

const Panel = styled.section`
  border-radius: ${p => p.theme.borderRadiusLarge};
  scroll-margin-top: 94px;
  min-width: 0;
  margin-bottom: 24px;
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  color: ${p => p.theme.colors.text};
  font-family: ${p => p.theme.fonts.body};
  overflow-wrap: anywhere;
  h2 { margin: 0 0 10px; font-size: 1.55rem; font-weight: 630; letter-spacing: -0.035em; }
  h3, h4 { margin: 0; }
  button, select { font: inherit; }
  button:focus-visible, select:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
`;
const Intro = styled.p`
  margin: 0 0 20px;
  max-width: 74ch;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.55;
  font-size: 0.9rem;
`;
const Overview = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 18px;
  padding: 19px 0;
  margin: 0 0 22px;
  border-top: 1px solid ${p => p.theme.colors.border};
  border-bottom: 1px solid ${p => p.theme.colors.border};
  dt { color: ${p => p.theme.colors.textMuted}; font-size: 0.75rem; line-height: 1.5; }
  dd { margin: 6px 0 0; font-size: 1.5rem; font-weight: 650; letter-spacing: -0.035em; }
`;
const Filters = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  label { display: grid; gap: 6px; flex: 1 1 175px; color: ${p => p.theme.colors.textMuted}; font-size: 0.8rem; }
  select { width: 100%; min-width: 0; padding: 10px 32px 10px 10px; border: 1px solid ${p => p.theme.colors.border}; border-radius: ${p => p.theme.borderRadius}; background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.text}; }
`;
const ListNote = styled.p`
  margin: 0 0 16px;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.78rem;
  line-height: 1.55;
`;
const RiskList = styled.ol`
  list-style: none;
  padding: 0;
  margin: 0;
  border-top: 1px solid ${p => p.theme.colors.border};
  > li { padding: 18px 0; border-bottom: 1px solid ${p => p.theme.colors.border}; }
`;
const Toggle = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${p => p.theme.colors.text};
  text-align: left;
  cursor: pointer;
  strong { display: block; font-size: 1rem; line-height: 1.4; font-weight: 650; }
  small { display: block; margin: 7px 0 0; max-width: 85ch; color: ${p => p.theme.colors.textMuted}; font-size: 0.82rem; line-height: 1.5; font-weight: 400; }
  > span:first-child { min-width: 0; overflow-wrap: anywhere; }
  > span:last-child { color: ${p => p.theme.colors.primary}; font-size: 0.75rem; white-space: nowrap; line-height: 1.8; font-weight: 650; }
`;
const Metrics = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 15px 0 0;
  dt { font-size: 0.69rem; color: ${p => p.theme.colors.textMuted}; line-height: 1.4; }
  dd { margin: 5px 0 0; font-size: 0.88rem; font-weight: 630; }
  @media (max-width: 700px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;
const RiskLevel = styled.span`
  color: ${p => p.theme.colors[p.$tone] || p.theme.colors.textMuted};
`;
const AtAGlance = styled.dl`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin: 16px 0 0;
  dt { font-size: 0.74rem; font-weight: 650; line-height: 1.45; }
  dd { margin: 6px 0 0; color: ${p => p.theme.colors.textMuted}; font-size: 0.8rem; line-height: 1.55; }
  > div { min-width: 0; }
  > div:last-child { border-left: 2px solid ${p => p.theme.colors.primary}; padding-left: 13px; }
  @media (max-width: 850px) { grid-template-columns: 1fr; gap: 12px; }
`;
const ProposalLabel = styled.span`
  display: block;
  color: ${p => p.theme.colors.primary};
  font-size: 0.7rem;
  font-weight: 650;
  line-height: 1.5;
  margin-top: 7px;
`;
const Proposal = styled.section`
  border-radius: ${p => p.theme.borderRadius};
  padding: 16px;
  border-left: 3px solid ${p => p.theme.colors.primary};
  background: ${p => p.theme.colors.primarySoft};
  > span { margin: 0 0 10px; }
`;
const Flag = styled.p`
  margin: 12px 0 0;
  color: ${p => p.theme.colors.warning};
  font-size: 0.78rem;
  font-weight: 630;
`;
const Detail = styled.div`
  margin-top: 20px;
  padding: 18px 0 0 18px;
  border-top: 1px solid ${p => p.theme.colors.border};
  border-left: 3px solid ${p => p.theme.colors.primary};
  h4 { font-size: 0.84rem; margin-bottom: 7px; }
  p, li { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; font-size: 0.87rem; }
  p { margin: 0; }
  p + p, ul + p, p + ul { margin-top: 10px; }
  section { margin-bottom: 20px; }
  section:last-child { margin-bottom: 0; }
  ul { margin: 0; padding-left: 20px; }
  small { display: block; margin-top: 7px; color: ${p => p.theme.colors.textMuted}; line-height: 1.5; }
`;
const DetailMeta = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin: 0 0 20px;
  dt { color: ${p => p.theme.colors.textMuted}; font-size: 0.74rem; }
  dd { margin: 5px 0 0; font-size: 0.85rem; overflow-wrap: anywhere; line-height: 1.55; }
`;
const Pagination = styled.nav`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
  > span { font-size: 0.78rem; color: ${p => p.theme.colors.textMuted}; }
  > div { display: flex; gap: 8px; }
`;
const Button = styled.button`
  padding: 9px 14px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.borderRadius};
  color: ${p => p.theme.colors.primary};
  background: transparent;
  cursor: pointer;
  font-size: 0.8rem !important;
  font-weight: 620 !important;
  &:hover:not(:disabled) { background: ${p => p.theme.colors.primarySoft}; }
  &:disabled { color: ${p => p.theme.colors.textMuted}; opacity: 0.55; cursor: default; }
`;

const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
const text = value => {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return value.text || value.label || value.name || JSON.stringify(value);
  return String(value);
};
const score = value => text(value) || '—';
const shortText = (value, maxLength = 150) => {
  const description = text(value).replace(/\s+/g, ' ').trim();
  return description.length > maxLength ? `${description.slice(0, maxLength - 1).trimEnd()}…` : description;
};
const levelKey = value => ({
  low: 'low', lav: 'low', medium: 'medium', mellem: 'medium', middel: 'medium',
  high: 'high', høj: 'high', very_high: 'very_high', 'meget høj': 'very_high',
}[text(value).toLowerCase()] || 'unknown');
const defaultRiskLabel = value => LEVELS[levelKey(value)].label;
const defaultSources = ids => asList(ids).map(text).join(' · ');
const checkMatches = (check, id) => id && (check.id === `risk:${id}` || asList(check.section_ids).includes(`risk:${id}`));

/** Read-only browsing of an existing snapshot; no scores or workflow are edited. */
export default function RiskAssessmentPanel({ risks, reviewChecks = [], sourceReferences = defaultSources, riskLabel = defaultRiskLabel }) {
  const panelId = useId();
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const [level, setLevel] = useState('all');
  const [area, setArea] = useState('all');
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState(null);
  const checks = asList(reviewChecks).filter(check => check && typeof check === 'object');
  const rows = useMemo(() => asList(risks).filter(Boolean).map((value, index) => {
    const risk = typeof value === 'string' ? { scenario: value } : value;
    return { risk, index, key: `${risk.id || 'legacy'}-${index}`, level: levelKey(risk.residual_risk), area: text(risk.area) || 'Øvrige risici' };
  }).sort((a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank || a.index - b.index), [risks]);
  const areas = [...new Set(rows.map(row => row.area))].sort((a, b) => a.localeCompare(b, 'da'));
  const highCount = rows.filter(row => LEVELS[row.level].rank >= 3).length;
  const unknownCount = rows.filter(row => row.level === 'unknown').length;
  const flaggedCount = rows.filter(({ risk }) => checks.some(check => check.requires_review && checkMatches(check, risk.id))).length;
  const filtered = rows.filter(row => (level === 'all' || (level === 'priority' ? LEVELS[row.level].rank >= 3 : row.level === level)) && (area === 'all' || row.area === area));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const resetBrowse = () => { setPage(1); setOpenKey(null); };
  const goToPage = next => {
    setPage(next);
    setOpenKey(null);
    headingRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  };
  const label = value => text(value) ? text(riskLabel(value)) || defaultRiskLabel(value) : 'Ikke angivet';

  return (
    <Panel ref={panelRef} aria-labelledby={`${panelId}-heading`}>
      <h2 ref={headingRef} tabIndex="-1" id={`${panelId}-heading`}>Risikovurdering</h2>
      <Intro>Se, hvad der kan gå galt, hvorfor det er relevant, og hvordan risikoen kan begrænses. Den højeste angivne restrisiko vises først. Åbn en risiko for at læse hele begrundelsen og kilderne.</Intro>
      <Overview aria-label="Risikooverblik">
        <div><dt>Risici i alt</dt><dd>{rows.length}</dd></div>
        <div><dt>Høj eller meget høj restrisiko</dt><dd>{highCount}</dd></div>
        <div><dt>Højeste angivne restrisiko</dt><dd>{rows.length ? LEVELS[rows[0].level].label : 'Ikke angivet'}</dd></div>
        {flaggedCount > 0 && <div><dt>Risici med JEV-opfølgning</dt><dd>{flaggedCount}</dd></div>}
      </Overview>
      {rows.length > 0 ? <>
        <Filters>
          <label htmlFor={`${panelId}-level`}>Vis efter restrisiko
            <select id={`${panelId}-level`} value={level} onChange={event => { setLevel(event.target.value); resetBrowse(); }}>
              <option value="all">Alle risikoniveauer</option>
              <option value="priority">Høj og meget høj ({highCount})</option>
              {['very_high', 'high', 'medium', 'low'].map(key => <option key={key} value={key}>{LEVELS[key].label}</option>)}
              {unknownCount > 0 && <option value="unknown">Ikke angivet ({unknownCount})</option>}
            </select>
          </label>
          <label htmlFor={`${panelId}-area`}>Område
            <select id={`${panelId}-area`} value={area} onChange={event => { setArea(event.target.value); resetBrowse(); }}>
              <option value="all">Alle områder</option>
              {areas.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </Filters>
        <ListNote>Scorerne er gemte, beregnede værdier på skalaen 1–4 og følger skabelonens 4×4-matrice. “Efter” er ikke dokumentation for, at en foranstaltning er gennemført. Forslag ændrer ikke automatisk scorer eller godkendelse.{unknownCount > 0 && ` ${unknownCount} ${unknownCount === 1 ? 'risiko mangler' : 'risici mangler'} angivet restrisiko.`}</ListNote>
        <ListNote role="status" aria-live="polite" aria-atomic="true">{filtered.length ? `Viser ${start + 1}–${start + visible.length} af ${filtered.length} risici${filtered.length !== rows.length ? ` · ${rows.length} i alt` : ''}` : 'Ingen risici matcher de valgte filtre.'}</ListNote>
        <RiskList aria-label="Risici i den gemte vurdering">
          {visible.map(({ risk, index, key, level: residualLevel, area: riskArea }) => {
            const open = openKey === key;
            const riskChecks = checks.filter(check => checkMatches(check, risk.id));
            const flags = riskChecks.filter(check => check.requires_review);
            const title = `${text(risk.id) || `Risiko ${index + 1}`} · ${riskArea}`;
            const detailsId = `${panelId}-detail-${index}`;
            const titleId = `${panelId}-risk-${index}`;
            const measures = asList(risk.measures).map(text).filter(value => value.trim());
            return <li key={key}>
              <h3><Toggle id={titleId} type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpenKey(open ? null : key)}>
                <span><strong>{title}</strong><small>Hvad kan gå galt: {shortText(risk.scenario) || 'Risikoscenariet mangler i denne version.'}</small></span>
                <span>{open ? 'Luk detaljer −' : 'Se detaljer +'}</span>
              </Toggle></h3>
              {!open && <AtAGlance aria-label={`Kort overblik for ${text(risk.id) || `risiko ${index + 1}`}`}>
                <div><dt>Hvorfor er det en risiko?</dt><dd>{shortText(risk.rationale) || 'Begrundelsen mangler i denne version.'}</dd></div>
                <div><dt>Hvem rammes – og hvordan?</dt><dd>{shortText(risk.consequences) || 'Konsekvenser for de registrerede er ikke beskrevet.'}</dd></div>
                <div><dt>Mulig risikobegrænsning</dt><dd>{shortText(measures.join(' ')) || 'Der mangler konkrete forslag til at begrænse risikoen.'}<ProposalLabel>Forslag – ikke dokumenteret implementeret</ProposalLabel></dd></div>
              </AtAGlance>}
              <Metrics aria-label={`Risikoscorer for ${text(risk.id) || `risiko ${index + 1}`}`}>
                <div><dt>Sandsynlighed før → efter</dt><dd>{score(risk.likelihood)} → {score(risk.residual_likelihood)}</dd></div>
                <div><dt>Konsekvens før → efter</dt><dd>{score(risk.impact)} → {score(risk.residual_impact)}</dd></div>
                <div><dt>Risiko før</dt><dd><RiskLevel $tone={LEVELS[levelKey(risk.inherent_risk)].tone}>{label(risk.inherent_risk)}</RiskLevel></dd></div>
                <div><dt>Restrisiko</dt><dd><RiskLevel $tone={LEVELS[residualLevel].tone}>{label(risk.residual_risk)}</RiskLevel></dd></div>
              </Metrics>
              {flags.length > 0 && <Flag>JEV: {flags.length === 1 ? '1 kontrolpunkt kræver' : `${flags.length} kontrolpunkter kræver`} opfølgning.</Flag>}
              {open && <Detail id={detailsId} role="region" aria-labelledby={titleId}>
                <section><h4>Hvad kan gå galt?</h4><StructuredReportText text={text(risk.scenario) || 'Risikoscenariet er ikke beskrevet i denne version.'} /></section>
                <section><h4>Hvorfor er det en risiko?</h4><StructuredReportText text={text(risk.rationale) || 'Begrundelsen mangler i denne version. Det er derfor ikke beskrevet, hvorfor risikoen er relevant, eller hvad scorerne bygger på.'} /></section>
                <section><h4>Hvem rammes – og hvad er konsekvensen?</h4><StructuredReportText text={text(risk.consequences) || 'Konsekvenser for de registrerede er ikke beskrevet. De berørte personer og mulige følger skal afklares.'} /></section>
                <Proposal>
                  <h4>Forslag til risikobegrænsning</h4>
                  <ProposalLabel>Forslag – ikke dokumenteret implementeret</ProposalLabel>
                  {measures.length > 1 ? <ul>{measures.map((measure, measureIndex) => <li key={measureIndex}><StructuredReportText text={measure} /></li>)}</ul> : measures.length === 1 ? <StructuredReportText text={measures[0]} /> : <p>Der mangler konkrete forslag til at begrænse risikoen.</p>}
                  <small>Den ansvarlige skal vurdere forslagenes relevans, dokumentere gennemførelsen og kontrollere effekten. Forslagene er ikke en godkendelse.</small>
                </Proposal>
                <section><h4>Gemte risikoscorer før og efter</h4><DetailMeta>
                  <div><dt>Sandsynlighed før</dt><dd>{score(risk.likelihood)}</dd></div>
                  <div><dt>Konsekvens før</dt><dd>{score(risk.impact)}</dd></div>
                  <div><dt>Sandsynlighed efter</dt><dd>{score(risk.residual_likelihood)}</dd></div>
                  <div><dt>Konsekvens efter</dt><dd>{score(risk.residual_impact)}</dd></div>
                </DetailMeta></section>
                {asList(risk.controls).length > 0 && <section><h4>Tilknyttede kontroller</h4><ul>{asList(risk.controls).map((control, controlIndex) => <li key={controlIndex}>{CONTROL_LABELS[text(control)] || text(control)}</li>)}</ul></section>}
                <DetailMeta>
                  <div><dt>Ejer</dt><dd>{text(risk.owner) || 'Ikke angivet'}</dd></div>
                  <div><dt>Status</dt><dd>{risk.implementation_status === 'requires_verification' ? 'Implementering skal verificeres' : text(risk.implementation_status) || 'Ikke dokumenteret'}</dd></div>
                  <div><dt>Frist</dt><dd>{text(risk.due_date) || 'Ikke fastlagt'}</dd></div>
                </DetailMeta>
                {riskChecks.length > 0 && <section><h4>JEV-kontrol</h4><ul>{riskChecks.map((check, checkIndex) => <li key={check.id || checkIndex}><strong>{text(check.label) || 'Kontrolpunkt'}</strong> · {check.requires_review ? 'Kræver opfølgning' : 'Ingen bemærkning fra JEV'}</li>)}</ul><small>Kvalitetstjekket erstatter ikke faglig gennemgang.</small></section>}
                {asList(risk.source_ids).length > 0 && <section><h4>Kildehenvisninger</h4><p>{sourceReferences(asList(risk.source_ids))}</p></section>}
              </Detail>}
            </li>;
          })}
        </RiskList>
        {!filtered.length && <Button type="button" onClick={() => { setLevel('all'); setArea('all'); resetBrowse(); }}>Vis alle risici</Button>}
        {pages > 1 && <Pagination aria-label="Sider med risici">
          <span>Side {currentPage} af {pages}</span>
          <div><Button type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} aria-label="Forrige side med risici">← Forrige</Button><Button type="button" disabled={currentPage === pages} onClick={() => goToPage(currentPage + 1)} aria-label="Næste side med risici">Næste →</Button></div>
        </Pagination>}
      </> : <p>Ingen særskilte risici er gemt i denne version.</p>}
    </Panel>
  );
}
