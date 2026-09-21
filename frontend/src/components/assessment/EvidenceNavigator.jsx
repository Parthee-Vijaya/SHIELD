import React, { useEffect, useId, useMemo, useState } from 'react';
import styled from 'styled-components';

const PAGE_SIZE = 6;
const Panel = styled.section`
  min-width: 0; margin: 24px 0; color: ${p => p.theme.colors.text}; overflow-wrap: anywhere;
  h3 { margin: 0 0 8px; font-size: 1.15rem; }
  > p { margin: 0 0 16px; color: ${p => p.theme.colors.textMuted}; font-size: .82rem; line-height: 1.6; }
  button, input, select { font: inherit; }
  button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
`;
const Filters = styled.div`
  display: grid; grid-template-columns: ${p => p.$compact ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)'}; gap: 12px; margin: 16px 0;
  label { display: grid; min-width: 0; gap: 6px; font-size: .8rem; font-weight: 600; }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px; border: 1px solid ${p => p.theme.colors.border}; border-radius: 0; background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.text}; }
  @media(max-width: 650px) { grid-template-columns: minmax(0,1fr); }
`;
const Results = styled.ol`
  margin: 0; padding: 0; list-style: none; border-top: 1px solid ${p => p.theme.colors.border};
  > li { min-width: 0; margin: 0; padding: 14px 0; border-bottom: 1px solid ${p => p.theme.colors.border}; }
  details { margin: 0; }
  summary { cursor: pointer; font-size: .86rem; line-height: 1.6; }
  summary strong { font-weight: 620; }
`;
const Meta = styled.p`
  margin: 6px 0 0; font-size: .75rem; line-height: 1.6; color: ${p => p.theme.colors.textMuted};
`;
const Selected = styled.span`
  display: inline-block; margin-left: 8px; font-size: .72rem; font-weight: 600; color: ${p => p.theme.colors.success};
`;
const Excerpt = styled.blockquote`
  margin: 14px 0 !important; padding: 10px 14px !important;
  border-left: 3px solid ${p => p.theme.colors.primary} !important;
  white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; font-size: .85rem;
  background: ${p => p.theme.colors.surface};
`;
const Actions = styled.div`
  display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 12px;
  a { color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; font-size: .8rem; }
`;
const Button = styled.button`
  max-width: 100%; border: 1px solid ${p => p.theme.colors.border}; padding: 8px 12px;
  background: transparent; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark};
  cursor: pointer; font-size: .8rem !important;
  &:hover:not(:disabled) { background: ${p => p.theme.colors.primarySoft}; }
  &:disabled { color: ${p => p.theme.colors.textMuted}; opacity: .6; cursor: default; }
`;
const Pagination = styled.nav`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 16px;
  span { font-size: .78rem; color: ${p => p.theme.colors.textMuted}; }
  > div { display: flex; flex-wrap: wrap; gap: 8px; }
`;

const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const normalise = value => text(value).normalize('NFKC').toLocaleLowerCase('da');

