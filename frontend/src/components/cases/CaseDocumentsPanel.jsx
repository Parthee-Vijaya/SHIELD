import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button, Field, SectionHeader, StatePanel, StatusPill, TextLink, formatDate } from '../workflow/WorkflowUi';
import { formatDocumentDate } from '../../features/documents/documentDates';
import StructuredReportText from '../assessment/StructuredReportText';
import { actorLabel } from './caseVersionPresentation';

export const DOCUMENT_LABELS = { needs_description: 'Kommunens behovsbeskrivelser', data_processing_agreement: 'Databehandleraftaler', security_documentation: 'Sikkerhed og revision', supplier_documentation: 'Leverandørmateriale', policy: 'Politikker og procedurer', assessment: 'Vurderinger og rapporter', template: 'Skabeloner', other: 'Øvrig dokumentation' };
const STATUSES = { draft: 'Ikke fagligt godkendt', approved: 'Dokumentversion godkendt', superseded: 'Tidligere version', withdrawn: 'Trukket tilbage', valid: 'Gyldig' };
const Wrapper = styled.div`
  padding-top: 28px;
  min-width: 0;
  article { border: 1px solid ${p => p.theme.colors.lineSoft}; border-radius: ${p => p.theme.borderRadiusLarge}; background: ${p => p.theme.colors.surface}; box-shadow: ${p => p.theme.shadows.sm}; padding: clamp(18px, 3vw, 26px); margin: 14px 0; min-width: 0; }
  article h4 { font-size: 1rem; line-height: 1.5; overflow-wrap: anywhere; margin: 0; }
  article header { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
  article header > div { min-width: 0; }
  article header > span { max-width: 100%; white-space: normal; line-height: 1.5; }
  article p { color: ${p => p.theme.colors.inkSoft}; font-size: 0.87rem; line-height: 1.65; max-width: 80ch; }
  article details { margin: 18px 0; }
  article summary { cursor: pointer; font-weight: 600; font-size: 0.86rem; }
  article ${Button} { margin-top: 18px; }
  section > h3 { margin: 26px 0 14px; font-size: 1.1rem; }
  @media (max-width: 550px) { article header { flex-direction: column; gap: 10px; } }
`;
const Meta = styled.dl`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin: 20px 0 0;
  dt { color: ${p => p.theme.colors.inkSoft}; font-size: 0.76rem; margin-bottom: 6px; }
  dd { font-size: 0.86rem; line-height: 1.5; margin: 0; overflow-wrap: anywhere; }
  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 440px) { grid-template-columns: minmax(0, 1fr); }
`;
const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; gap: 20px; margin: 22px 0;
  padding: 20px; border: 1px solid ${p => p.theme.colors.lineSoft}; border-radius: ${p => p.theme.borderRadius}; background: ${p => p.theme.colors.surface};
  ${Field} { flex: 1 1 220px; }
