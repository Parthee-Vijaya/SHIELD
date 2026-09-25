import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import styled from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';
import { StatusPill } from '../workflow/WorkflowUi';
import { actorLabel, NOT_RECORDED, recordedDate, safeInternalHref, statusTone, versionLabel } from '../cases/caseVersionPresentation';
import { modelLabel } from '../../utils/modelPresentation';

const Section = styled.section`
  margin: 28px 0 48px; min-width: 0;
  h2 { margin-bottom: 12px; font-size: 1.5rem; }
  p { color: ${p => p.theme.colors.textMuted}; font-size: .9rem; line-height: 1.6; }
  ul { margin: 20px 0; padding: 0; list-style: none; }
  li { margin: 20px 0; min-width: 0; }
  h3 { margin: 5px 0 0; font-size: 1.2rem; line-height: 1.4; overflow-wrap: anywhere; }
  h4 { margin: 5px 0 0; font-size: 1.05rem; line-height: 1.4; overflow-wrap: anywhere; }
  small { display: block; font-size: .76rem; line-height: 1.6; color: ${p => p.theme.colors.textMuted}; }
  nav { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
  button { min-height: 44px; padding: 8px 14px; border: 1px solid ${p => p.theme.colors.border}; border-radius: ${p => p.theme.borderRadius}; background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.text}; font: inherit; font-size: .875rem; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  button:focus-visible, a:focus-visible, summary:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
`;
const Filters = styled.div`
  display: grid; grid-template-columns: minmax(200px, 2fr) repeat(2, minmax(160px, 1fr)); gap: 16px; margin: 24px 0;
  label { min-width: 0; font-size: .8rem; font-weight: 600; }
  input, select { width: 100%; min-width: 0; min-height: 44px; margin-top: 7px; padding: 10px 12px; border: 1px solid ${p => p.theme.colors.border}; border-radius: ${p => p.theme.borderRadius}; background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.text}; font: inherit; font-weight: 400; }
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); }
`;
const Snapshot = styled.article`
  min-width: 0; padding: clamp(18px, 3vw, 26px); border: 1px solid ${p => p.theme.colors.lineSoft}; border-radius: ${p => p.theme.borderRadiusLarge};
  border-left: ${p => p.$latest ? '4px' : '1px'} solid ${p => p.$latest ? p.theme.colors.primary : p.theme.colors.lineSoft};
  background: ${p => p.$latest ? p.theme.colors.surface : p.theme.colors.paperSoft};
  header { display: flex; justify-content: space-between; align-items: start; gap: 16px; flex-wrap: wrap; }
  header > div { flex: 1 1 240px; min-width: 0; }
  .version { color: ${p => p.$latest ? p.theme.colors.primary : p.theme.colors.inkSoft}; font-weight: 600; }
  .case-link { display: inline-block; margin-top: 16px; font-size: .85rem; }
`;
const Meta = styled.dl`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 26px; margin: 22px 0 0;
  > div { min-width: 0; } dt { color: ${p => p.theme.colors.inkSoft}; font-size: .75rem; }
  dd { margin: 6px 0 0; font-size: .87rem; overflow-wrap: anywhere; line-height: 1.55; }
  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 440px) { grid-template-columns: minmax(0, 1fr); }
`;
const Older = styled.details`
  margin: 12px 0 0; padding: 12px 0 0;
  summary { width: fit-content; max-width: 100%; cursor: pointer; font-size: .88rem; color: ${p => p.theme.colors.inkSoft}; font-weight: 600; }
  article { margin-top: 12px; }
`;
const PAGE_SIZE = 8;