// The source IDs stay unchanged; these labels mirror the assessment form.
export const INPUT_SOURCE_LABELS = Object.freeze({
  project_name: 'Løsningens eller projektets navn', organisation: 'Dataansvarlig organisation',
  owner: 'Faglig ansvarlig', department: 'Fagområde', purpose: 'Formål med behandlingen',
  processing_description: 'Sådan behandles oplysningerne', processing_version: 'Behandlingens version eller fase',
  planned_start_date: 'Forventet startdato', planned_start_note: 'Bemærkning til starttidspunkt',
  planned_end_date: 'Forventet slutdato', planned_end_condition: 'Ophørsvilkår', secondary_uses: 'Sekundære formål',
  data_subjects: 'Kategorier af registrerede', personal_data_categories: 'Kategorier af personoplysninger',
  special_categories: 'Følsomme personoplysninger', article_9_basis: 'Undtagelsesgrundlag efter GDPR artikel 9',
  criminal_data: 'Oplysninger om strafbare forhold', criminal_data_basis: 'Grundlag for oplysninger om strafbare forhold',
  criminal_data_legal_reference: 'Konkret hjemmel for oplysninger om strafbare forhold', cpr_data: 'CPR-numre',
  cpr_basis: 'Grundlag for behandling af CPR-numre', cpr_legal_reference: 'Konkret CPR-hjemmel eller reference',
  vulnerable_subjects: 'Børn og andre sårbare personer', large_scale: 'Behandling i stort omfang',
  systematic_monitoring: 'Systematisk overvågning eller sporing', profiling_scoring: 'Profilering eller scoring',
  data_matching: 'Sammenstilling af oplysninger', service_access_impact: 'Betydning for adgang til ydelser',
  automated_decisions: 'Automatiske afgørelser', human_oversight: 'Menneskelig kontrol',
  solution_type: 'Løsningstype', supplier_name: 'Leverandør', hosting_region: 'Primært hostingområde',
  transfer_outside_eea: 'Overførsel uden for EU/EØS', transfer_mechanism: 'Overførselsgrundlag',
  model_training: 'Brug af data til modeltræning', retention_period: 'Opbevaringsperiode',
  legal_basis: 'Primært behandlingsgrundlag', legal_basis_reference: 'Konkret lovhjemmel eller reference',
  legal_basis_source_url: 'Officiel kilde til lovhjemlen', dpo_involved: 'Inddragelse af DPO',
  controls: 'Oplyste sikkerhedsforanstaltninger', verified_controls: 'Verificerede sikkerhedsforanstaltninger',
  control_evidence: 'Dokumentation for sikkerhedsforanstaltninger', rights_procedures: 'Procedurer for de registreredes rettigheder',
  rights_procedure_description: 'Beskrivelse af rettighedsprocedurer', alternatives_considered: 'Overvejede alternativer',
  benefits_and_proportionality: 'Gevinster og proportionalitet', dpo_advice: 'DPO-rådgivning',
  data_subject_consultation: 'Inddragelse af de registrerede', publication_plan: 'Plan for offentliggørelse',
});

export function sourceLabel(source) {
  const id = text(source?.id);
  if (id.startsWith('input:')) return INPUT_SOURCE_LABELS[id.slice(6)] || 'Øvrig oplysning fra spørgerammen';
  return text(source?.title || source?.original_filename) || 'Kilde uden titel';
}

const kindOfSource = source => text(source.id).startsWith('input:') ? 'input'
  : text(source.id).startsWith('law:') ? 'law'
  : source.document_version_id || source.version_id || Array.isArray(source.excerpts) || text(source.id).startsWith('document:') ? 'document' : 'other';
const versionLabel = group => group.kind === 'input' ? 'Gemt sagsoplysning'
  : group.kind === 'law' ? 'Gemt lovuddrag'
  : group.version ? `Version ${group.version}`
  : group.pinned ? 'Gemt dokumentversion' : 'Gemt kildegrundlag';

// This only creates external browser links; no document is retrieved here.
export function publicSourceUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (!host.includes('.') || host.includes(':') || /(^|\.)(localhost|localdomain|local|internal|lan|home|arpa|test|invalid|example)$/.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0)) return null;
    }
    if (url.port && !['80', '443'].includes(url.port)) return null;
    return url.href;
  } catch { return null; }
}

function sourceRows(sources) {
  const groups = new Map();
  const entries = [];
  const seen = new Set();
  (Array.isArray(sources) ? sources : []).filter(Boolean).forEach((source, sourceIndex) => {
    const groupId = text(source.document_version_id || source.version_id || source.id);
    const groupKey = groupId || `unidentified-source-${sourceIndex}`;
    const kind = kindOfSource(source);
    const group = groups.get(groupKey) || {
      key: groupKey, title: sourceLabel(source), kind,
      version: text(source.version), pinned: kind === 'document' && Boolean(source.version_id || source.document_version_id || source.checksum),
    };
    groups.set(groupKey, group);
    const nested = Array.isArray(source.excerpts);
    const excerpts = nested ? source.excerpts : [source];
    if (!excerpts.length) {
      entries.push({ key: `${groupKey}-unreadable`, id: '', group, locator: 'Ingen læsbare tekstuddrag', text: '', url: publicSourceUrl(source.source_url) });
    }
    excerpts.filter(Boolean).forEach((excerpt, excerptIndex) => {
      const id = text(excerpt.id);
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      entries.push({
        key: id || `${groupKey}-unidentified-excerpt-${excerptIndex}`, id, group,
        text: text(excerpt.text), locator: text(excerpt.locator || source.locator) || (kind === 'input' ? 'Oplysning fra spørgerammen' : kind === 'law' ? 'Lovtekst' : 'Placering ikke angivet'),
        url: publicSourceUrl(excerpt.source_url || source.source_url),
      });
    });
  });
  return { groups: [...groups.values()], entries };
}

