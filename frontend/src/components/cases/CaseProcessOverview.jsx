import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';

export const CASE_STAGES = [
  { id: 'kladde', label: 'Kladde', hint: 'Saml grundlaget' },
  { id: 'vurderet', label: 'Vurderet', hint: 'Gennemgå vurderingen' },
  { id: 'remediation', label: 'Afklaring', hint: 'Afklar krav og tiltag' },
  { id: 'godkendt', label: 'Godkendt', hint: 'Klar til ibrugtagning' },
  { id: 'idriftsat', label: 'Idriftsat', hint: 'Følg op på løsningen' },
  { id: 'arkiveret', label: 'Arkiveret', hint: 'Find tidligere sager' },
];

const Process = styled.section`
  min-width: 0;
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, a:focus-visible, input:focus-visible, summary:focus-visible {
    outline: 2px solid ${p => p.theme.colors.primary};
    outline-offset: 3px;
  }
`;

const Stages = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 24px;
  @media (max-width: 980px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 520px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const Stage = styled.button`
  min-width: 0;
  text-align: left;
  padding: 17px 15px;
  color: ${p => p.theme.colors.ink};
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadiusLarge};
  box-shadow: ${p => p.theme.shadows.sm};
  overflow-wrap: anywhere;
  &[aria-pressed='true'] {
    border-color: ${p => p.theme.colors.primary};
    background: ${p => p.theme.colors.primarySoft};
    box-shadow: inset 0 0 0 1px ${p => p.theme.colors.primary};
  }
  &:hover { border-color: ${p => p.theme.colors.primary}; }
  .stage-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .stage-index { font: 0.65rem ${p => p.theme.fonts.mono}; color: ${p => p.theme.colors.inkSoft}; }
  strong { font-size: 1.45rem; font-weight: 550; line-height: 1; }
  .stage-name { display: inline-flex; align-items: center; gap: 7px; font-size: 0.85rem; font-weight: 600; }
  .stage-hint { display: block; margin-top: 11px; font-size: 0.7rem; line-height: 1.4; color: ${p => p.theme.colors.inkSoft}; }
  @media (max-width: 360px) { .stage-index { display: none; } }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 18px;
`;

const Search = styled.label`
  display: block;
  flex: 1 1 260px;
  max-width: 460px;
  min-width: 0;
  span { display: block; font-size: 0.76rem; font-weight: 600; margin-bottom: 7px; }
  input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 11px 13px;
    border: 1px solid ${p => p.theme.colors.line};
    border-radius: ${p => p.theme.borderRadius};
    min-height: 44px;
    background: ${p => p.theme.colors.surface};
    color: ${p => p.theme.colors.ink};
    font-size: 0.85rem;
  }
  @media (max-width: 600px) { max-width: none; }
`;

const Mode = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadius};
  background: ${p => p.theme.colors.paperSoft};
  padding: 4px;
  button {
    display: inline-flex; align-items: center; gap: 7px;
    min-height: 40px;
    padding: 9px 12px;
    border: 0;
    border-radius: ${p => p.theme.borderRadius};
    font-size: 0.78rem;
    color: ${p => p.theme.colors.inkSoft};
    background: transparent;
  }
  button[aria-pressed='true'] { background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.primary}; box-shadow: ${p => p.theme.shadows.sm}; font-weight: 600; }
  svg { width: 15px; height: 15px; flex-shrink: 0; }
`;

const Results = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  font-size: 0.78rem;
  color: ${p => p.theme.colors.inkSoft};
  > div { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
`;

const TextButton = styled.button`
  padding: 6px 0;
  background: transparent;
  border: 0;
  color: ${p => p.theme.colors.primary};
  text-decoration: underline;
  text-underline-offset: 4px;
  font-size: 0.78rem !important;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  min-width: 0;
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadiusLarge};
  background: ${p => p.theme.colors.surface};
  box-shadow: ${p => p.theme.shadows.sm};
`;

const Row = styled.li`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 155px 135px;
  gap: 20px 26px;
  align-items: start;
  padding: 23px 18px;
  background: ${p => p.theme.colors.surface};
  border-bottom: 1px solid ${p => p.theme.colors.lineSoft};
  &:first-child { border-top-left-radius: ${p => p.theme.borderRadiusLarge}; border-top-right-radius: ${p => p.theme.borderRadiusLarge}; }
  &:last-child { border-bottom: 0; border-bottom-left-radius: ${p => p.theme.borderRadiusLarge}; border-bottom-right-radius: ${p => p.theme.borderRadiusLarge}; }
  > * { min-width: 0; overflow-wrap: anywhere; }
  &:hover { background: ${p => p.theme.colors.paperSoft}; }
  @media (max-width: 700px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 20px 14px;
    gap: 17px;
    > :first-child { grid-column: 1 / -1; }
  }
`;