function HistorySnapshot({ item, latest = false }) {
  const href = safeInternalHref(item.href);
  const title = item.project_name || 'Løsningsnavn ikke registreret';
  const version = item.snapshot_label && !item.version ? item.snapshot_label : versionLabel(item);
  const Heading = latest ? 'h3' : 'h4';
  return <Snapshot $latest={latest} aria-label={`${title} · ${version}`}>
    <header><div><small className="version">{latest ? 'Seneste version' : 'Tidligere version'} · {version}</small><Heading>{href ? <Link to={href}>{title}</Link> : title}</Heading><small>{item.category_label || 'Vurderingstype ikke registreret'}{item.department ? ` · ${item.department}` : ''}</small></div><StatusPill $tone={statusTone(item.status)}>{item.status_label || 'Status ikke registreret'}</StatusPill></header>
    <Meta>
      <div><dt>{item.owner ? 'Ansvarlig for vurderingen' : item.case_owner ? 'Sagsansvarlig (aktuel)' : 'Ansvarlig for vurderingen'}</dt><dd>{item.owner || item.case_owner || NOT_RECORDED}</dd></div>
      <div><dt>Igangsat</dt><dd>{recordedDate(item.initiated_at)}</dd></div>
      <div><dt>Version gemt</dt><dd>{recordedDate(item.created_at)}</dd></div>
      {item.case_db_id && <div><dt>Sagen oprettet</dt><dd>{recordedDate(item.case_created_at)}</dd></div>}
      <div><dt>Sagsreference</dt><dd>{item.case_id || (item.case_db_id ? item.case_db_id : 'Ikke knyttet til en sag')}</dd></div>
      <div><dt>Registreret af</dt><dd>{actorLabel(item.created_by, item.model)}</dd></div>
      <div><dt>{item.model ? 'AI-model' : item.rule_engine_version ? 'Regelmotor' : 'Versions-ID'}</dt><dd>{item.model ? modelLabel(item.model) : item.rule_engine_version ? `Version ${item.rule_engine_version}${item.rules_loaded ? ` · ${item.rules_loaded} regler` : ''}` : item.id || NOT_RECORDED}</dd></div>
    </Meta>
    {item.case_db_id && <Link className="case-link" to={`/sager/${encodeURIComponent(item.case_db_id)}?tab=assessments`}>Se sagen og alle vurderingsspor →</Link>}
  </Snapshot>;
}

export default function AssessmentHistorySection() {
  const { authFetch, user } = useAuth();
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [searchInput]);
  const { data, isLoading, isFetching, isError, refetch } = useQuery(
    ['assessment-history', user?.oid || user?.id, { page, category, status, search }],
    async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (category) params.set('category', category);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const response = await authFetch(`/api/v3/assessment-history?${params}`);
      if (!response.ok) throw new Error('Vurderingerne kunne ikke hentes.');
      return response.json();
    },
    { staleTime: 0 },
  );
  const groups = Array.isArray(data?.items) ? data.items : [];
  return <Section aria-labelledby="assessment-history-title">
    <h2 id="assessment-history-title">Gemte vurderingsspor</h2>
    <p>Se den seneste version for hver sag og vurderingstype. Fold tidligere versioner ud for at følge ændringerne. Et registreret gemmetidspunkt er ikke nødvendigvis tidspunktet, hvor arbejdet blev igangsat.</p>
    <Filters><label>Søg efter løsning, sag eller ansvarlig<input type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Fx Cleardox eller sagsansvarlig" /></label><label>Vurderingstype<select value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}><option value="">Alle typer</option><option value="dpia">Konsekvensanalyse og risici</option><option value="legal_screening">Juridisk screening</option><option value="ai_act">AI Act-vurdering</option><option value="fria">Grundrettigheder</option></select></label><label>Seneste versions status<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">Alle statusser</option><option value="blocked">Blokeret vurdering</option><option value="requires_action">Kræver handling</option><option value="ready_for_review">Klar til faglig gennemgang</option><option value="GO">Screening · ingen blokeringer</option><option value="BETINGET-GO">Screening · kræver handling</option><option value="NO-GO">Screening · blokeret</option></select></label></Filters>
    {isLoading && <p role="status">Henter gemte vurderinger…</p>}
    {isError && <p role="alert">Vurderingshistorikken kunne ikke hentes. <button type="button" onClick={() => refetch()}>Prøv igen</button></p>}
    {!isLoading && !isError && <>
      <p role="status">{data?.count || 0} vurderingsspor · {data?.version_count || 0} gemte versioner</p>
      {!groups.length ? <p>{category || status || search ? 'Ingen vurderinger matcher dine filtre.' : 'Der er endnu ingen gemte vurderinger.'}</p> : <ul aria-label="Vurderinger opdelt efter sag og type">{groups.map(group => <li key={group.id}><HistorySnapshot item={group.latest} latest />{group.older_versions?.length > 0 && <Older><summary>Tidligere versioner ({group.older_versions.length}) · {group.latest.project_name || 'Løsningsnavn ikke registreret'} · {group.category_label}</summary>{group.older_versions.map(item => <HistorySnapshot key={item.id} item={item} />)}</Older>}</li>)}</ul>}
      {(data?.count > PAGE_SIZE || page > 0) && <nav aria-label="Flere gemte vurderingsspor">
        <button type="button" disabled={page === 0 || isFetching} onClick={() => setPage(value => value - 1)}>Forrige</button>
        <span>Side {page + 1} af {Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE))}</span>
        <button type="button" disabled={isFetching || (page + 1) * PAGE_SIZE >= (data?.count || 0)} onClick={() => setPage(value => value + 1)}>Næste</button>
      </nav>}
    </>}
  </Section>;
}