/** Browse the supplied snapshot only. Selecting a citation never approves its claim. */
export default function EvidenceNavigator({ sources = [], selectedSourceIds = [], onSelect, compact = false, context = 'materials' }) {
  const headingId = useId();
  const { groups, entries } = useMemo(() => sourceRows(sources), [sources]);
  const [query, setQuery] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [page, setPage] = useState(1);
  const sourceIdentity = groups.map(group => group.key).join('\u0000');
  useEffect(() => { setQuery(''); setGroupKey(''); setPage(1); }, [sourceIdentity]);
  const selected = new Set(Array.isArray(selectedSourceIds) ? selectedSourceIds : []);
  const availableIds = new Set(entries.map(entry => entry.id).filter(Boolean));
  const missingCount = [...selected].filter(id => !availableIds.has(id)).length;
  const activeGroup = groups.some(group => group.key === groupKey) ? groupKey : '';
  const searchTerms = normalise(query).trim().split(/\s+/).filter(Boolean);
  const filtered = entries.filter(entry => (!activeGroup || entry.group.key === activeGroup) && searchTerms.every(term => normalise(`${entry.group.title} ${entry.locator} ${entry.text}`).includes(term)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  return <Panel aria-labelledby={headingId}>
    <h3 id={headingId}>Kilder og citater</h3>
    <p>Find de gemte tekstuddrag og deres placering i materialet. Kildehenvisninger peger på dette grundlag; en hjemmeside kan siden være ændret.</p>
    {entries.length > 0 ? <>
      <Filters $compact={compact}>
        <label>Søg i kilder og citater<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Fx sletning, adgang eller hosting" /></label>
        <label>Vis kilde<select value={activeGroup} onChange={event => { setGroupKey(event.target.value); setPage(1); }}><option value="">Alle kilder ({groups.length})</option>{groups.map(group => <option key={group.key} value={group.key}>{group.title}{group.kind !== 'input' && group.kind !== 'law' && group.version ? ` · version ${group.version}` : ''}</option>)}</select></label>
      </Filters>
      <p role="status">{filtered.length ? `Viser ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} af ${filtered.length} tekstuddrag` : 'Ingen tekstuddrag matcher din søgning.'}</p>
      {missingCount > 0 && <p role="status">{missingCount} {missingCount === 1 ? 'kildehenvisning findes' : 'kildehenvisninger findes'} ikke i dette kildegrundlag. Henvisningen skal afklares.</p>}
      <Results aria-label="Gemte kildeuddrag">
        {visible.map(entry => <li key={entry.key}>
          <details>
            <summary><strong>{entry.group.title}</strong> · {entry.locator}{selected.has(entry.id) && <Selected>Valgt som kilde</Selected>}</summary>
            <Meta>{versionLabel(entry.group)} · {entry.locator}</Meta>
            {entry.text ? <Excerpt>{entry.text}</Excerpt> : <Meta>Der er ikke et læsbart tekstuddrag. Materialet skal gennemgås manuelt.</Meta>}
            <Actions>
              {onSelect && entry.id && entry.text && <Button type="button" disabled={selected.has(entry.id)} onClick={() => onSelect(entry.id)}>{selected.has(entry.id) ? 'Kilde valgt' : 'Brug som kilde'}</Button>}
              {entry.url && <a href={entry.url} target="_blank" rel="noopener noreferrer">Åbn oprindelig hjemmeside ↗</a>}
            </Actions>
          </details>
        </li>)}
      </Results>
      {!filtered.length && <Button type="button" onClick={() => { setQuery(''); setGroupKey(''); setPage(1); }}>Vis alle kilder</Button>}
      {pages > 1 && <Pagination aria-label="Sider med kildeuddrag"><span>Side {currentPage} af {pages}</span><div><Button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Forrige kildeuddrag</Button><Button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Næste kildeuddrag</Button></div></Pagination>}
    </> : <p>{context === 'report'
      ? 'Denne rapportversion har ingen gemte kildeuddrag. Materiale tilføjet senere indgår først efter en ny analyse.'
      : 'Der er endnu ingen kilder i dette grundlag. Tilføj materiale på sagen, før der henvises til det.'}</p>}
  </Panel>;
}