const CaseId = styled.div`
  font: 0.67rem/1.5 ${p => p.theme.fonts.mono};
  color: ${p => p.theme.colors.inkSoft};
  margin-bottom: 6px;
  overflow-wrap: anywhere;
`;

const CaseLink = styled(Link)`
  color: ${p => p.theme.colors.ink};
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.45;
  text-decoration: none;
  overflow-wrap: anywhere;
  hyphens: auto;
  &:hover { color: ${p => p.theme.colors.primary}; text-decoration: underline; text-underline-offset: 3px; }
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px 16px;
  margin-top: 9px;
  color: ${p => p.theme.colors.inkSoft};
  font-size: 0.74rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const StageLabel = styled.span`
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  &::before { content: ''; width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: ${p => p.theme.colors.secondary}; }
`;

const Cell = styled.div`
  font-size: 0.78rem;
  line-height: 1.5;
  color: ${p => p.theme.colors.ink};
  > small { display: block; margin-bottom: 8px; font-size: 0.68rem; color: ${p => p.theme.colors.inkSoft}; }
`;

const Verdict = styled.span`
  display: inline-block;
  max-width: 100%;
  box-sizing: border-box;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.5;
  padding: 4px 9px;
  border-radius: 999px;
  color: ${p => p.theme.colors[p.$tone || 'inkSoft']};
  background: ${p => p.theme.colors[p.$tone ? `${p.$tone}Soft` : 'paperSoft']};
  overflow-wrap: anywhere;
`;

const Notes = styled.details`
  margin-top: 13px;
  color: ${p => p.theme.colors.inkSoft};
  font-size: 0.8rem;
  line-height: 1.6;
  summary { cursor: pointer; width: fit-content; }
  p { margin: 10px 0 0; white-space: pre-line; overflow-wrap: anywhere; }
`;

const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  @media (max-width: 940px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 620px) { grid-template-columns: minmax(0, 1fr); }
`;

const Column = styled.section`
  min-width: 0;
  border: 1px solid ${p => p.$dragOver ? p.theme.colors.primary : p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadiusLarge};
  background: ${p => p.$dragOver ? p.theme.colors.primarySoft : p.theme.colors.paperSoft};
  padding: 0 12px 12px;
  box-shadow: ${p => p.$dragOver ? `inset 0 0 0 1px ${p.theme.colors.primary}` : 'none'};
  > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 4px; }
  h3 { margin: 0; font-size: 0.85rem; font-weight: 600; }
  header span { font: 0.75rem ${p => p.theme.fonts.mono}; color: ${p => p.theme.colors.inkSoft}; }
`;

const Card = styled.article`
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 17px;
  margin-bottom: 10px;
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadius};
  background: ${p => p.theme.colors.surface};
  box-shadow: ${p => p.theme.shadows.sm};
  cursor: grab;
  &:last-child { margin-bottom: 0; }
  &:active { cursor: grabbing; }
  &:hover { border-color: ${p => p.theme.colors.primary}; }
`;

const Empty = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: ${p => p.theme.colors.inkSoft};
  font-size: 0.85rem;
  line-height: 1.6;
  border-bottom: 1px solid ${p => p.theme.colors.line};
  p { margin: 0 0 8px; }