`;
const eventDate = value => value ? formatDate(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::[\d.]+)?$/.test(value) ? `${value}Z` : value, true) : 'Ikke registreret';
function sourceUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export default function CaseDocumentsPanel({ documents = [], caseId, onDownload, isDownloading = false, downloadError }) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => documents.filter(item =>
    (category === 'all' || (item.category || 'other') === category) &&
    `${item.title || ''} ${item.original_filename || ''}`.toLocaleLowerCase('da').includes(search.trim().toLocaleLowerCase('da'))
  ).sort((a, b) => (Date.parse(b.uploaded_at) || 0) - (Date.parse(a.uploaded_at) || 0)), [documents, category, search]);
  const categories = [...new Set(documents.map(item => item.category || 'other'))];
  return <Wrapper id="case-panel-documents" role="tabpanel" aria-labelledby="case-tab-documents">
    <SectionHeader data-tour="case-documents"><div><h2>Dokumentation og kildegrundlag</h2><p>Se kategori, præcis dokumentversion og hvem der har lagt materialet ind. En godkendt dokumentversion er ikke en godkendelse af AI-løsningen.</p></div></SectionHeader>
    {caseId && <p><TextLink href={`/anskaffelse?case=${encodeURIComponent(caseId)}&step=materials`}>Tilføj dokumenter eller leverandørlink →</TextLink>{' · '}<TextLink href={`/dokumentbank?case_id=${encodeURIComponent(caseId)}`}>Åbn dokumentbanken →</TextLink></p>}
    {documents.length > 0 && <Toolbar><Field><label htmlFor="case-document-search">Søg i dokumenter</label><input id="case-document-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Titel eller filnavn" /></Field><Field><label htmlFor="case-document-category">Dokumentkategori</label><select id="case-document-category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">Alle kategorier ({documents.length})</option>{categories.map(key => <option key={key} value={key}>{DOCUMENT_LABELS[key] || key} ({documents.filter(item => (item.category || 'other') === key).length})</option>)}</select></Field></Toolbar>}
    {categories.map(key => {
      const items = filtered.filter(item => (item.category || 'other') === key);
      return items.length > 0 && <section key={key} aria-label={DOCUMENT_LABELS[key] || key}><h3>{DOCUMENT_LABELS[key] || key} · {items.length}</h3>{items.map((item, index) => {
        const url = sourceUrl(item.metadata?.source_url);
        return <article key={item.id || index}><header><div><h4>{item.title || item.original_filename || 'Dokument uden titel'}</h4><p>{item.version ? `Version ${item.version}` : 'Version ikke registreret'} · {item.original_filename || 'Filnavn ikke registreret'}</p></div><StatusPill $tone={item.status === 'approved' ? 'success' : 'neutral'}>{STATUSES[item.status] || 'Registreret'}</StatusPill></header>
          <Meta><div><dt>Uploadet</dt><dd>{eventDate(item.uploaded_at)}</dd></div><div><dt>Uploadet af</dt><dd>{actorLabel(item.uploaded_by, item.uploaded_model)}</dd></div><div><dt>Dokumentejer</dt><dd>{actorLabel(item.owner)}</dd></div><div><dt>Kategori</dt><dd>{DOCUMENT_LABELS[item.category] || item.category || 'Øvrig dokumentation'}</dd></div><div><dt>Næste gennemgang</dt><dd>{formatDocumentDate(item.review_at || item.valid_until)}</dd></div><div><dt>Knyttet til sagen af</dt><dd>{actorLabel(item.linked_by)}<br />{eventDate(item.linked_at)}</dd></div></Meta>
          {(item.description || item.note || url || item.approved_by) && <details><summary>Kilde, bemærkninger og dokumentkontrol</summary>{url && <p><TextLink href={url} target="_blank" rel="noopener noreferrer">Åbn den oprindelige kilde →</TextLink></p>}<StructuredReportText text={item.description || item.note || ''} />{item.approved_by && <p>Dokumentversion gennemgået af {actorLabel(item.approved_by)} · {eventDate(item.approved_at)}<br />{item.approval_note}</p>}</details>}
          {item.download_href && <Button type="button" disabled={isDownloading} onClick={() => onDownload({ href: item.download_href, filename: item.original_filename || item.title })}>Hent denne version</Button>}
        </article>;
      })}</section>;
    })}
    {!filtered.length && <StatePanel><strong>{documents.length ? 'Ingen dokumenter matcher søgningen' : 'Intet dokumenteret grundlag'}</strong><p>{documents.length ? 'Prøv en anden kategori eller søgetekst.' : 'Tilknyt databehandleraftaler, sikkerhedsbeskrivelser og anden dokumentation fra leverandørmaterialet eller dokumentbanken.'}</p></StatePanel>}
    {downloadError && <StatePanel role="alert"><strong>Dokumentet kunne ikke hentes</strong><p>{String(downloadError)}</p></StatePanel>}
  </Wrapper>;
}
