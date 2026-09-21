import { modelLabel, modelNotes, modelNote } from '../../utils/modelPresentation';
import React, { useId, useMemo, useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { INPUT_SOURCE_LABELS, publicSourceUrl, sourceLabel } from '../assessment/EvidenceNavigator';
import { ErrorPanel, Field, Inset, SecondaryButton, Section, SectionHeader, StatePanel, StatusPill, TextLink } from '../workflow/WorkflowUi';

const PAGE_SIZE = 8;
const NOT_RECORDED = 'Ikke registreret';
const array = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const normalise = value => text(value).normalize('NFKC').toLocaleLowerCase('da-DK');
const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' }) : NOT_RECORDED;
const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value.toLocaleString('da-DK', { maximumFractionDigits: 3 }) : NOT_RECORDED;
const kindLabel = kind => ({ dpia_ai: 'AI-udarbejdet vurdering', dpia_rules: 'Regelbaseret vurdering', dpia_revision: 'Fagligt redigeret rapport', material_analysis: 'Analyse af leverandørmateriale' }[kind] || 'Gemt kørsel');
const count = value => Number.isInteger(value) && value >= 0 ? value.toLocaleString('da-DK') : NOT_RECORDED;

const Panel = styled.div`
  min-width: 0; padding-top: 28px; overflow-wrap: anywhere;
  h3 { margin: 0 0 10px; font-size: 1rem; }
  p { color: ${p => p.theme.colors.inkSoft}; font-size: .84rem; line-height: 1.65; }
  button, input, select, textarea { min-width: 0; max-width: 100%; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
`;
const Toolbar = styled.div`
  display: grid; grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr); align-items: end; gap: 16px; margin: 18px 0;
  > * { min-width: 0; }
  input, select { box-sizing: border-box; }
  @media (max-width: 640px) { grid-template-columns: minmax(0, 1fr); }
`;
const Metadata = styled.dl`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 26px; margin: 22px 0;
  div { min-width: 0; } dt { color: ${p => p.theme.colors.inkFaded}; font-size: .73rem; }
  dd { margin: 5px 0 0; font-size: .85rem; line-height: 1.5; white-space: pre-wrap; }
  @media (max-width: 740px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 460px) { grid-template-columns: minmax(0, 1fr); }
`;
const Steps = styled.ol`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin: 24px 0; padding: 0; list-style: none; border-top: 1px solid ${p => p.theme.colors.line};
  li { min-width: 0; padding: 18px 16px 10px 0; }
  strong { display: block; font-size: .86rem; line-height: 1.5; }
  p { margin: 7px 0; font-size: .78rem; }
  @media (max-width: 840px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 460px) { grid-template-columns: minmax(0, 1fr); }
`;
const Details = styled.details`
  min-width: 0; border-bottom: 1px solid ${p => p.theme.colors.line}; padding: 14px 0;
  > summary { cursor: pointer; font-size: .85rem; line-height: 1.6; }
  > summary strong { font-weight: 620; }
  > summary span { margin-left: 8px; vertical-align: middle; }
  &[open] > summary { margin-bottom: 14px; }
`;
const Excerpt = styled.blockquote`
  margin: 12px 0; padding: 14px 16px; border-left: 3px solid ${p => p.theme.colors.secondary};
  background: ${p => p.theme.colors.paperSoft}; max-height: 28rem; overflow: auto;
  white-space: pre-wrap; overflow-wrap: anywhere; font-size: .81rem; line-height: 1.7;
`;
const Fields = styled.dl`
  margin: 14px 0; display: grid; gap: 16px;
  dt { font-weight: 620; font-size: .79rem; }
  dd { margin: 5px 0 0; white-space: pre-wrap; color: ${p => p.theme.colors.inkSoft}; font-size: .84rem; line-height: 1.65; }
`;
const Pagination = styled.nav`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 18px;
  span { color: ${p => p.theme.colors.inkSoft}; font-size: .8rem; }
  div { display: flex; flex-wrap: wrap; gap: 8px; }
`;
const Count = styled.p`margin: 8px 0 18px; font-size: .8rem !important;`;
const Notes = styled.ul`
  margin: 10px 0; padding-left: 20px; color: ${p => p.theme.colors.inkSoft}; font-size: .8rem; line-height: 1.65;
  li + li { margin-top: 6px; }
`;

function Fold({ label, children, ...props }) {
  const [open, setOpen] = useState(false);
  return <Details {...props} onToggle={event => setOpen(event.currentTarget.open)}><summary>{label}</summary>{open ? children : null}</Details>;
}

function Source({ source }) {
  const url = publicSourceUrl(source.source_url);
  return <Fold label={<strong>{sourceLabel(source)}</strong>}>
    <Metadata>
      <div><dt>Kildetype</dt><dd>{({ document: 'Leverandørdokument eller andet dokument', input: 'Sagsoplysning', questionnaire: 'Oplysning fra spørgerammen', law: 'Gemt lovgrundlag', legal_source: 'Gemt lovgrundlag' }[source.kind]) || text(source.kind) || NOT_RECORDED}</dd></div>
      <div><dt>Version</dt><dd>{text(source.version) || NOT_RECORDED}</dd></div>
      <div><dt>Hentet</dt><dd>{date(source.retrieved_at)}</dd></div>
    </Metadata>
    {source.locator && <p>{text(source.locator)}</p>}
    <Excerpt>{text(source.text) || 'Kildetekst er ikke registreret for denne kørsel.'}</Excerpt>
    {url && <TextLink href={url} target="_blank" rel="noopener noreferrer">Åbn officiel eller registreret kilde ↗</TextLink>}
    <Fold label="Kildens tekniske identifikation"><Fields><div><dt>Kilde-ID</dt><dd>{text(source.id) || NOT_RECORDED}</dd></div><div><dt>Dokumentversionens ID</dt><dd>{text(source.document_version_id) || NOT_RECORDED}</dd></div><div><dt>Kontrolsum</dt><dd>{text(source.checksum) || NOT_RECORDED}</dd></div></Fields></Fold>
  </Fold>;
}

function Sources({ ids, sources }) {
  const uniqueIds = [...new Set(strings(ids))];
  return uniqueIds.length ? <div>{uniqueIds.map(id => {
    const source = sources.find(item => item.id === id);
    return source ? <Source key={id} source={source} /> : <p key={id}>Kilde {id}: snapshot ikke registreret.</p>;
  })}</div> : <p>Tilknyttede kilder er ikke registreret.</p>;
}

function fieldValue(value) {
  if (value === null || value === undefined || value === '') return NOT_RECORDED;
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return text(value);
}

function Output({ item, sources, includeSources = true }) {
  return <Fold label={<strong>{text(item.label) || text(item.id) || 'Rapportafsnit'}</strong>}>
    <Fields>{Object.entries(item.fields || {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{fieldValue(value)}</dd></div>)}</Fields>
    {includeSources && <Fold label={`Tilknyttet kildegrundlag (${strings(item.source_ids).length})`}><Sources ids={item.source_ids} sources={sources} /></Fold>}
  </Fold>;
}

function Pages({ page, total, onChange, label }) {
  if (total <= PAGE_SIZE) return null;
  const pages = Math.ceil(total / PAGE_SIZE);
  return <Pagination aria-label={label}><span>Side {page + 1} af {pages}</span><div><SecondaryButton type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>Forrige</SecondaryButton><SecondaryButton type="button" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>Næste</SecondaryButton></div></Pagination>;
}

function OutputList({ items, sources }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(0);
  const id = useId();
  const kinds = [...new Set(items.map(item => item.kind).filter(Boolean))];
  const labels = { summary: 'Resumé', section: 'Analyseafsnit', risk: 'Risiko', recommendation: 'Anbefaling', finding: 'Fund', clarification: 'Afklaring', fact: 'Udledt oplysning', conflict: 'Modstridende oplysninger', question: 'Åbent spørgsmål' };
  const filtered = items.filter(item => (kind === 'all' || item.kind === kind) && normalise([item.label, ...Object.values(item.fields || {})].join(' ')).includes(normalise(search)));
  return <>
    <Toolbar><Field><label htmlFor={`${id}-search`}>Søg i det gemte output</label><input id={`${id}-search`} type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Fx sletning, træning eller risikonummer" /></Field><Field><label htmlFor={`${id}-kind`}>Vis indhold</label><select id={`${id}-kind`} value={kind} onChange={event => { setKind(event.target.value); setPage(0); }}><option value="all">Alt indhold</option>{kinds.map(value => <option key={value} value={value}>{labels[value] || value}</option>)}</select></Field></Toolbar>
    <Count role="status">{filtered.length} af {items.length} outputpunkter</Count>
    {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(item => <Output key={item.id} item={item} sources={sources} />)}
    {!filtered.length && <p>Ingen outputpunkter matcher valget.</p>}
    <Pages page={page} total={filtered.length} onChange={setPage} label="Sider i det gemte output" />
  </>;
}

const HUMAN_STATUS = { open: 'Åben opfølgning', in_progress: 'Under behandling', completed: 'Afsluttet opfølgning', dismissed: 'Arkiveret opfølgning' };
const Actions = styled.div`display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0;`;
const ControlForm = styled.form`
  border-top: 2px solid ${p => p.theme.colors.primary}; padding-top: 18px; margin: 22px 0;
  textarea { box-sizing: border-box; width: 100%; resize: vertical; }
`;

function HumanControlEditor({ value, caseId, assessmentId, onSaved, onCancel, onReload }) {
  const [fields, setFields] = useState({ question: value.question || '', notes: value.notes || '', owner: value.owner || '', status: value.status || 'open' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const id = useId();
  const change = key => event => setFields(previous => ({ ...previous, [key]: event.target.value }));
  const save = async event => {
    event.preventDefault();
    if (saving || conflict) return;
    if (!fields.question.trim()) { setError('Skriv, hvad der skal kontrolleres.'); return; }
    setSaving(true); setError('');
    try {
      const url = `/api/v3/cases/${encodeURIComponent(caseId)}/technical-controls`;
      const payload = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()]));
      const response = value.id
        ? await axios.patch(`${url}/${encodeURIComponent(value.id)}`, { ...payload, expected_version: value.version })
        : await axios.post(url, { ...payload, assessment_id: assessmentId, original_check_id: value.original_check_id || null });
      onSaved(response.data);
    } catch (failure) {
      const stale = failure.response?.status === 409;
      setConflict(stale);
      setError(stale ? 'Punktet er ændret siden du åbnede det. Hent den gemte udgave, før du redigerer videre.' : 'Opfølgningen kunne ikke gemmes. Dine indtastninger er bevaret. Prøv igen.');
    } finally { setSaving(false); }
  };
  return <ControlForm aria-label="Menneskeligt kontrolpunkt" onSubmit={save}>
    <h3>{value.id ? 'Rediger menneskelig opfølgning' : value.original_check_id ? 'Følg op på JEV-kontrolpunkt' : 'Tilføj menneskeligt kontrolpunkt'}</h3>
    <p>Dette er en menneskelig tilføjelse eller ændring, som ikke er kontrolleret af JEV. Originale spørgsmål, svar, scorer og godkendelser ændres ikke. En afsluttet opfølgning er ikke en ny JEV-kontrol.</p>
    {value.original_check_id && <p>Tilknyttet originalt kontrolpunkt: {text(value.original_check_id)}</p>}
    <Field><label htmlFor={`${id}-question`}>Kontrolspørgsmål</label><textarea autoFocus required id={`${id}-question`} rows={3} maxLength={2000} value={fields.question} onChange={change('question')} /></Field>
    <Field><label htmlFor={`${id}-notes`}>Opfølgning og noter</label><textarea id={`${id}-notes`} rows={4} maxLength={12000} value={fields.notes} onChange={change('notes')} placeholder="Beskriv afklaringen og henvis til dokumentation." /></Field>
    <Toolbar><Field><label htmlFor={`${id}-owner`}>Ansvarlig for opfølgningen</label><input id={`${id}-owner`} maxLength={200} value={fields.owner} onChange={change('owner')} /></Field><Field><label htmlFor={`${id}-status`}>Opfølgningens status</label><select id={`${id}-status`} value={fields.status} onChange={change('status')}>{Object.entries(HUMAN_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></Toolbar>
    {error && <ErrorPanel role="alert">{error}{conflict && <Actions><SecondaryButton type="button" onClick={onReload}>Hent gemt udgave og luk redigering</SecondaryButton></Actions>}</ErrorPanel>}
    <Actions><SecondaryButton type="submit" disabled={saving || conflict}>{saving ? 'Gemmer…' : 'Gem menneskelig opfølgning'}</SecondaryButton><SecondaryButton type="button" disabled={saving} onClick={onCancel}>Annuller</SecondaryButton></Actions>
  </ControlForm>;
}

function HumanControls({ controls, caseId, assessmentId, editor, setEditor, onSaved, onReload }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const id = useId();
  const filtered = controls.filter(control => normalise([control.question, control.notes, control.owner, control.original_check_id].join(' ')).includes(normalise(search)));
  return <>
    <h3>Menneskelig opfølgning på denne version</h3>
    <p>Nye eller ændrede kontrolspørgsmål gemmes særskilt med ansvarlig og ændringshistorik. De kræver ny kontrol, også når den menneskelige opfølgning afsluttes. Der startes ikke automatisk en AI-kørsel.</p>
    {!editor && <Actions><SecondaryButton type="button" onClick={() => setEditor({})}>Tilføj kontrolpunkt</SecondaryButton></Actions>}
    {editor && <HumanControlEditor key={editor.id || editor.original_check_id || 'new'} value={editor} caseId={caseId} assessmentId={assessmentId} onSaved={onSaved} onCancel={() => setEditor(null)} onReload={onReload} />}
    {controls.length > 0 && <><Field><label htmlFor={id}>Søg i menneskelig opfølgning</label><input id={id} type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></Field><Count>{filtered.length} af {controls.length} menneskelige kontrolpunkter</Count></>}
    {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(control => <Fold key={control.id} label={<><strong>{text(control.question)}</strong><StatusPill $tone="neutral">{HUMAN_STATUS[control.status] || NOT_RECORDED}</StatusPill><StatusPill $tone="warning">Ikke JEV-kontrolleret</StatusPill></>}>
      <p><strong>Menneskelig {control.original_check_id ? 'ændring / opfølgning' : 'tilføjelse'} · kræver ny kontrol</strong></p>
      <Metadata><div><dt>Ansvarlig</dt><dd>{text(control.owner) || 'Ikke tildelt'}</dd></div><div><dt>Senest gemt</dt><dd>{date(control.updated_at)}</dd></div><div><dt>Tilknytning</dt><dd>{control.original_check_id ? `Originalt JEV-kontrolpunkt: ${text(control.original_check_id)}` : 'Selvstændigt menneskeligt kontrolpunkt'}</dd></div></Metadata>
      <Fields><div><dt>Opfølgning og noter</dt><dd>{text(control.notes) || 'Ingen noter endnu.'}</dd></div></Fields>
      <Actions><SecondaryButton type="button" onClick={() => setEditor(control)}>Rediger opfølgning</SecondaryButton></Actions>
      <Fold label={`Ændringshistorik (${array(control.history).length})`}>{array(control.history).map(revision => <div key={revision.version}>
        <h4>Revision {revision.version} · {revision.action === 'created' ? 'Oprettet' : 'Ændret'} af {text(revision.actor_name) || NOT_RECORDED}</h4>
        <p>{date(revision.created_at)}{revision.identity_assurance === 'development_only' ? ' · Lokal brugeridentitet, ikke bekræftet via login' : ''}</p>
        <Fields>{[['question', 'Kontrolspørgsmål'], ['notes', 'Opfølgning og noter'], ['owner', 'Ansvarlig'], ['status', 'Opfølgningens status']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{key === 'status' ? HUMAN_STATUS[revision.snapshot?.[key]] || NOT_RECORDED : text(revision.snapshot?.[key]) || NOT_RECORDED}</dd></div>)}</Fields>
      </div>)}</Fold>
    </Fold>)}
    {!filtered.length && <p>{controls.length ? 'Ingen menneskelige kontrolpunkter matcher søgningen.' : 'Ingen menneskelige kontrolpunkter er tilføjet endnu.'}</p>}
    <Pages page={page} total={filtered.length} onChange={setPage} label="Sider i menneskelig opfølgning" />
  </>;
}

function Review({ review, items, sources, controls = [], onFollowUp }) {
  const checks = array(review?.checks);
  const reviewedItems = array(review?.reviewed_output_items);
  const flagged = checks.filter(check => check.requires_review || check.stale);
  const [filter, setFilter] = useState(flagged.length ? 'attention' : 'all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const id = useId();
  const filtered = checks.filter(check => (filter === 'all' || (filter === 'attention' ? check.requires_review || check.stale : filter === 'stale' ? check.stale : !check.requires_review && !check.stale)) && normalise([check.id, check.label, ...strings(check.section_ids)].join(' ')).includes(normalise(search)))
    .sort((a, b) => Number(Boolean(b.stale || b.requires_review)) - Number(Boolean(a.stale || a.requires_review)));
  if (!review) return <StatePanel><strong>Ingen JEV-kontrol registreret</strong><p>Der er ikke gemt en JEV-kontrol for denne version. En regelbaseret vurdering eller materialeanalyse er ikke i sig selv kontrolleret af JEV.</p></StatePanel>;
  return <>
    <Metadata>
      <div><dt>Kontrolmodel</dt><dd>{modelLabel(review.model)}</dd></div>
      <div><dt>Kontrolrubrik</dt><dd>{text(review.rubric_version) || NOT_RECORDED}</dd></div>
      <div><dt>Grænse for opfølgning</dt><dd>{score(review.threshold)}</dd></div>
    </Metadata>
    <p>JEV's score er et problemsignal: Et højere tal betyder større behov for opfølgning. Scoren er ikke en juridisk godkendelse eller en kvalitetsscore.</p>
    {review.threshold_note && <p>{text(review.threshold_note)}</p>}
    <Fold label="Sådan blev JEV-kontrollen afgrænset">
      {review.criteria_note && <p>{text(review.criteria_note)}</p>}
      <Notes>{strings(review.criteria).map((criterion, index) => <li key={index}>{criterion}</li>)}</Notes>
      <p>{text(review.reasoning_note) || 'Der er ikke registreret en selvstændig begrundelse fra modellen. Her vises kontrolresultatet og det gemte grundlag.'}</p>
      {review.source_note && <p>{text(review.source_note)}</p>}
    </Fold>
    <Toolbar><Field><label htmlFor={`${id}-search`}>Søg i JEV-kontrolpunkter</label><input id={`${id}-search`} type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Fx risiko 4.7, hjemmel eller resumé" /></Field><Field><label htmlFor={`${id}-filter`}>Vis kontrolpunkter</label><select id={`${id}-filter`} value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="attention">Kræver opfølgning eller ny kontrol</option><option value="all">Alle kontrolpunkter</option><option value="unflagged">Uden markering</option><option value="stale">Kræver ny kontrol efter redigering</option></select></Field></Toolbar>
    <Count role="status">{filtered.length} af {checks.length} kontrolpunkter · {flagged.length} kræver opfølgning eller ny kontrol</Count>
    {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(check => <Fold key={check.id} label={<><strong>{text(check.label) || text(check.id)}</strong><StatusPill $tone={check.stale || check.requires_review ? 'warning' : 'neutral'}>{check.stale ? 'Kræver ny kontrol' : check.requires_review ? 'Kræver opfølgning' : 'Uden markering'}</StatusPill></>}>
      {check.stale && <Inset><strong>Den tidligere kontrol gælder ikke den ændrede tekst.</strong><p>Indholdet er redigeret efter JEV-kørslen og afventer ny kontrol. Den tidligere score vises kun som historik.</p></Inset>}
      <Metadata><div><dt>{check.stale ? 'Tidligere problemsignal' : 'Problemsignal'}</dt><dd>{score(check.probability)}</dd></div><div><dt>Grænse for opfølgning</dt><dd>{score(review.threshold)}</dd></div><div><dt>Kontrolpunktets ID</dt><dd>{text(check.id)}</dd></div></Metadata>
      {[['question', 'Registreret kontrolspørgsmål'], ['criteria_text', 'Registreret kriterium'], ['grounding', 'Registreret grundlag']].map(([key,label]) => typeof check[key] === 'string' && check[key] ? <Fields key={key}><div><dt>{label}</dt><dd>{check[key]}</dd></div></Fields> : null)}
      <h3>{check.stale ? 'Tidligere kontrolleret tekst' : 'Kontrolleret tekst'}</h3>
      {strings(check.output_item_ids).length ? strings(check.output_item_ids).map(itemId => {
        const item = (check.stale ? reviewedItems : items).find(value => value.id === itemId);
        return item ? <Output key={itemId} item={item} sources={sources} includeSources={false} /> : <p key={itemId}>Output {itemId} er ikke registreret.</p>;
      }) : <p>Det præcise output for dette kontrolpunkt er ikke registreret.</p>}
      <Fold label={`Grundlag for kontrollen (${strings(check.source_ids).length} kilder)`}><Sources ids={check.source_ids} sources={sources} /></Fold>
      {onFollowUp && <Actions><SecondaryButton type="button" onClick={() => onFollowUp(controls.find(control => control.original_check_id === check.id) || { original_check_id: check.id, question: text(check.question) || text(check.label) || text(check.id) })}>{controls.some(control => control.original_check_id === check.id) ? 'Rediger menneskelig opfølgning' : 'Tilføj menneskelig opfølgning'}</SecondaryButton></Actions>}
    </Fold>)}
    {!filtered.length && <p>Ingen kontrolpunkter matcher valget. Menneskelig gennemgang er stadig nødvendig.</p>}
    <Pages page={page} total={filtered.length} onChange={setPage} label="Sider i JEV-kontrolpunkter" />
  </>;
}

function SourceList({ sources }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const id = useId();
  const filtered = useMemo(() => sources.filter(source => normalise(`${sourceLabel(source)} ${text(source.text)}`).includes(normalise(search))), [sources, search]);
  return <><Field><label htmlFor={id}>Søg i kildetitler og gemte uddrag</label><input id={id} type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></Field><Count role="status">{filtered.length} af {sources.length} kilder</Count>{filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(source => <Source key={source.id} source={source} />)}{!filtered.length && <p>Ingen gemte kilder matcher søgningen.</p>}<Pages page={page} total={filtered.length} onChange={setPage} label="Sider i kildegrundlag" /></>;
}

function Usage({ value }) {
  const rows = Array.isArray(value) ? array(value) : value && typeof value === 'object' ? [value] : [];
  const totals = {};
  rows.forEach(row => Object.entries(row).forEach(([key, count]) => {
    if (typeof count === 'number' && Number.isFinite(count)) totals[key] = (totals[key] || 0) + count;
  }));
  const labels = { inputTokens: 'Inputtokens', outputTokens: 'Outputtokens', totalTokens: 'Tokens i alt', reasoningTokens: 'Ræsonnementtokens', cachedInputTokens: 'Inputtokens fra cache', input_tokens: 'Inputtokens', output_tokens: 'Outputtokens', total_tokens: 'Tokens i alt' };
  return Object.keys(totals).length ? <><p>Summeret fra {rows.length} gemte forbrugsposter. Manglende tal indgår ikke i summen.</p><Fields>{Object.entries(totals).map(([key, count]) => <div key={key}><dt>{labels[key] || key}</dt><dd>{count.toLocaleString('da-DK')}</dd></div>)}</Fields></> : <p>{NOT_RECORDED}</p>;
}

function BatchSummary({ batching }) {
  if (!['map-reduce-v1','single-pass-v1'].includes(batching?.strategy) || !Number.isInteger(batching.batch_count) || batching.batch_count < 1) return null;
  const batches = array(batching.batches);
  return <Fold label={`Kildegrundlag fordelt på ${count(batching.batch_count)} ${batching.batch_count === 1 ? 'del' : 'dele'}`}>
    <p>{batching.strategy === 'map-reduce-v1' ? 'Materialet blev opdelt i delanalyser og samlet til ét resultat med kildehenvisninger.' : 'Materialet kunne behandles samlet uden delanalyser.'} Fordelingen viser det registrerede tekstgrundlag; den er ikke en godkendelse af indholdet.</p>
    <Metadata><div><dt>Kildeuddrag i alt</dt><dd>{count(batching.source_count)}</dd></div><div><dt>Tegn i tekstgrundlaget</dt><dd>{count(batching.source_text_chars)}</dd></div>{Number.isInteger(batching.map_call_count) && <div><dt>Kald til delanalyser</dt><dd>{count(batching.map_call_count)}</dd></div>}{Number.isInteger(batching.synthesis_call_count) && <div><dt>Kald til samling</dt><dd>{count(batching.synthesis_call_count)}</dd></div>}</Metadata>
    {batching.consolidation_note && <p>{text(batching.consolidation_note)}</p>}
    {Number.isInteger(batching.cross_batch_conflict_count) && <p>Registrerede modstridende oplysninger på tværs af delene: {count(batching.cross_batch_conflict_count)}.</p>}
    {batches.map((batch,index)=><Fold key={`${batch.index ?? index}-${index}`} label={<><strong>Del {count(Number.isInteger(batch.index) ? batch.index : index + 1)}</strong> · {Array.isArray(batch.source_ids) ? count(strings(batch.source_ids).length) : NOT_RECORDED} kildeuddrag · {count(batch.source_text_chars)} tegn{Number.isInteger(batch.document_count) ? ` · ${count(batch.document_count)} ${batch.document_count===1?'dokument':'dokumenter'}` : ''}</>}>
      <p>{text(batch.summary) || 'Delens sammenfatning er ikke registreret.'}</p>
      <Metadata>{[['fact_count','Udledte oplysninger'],['conflict_count','Modstridende oplysninger'],['question_count','Afklaringsspørgsmål'],['finding_count','Registrerede fund']].filter(([key])=>Number.isInteger(batch[key])).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{count(batch[key])}</dd></div>)}</Metadata>
    </Fold>)}
  </Fold>;
}

function RunDetails({ run, caseId, onControlSaved, onReload }) {
  const [editor, setEditor] = useState(null);
  const [saved, setSaved] = useState(false);
  const controls = array(run.human_controls);
  const saveControl = control => { onControlSaved(control); setEditor(null); setSaved(true); };
  const sources = array(run.sources);
  const items = array(run.output_items);
  const notes = modelNotes([...strings(run.limitations), ...strings(run.recording_notes)], run.model);
  const stages = array(run.stages);
  const provenance = run.provenance || {};
  return <>
    <Metadata><div><dt>Rapportversion</dt><dd>{run.version == null ? NOT_RECORDED : `Version ${run.version}`}</dd></div><div><dt>Version gemt</dt><dd>{date(run.created_at)}</dd></div><div><dt>Type</dt><dd>{kindLabel(run.kind)}</dd></div><div><dt>Udarbejdende model</dt><dd>{modelLabel(run.model)}</dd></div><div><dt>Promptversion</dt><dd>{text(run.prompt_version) || (run.prompt_version_recorded ? 'Gemt i revisionssporet' : NOT_RECORDED)}</dd></div><div><dt>AI-udkast udarbejdet</dt><dd>{date(run.generation_created_at)}</dd></div></Metadata>
    {provenance.provider_note && <p>{modelNote(provenance.provider_note, run.model)}</p>}
    {run.assessment_id && <TextLink href={`/vurdering?assessment_id=${encodeURIComponent(run.assessment_id)}&case=${encodeURIComponent(caseId)}`}>Åbn denne rapportversion →</TextLink>}
    {run.editorial_revision && <Inset><strong>Fagligt redigeret version – ingen ny AI-kørsel</strong><p>{text(run.editorial_revision.note) || 'Rapportteksten er ændret efter den oprindelige kørsel.'} Modeloplysninger og tidligere kontrolresultater stammer fra den oprindelige AI-version. Ændrede kontrolpunkter kræver ny kontrol.</p></Inset>}
    {stages.length > 0 && <Steps aria-label="Kørslens procestrin">{stages.map((stage, index) => <li key={stage.id || index}><strong>{index + 1}. {text(stage.title)}</strong><p>{text(stage.description)}</p></li>)}</Steps>}
    <BatchSummary batching={run.batching} />
    <Section><SectionHeader><div><h2>JEV-kontrol</h2><p>Se, hvilke formuleringer der blev kontrolleret, og hvilket registreret kildegrundlag der hører til.</p></div></SectionHeader><Review review={run.review} items={items} sources={sources} controls={controls} onFollowUp={run.assessment_id ? value => { setSaved(false); setEditor(value); } : null} />
      {saved && <p role="status">Menneskelig opfølgning er gemt. Den oprindelige JEV-kontrol er bevaret.</p>}
      {run.assessment_id ? <HumanControls controls={controls} caseId={caseId} assessmentId={run.assessment_id} editor={editor} setEditor={value => { setSaved(false); setEditor(value); }} onSaved={saveControl} onReload={async () => { const refreshed = await onReload(); if (refreshed.isSuccess && !refreshed.isError) setEditor(null); }} /> : <p>Vælg en gemt vurderingsversion for at tilføje menneskelige kontrolpunkter.</p>}
    </Section>
    <Section><SectionHeader><div><h2>Det udarbejdede indhold</h2><p>Det gemte output fra denne version med tilknyttede kilder. Anbefalinger vises som selvstændige outputpunkter.</p></div></SectionHeader>{items.length ? <OutputList items={items} sources={sources} /> : <StatePanel><strong>Output er ikke registreret</strong><p>Denne kørsel har ingen gemte outputpunkter.</p></StatePanel>}</Section>
    <Section><SectionHeader><div><h2>Kildegrundlag</h2><p>De gemte kildetekster fra kørslen. Et link kan siden være ændret; uddraget her viser det registrerede grundlag.</p></div></SectionHeader><SourceList sources={sources} /></Section>
    <Section><SectionHeader><div><h2>Kørselsoplysninger og afgrænsning</h2><p>Registrerede metadata og begrænsninger. Manglende oplysninger vises som »Ikke registreret«.</p></div></SectionHeader>
      {notes.length > 0 && <Notes>{notes.map((note, index) => <li key={index}>{note}</li>)}</Notes>}
      <Fold label="Modeloplysninger og kørsels-ID"><Fields><div><dt>Kørsels-ID</dt><dd>{text(provenance.run_id) || (provenance.run_id_recorded ? 'Gemt i revisionssporet' : NOT_RECORDED)}</dd></div><div><dt>Oplysning om modellens proveniens</dt><dd>{provenance.model_attestation === 'operator_reported' ? 'Model og kørsels-ID er oplyst af operatøren ved import; de er ikke automatisk verificeret.' : text(provenance.model_attestation) || NOT_RECORDED}</dd></div><div><dt>Grundlagets vurderings-ID</dt><dd>{text(provenance.parent_assessment_id) || NOT_RECORDED}</dd></div><div><dt>JEV-kontrollens vurderings-ID</dt><dd>{text(run.review?.reviewed_assessment_id) || NOT_RECORDED}</dd></div></Fields></Fold>
      <Fold label="Gemt sagsgrundlag"><Fields>{Object.keys(run.input_snapshot || {}).length ? Object.entries(run.input_snapshot).map(([key, value]) => <div key={key}><dt>{INPUT_SOURCE_LABELS[key] || key}</dt><dd>{fieldValue(value)}</dd></div>) : <p>{NOT_RECORDED}</p>}</Fields></Fold>
      <Fold label="Registreret forbrug"><h3>Udarbejdelse</h3><Usage value={run.usage && Object.prototype.hasOwnProperty.call(run.usage, 'drafting') ? run.usage.drafting : run.usage} /><h3>JEV-kontrol</h3><Usage value={run.review?.usage} /></Fold>
    </Section>
  </>;
}

export default function TechnicalRunsPanel({ caseId }) {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const query = useQuery(['case-technical-runs', caseId], async () => (await axios.get(`/api/v3/cases/${encodeURIComponent(caseId)}/technical-runs`)).data, { enabled: Boolean(caseId) });
  const runs = array(query.data?.runs);
  const requestedRun = params.get('run_id');
  const requestedAssessment = params.get('assessment_id');
  const selected = (requestedRun ? runs.find(run => run.id === requestedRun) : requestedAssessment ? runs.find(run => run.assessment_id === requestedAssessment) : null) || runs[0];
  const selectionMissing = Boolean((params.get('run_id') || params.get('assessment_id')) && selected && (params.get('run_id') ? selected.id !== params.get('run_id') : selected.assessment_id !== params.get('assessment_id')));
  const chooseRun = value => {
    const next = new URLSearchParams(params);
    next.set('run_id', value);
    const run = runs.find(item => item.id === value);
    if (run?.assessment_id) next.set('assessment_id', run.assessment_id); else next.delete('assessment_id');
    setParams(next);
  };
  return <Panel id="case-panel-technical-runs" role="tabpanel" aria-labelledby="case-tab-technical-runs" tabIndex={0}>
    <SectionHeader><div><h2>Teknisk kørsel</h2><p>Følg det gemte spor fra sagens oplysninger til rapporttekst, kilder og JEV-kontrol. Visningen starter ingen nye AI-kald.</p></div></SectionHeader>
    {query.isError && query.data && <ErrorPanel role="alert"><strong>Kørselsoversigten kunne ikke opdateres</strong><p>Den senest hentede oversigt vises. Dine indtastninger er bevaret.</p><SecondaryButton type="button" onClick={() => query.refetch()}>Prøv at opdatere igen</SecondaryButton></ErrorPanel>}
    {query.isLoading ? <StatePanel role="status"><strong>Henter registrerede kørsler…</strong></StatePanel> : query.isError && !query.data ? <ErrorPanel role="alert"><strong>Kørselsoplysningerne kunne ikke hentes</strong><p>Prøv igen. Sagens gemte vurderinger er ikke ændret.</p><SecondaryButton type="button" onClick={() => query.refetch()}>Prøv igen</SecondaryButton></ErrorPanel> : !runs.length ? <StatePanel><strong>Ingen registrerede kørsler endnu</strong><p>Når sagen får en materialeanalyse eller en gemt vurdering, vises det tilgængelige kørselsgrundlag her.</p></StatePanel> : <>
      <Field><label htmlFor="technical-run-select">Vælg kørsel eller rapportversion</label><select id="technical-run-select" value={selected.id} onChange={event => chooseRun(event.target.value)}>{runs.map(run => <option key={run.id} value={run.id}>{run.version == null ? kindLabel(run.kind) : `Version ${run.version} · ${kindLabel(run.kind)}`} · {date(run.created_at)}</option>)}</select></Field>
      {selectionMissing && <p role="status">Den ønskede version har ingen registreret kørsel. Den seneste tilgængelige version vises.</p>}
      <RunDetails key={selected.id} run={selected} caseId={caseId} onReload={() => query.refetch()} onControlSaved={control => {
        queryClient.setQueryData(['case-technical-runs', caseId], previous => ({ ...previous, runs: array(previous?.runs).map(run => run.assessment_id !== control.assessment_id ? run : { ...run, human_controls: [...array(run.human_controls).filter(item => item.id !== control.id), control] }) }));
        queryClient.invalidateQueries(['case-workspace', caseId]);
      }} />
    </>}
  </Panel>;
}