`;

function CaseVerdict({ status }) {
  const verdicts = {
    GO: ['Ingen blokeringer', 'success'],
    'BETINGET-GO': ['Kræver handling', 'warning'],
    'NO-GO': ['Blokeret', 'danger'],
  };
  const [label, tone] = verdicts[status] || [status || 'Ikke vurderet', null];
  return <Verdict $tone={tone}>{label}</Verdict>;
}

function ReviewDate({ value }) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? <time dateTime={value}>{date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
    : <span>Ikke planlagt</span>;
}

export default function CaseProcessOverview({ cases, examplesOnly, isLoading, dragOverColumn, onDragStart, onDragOver, onDragLeave, onDrop }) {
  const [stage, setStage] = useState('all');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('list');
  const counts = useMemo(() => Object.fromEntries(CASE_STAGES.map(s => [s.id, cases.filter(c => c.status === s.id).length])), [cases]);
  const visibleCases = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('da-DK');
    return cases.filter(c => (stage === 'all' || c.status === stage)
      && (!term || [c.title, c.case_id, c.assigned_to].filter(Boolean).join(' ').toLocaleLowerCase('da-DK').includes(term)));
  }, [cases, stage, query]);
  const filtered = stage !== 'all' || Boolean(query.trim());
  const reset = () => { setStage('all'); setQuery(''); };
  const title = c => examplesOnly ? c.title.replace(/^EKSEMPEL\s*[·–-]?\s*/i, '') : c.title;
  const href = c => `/sager/${c.id}${examplesOnly ? '?from=examples' : ''}`;

  return <Process aria-label="Procestrin og sager" aria-busy={isLoading}>
    <Stages role="group" aria-label="Filtrér efter procestrin">
      {CASE_STAGES.map((s, index) => <Stage key={s.id} type="button" aria-label={`${s.label}: ${counts[s.id]} sager`} aria-pressed={stage === s.id} onClick={() => setStage(current => current === s.id ? 'all' : s.id)}>
        <span className="stage-top"><span className="stage-name"><span className="stage-index">{String(index + 1).padStart(2, '0')}</span>{s.label}</span><strong>{counts[s.id]}</strong></span>
        <span className="stage-hint">{s.hint}</span>
      </Stage>)}
    </Stages>
    <Toolbar>
      <Search><span>Søg i sager</span><input type="search" value={query} placeholder="Sagsnavn, sagsnummer eller ansvarlig" onChange={event => setQuery(event.target.value)} /></Search>
      {!examplesOnly && <Mode role="group" aria-label="Visning af sager">
        <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M1 3h14M1 8h14M1 13h14" /></svg>Sagsliste</button>
        <button type="button" aria-pressed={mode === 'board'} onClick={() => setMode('board')}><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M1 2h4v12H1zM6 2h4v12H6zM11 2h4v12h-4z" /></svg>Procestavle</button>
      </Mode>}
    </Toolbar>
    <Results>
      <div>
        <TextButton type="button" aria-pressed={stage === 'all'} aria-label={`Alle trin: ${cases.length} sager`} onClick={() => setStage('all')}>Alle trin</TextButton>
        <span role="status">{isLoading ? 'Henter sager…' : `${visibleCases.length} af ${cases.length} sager${stage === 'all' ? '' : ` · ${CASE_STAGES.find(s => s.id === stage)?.label}`}`}</span>
      </div>
      {filtered && <TextButton type="button" onClick={reset}>Nulstil filtre</TextButton>}
      {mode === 'board' && !examplesOnly && <span>Træk en sag til et andet trin for at skifte status.</span>}
    </Results>

    {mode === 'list' || examplesOnly ? <>
      <List aria-label={examplesOnly ? 'Fiktive eksempelsager' : 'Kommunens arbejdssager'}>
        {visibleCases.map(c => <Row key={c.id}>
          <div>
            <CaseId>{c.case_id || 'Sagsnummer ikke angivet'}{examplesOnly && ' · Fiktivt eksempel'}</CaseId>
            <CaseLink to={href(c)}>{title(c)} →</CaseLink>
            <Meta><StageLabel>{CASE_STAGES.find(s => s.id === c.status)?.label || c.status}</StageLabel><span>{c.assigned_to || 'Ansvarlig ikke tildelt'}</span></Meta>
            {examplesOnly && <Notes><summary>Om eksemplet og kildegrundlaget</summary><p>{c.notes || 'Åbn sagen for at se kilder, testresultater, konsekvensanalyse og risikovurdering.'}</p></Notes>}
          </div>
          <Cell><small>Seneste vurdering</small><CaseVerdict status={c.last_aggregate_status} /></Cell>
          <Cell><small>Opfølgning</small><ReviewDate value={c.next_review_at} /></Cell>
        </Row>)}
      </List>
      {!visibleCases.length && !isLoading && <Empty>
        <p>{filtered ? 'Ingen sager matcher din søgning og de valgte filtre.' : examplesOnly ? 'Der er endnu ingen eksempelsager.' : 'Der er endnu ingen arbejdssager. Opret en AI-løsning for at komme i gang.'}</p>
        {filtered && <TextButton type="button" onClick={reset}>Vis alle sager</TextButton>}
      </Empty>}
    </> : <Board aria-label="Sager fordelt efter status">
      {CASE_STAGES.map(s => {
        const items = visibleCases.filter(c => c.status === s.id);
        return <Column key={s.id} aria-label={s.label} $dragOver={dragOverColumn === s.id} onDragOver={event => onDragOver(event, s.id)} onDragLeave={onDragLeave} onDrop={event => onDrop(event, s.id)}>
          <header><h3>{s.label}</h3><span>{items.length}</span></header>
          {!items.length && !isLoading && <Empty>{filtered ? 'Ingen matchende sager' : 'Ingen sager på dette trin'}</Empty>}
          {items.map(c => <Card key={c.id} draggable onDragStart={event => onDragStart(event, c.id)}>
            <CaseId>{c.case_id || 'Sagsnummer ikke angivet'}</CaseId>
            <CaseLink to={href(c)} draggable={false}>{title(c)} →</CaseLink>
            <Meta><CaseVerdict status={c.last_aggregate_status} /></Meta>
            {c.next_review_at && <Meta><span>Opfølgning · <ReviewDate value={c.next_review_at} /></span></Meta>}
          </Card>)}
        </Column>;
      })}
    </Board>}
  </Process>;
}
