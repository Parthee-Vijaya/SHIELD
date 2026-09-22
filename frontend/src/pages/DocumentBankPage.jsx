import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  Button,
  Card,
  ErrorPanel,
  Eyebrow,
  Field,
  Form,
  Grid,
  HeaderActions,
  Lede,
  Page,
  PageHeader,
  SecondaryButton,
  Section,
  SectionHeader,
  StatePanel,
  StatusPill,
  TextLink,
  Title,
  VisuallyHidden,
  toArray,
} from '../components/workflow/WorkflowUi';
import { useAuth } from '../contexts/AuthContext';
import { formatDocumentDate, toDocumentDateTime } from '../features/documents/documentDates';

const CATEGORIES = [
  { value: 'data_processing_agreement', label: 'Databehandleraftale' },
  { value: 'security_documentation', label: 'Sikkerhedsdokumentation' },
  { value: 'policy', label: 'Politik og retningslinje' },
  { value: 'assessment', label: 'Tidligere vurdering' },
  { value: 'supplier_documentation', label: 'Leverandørmateriale' },
  { value: 'template', label: 'Kommunal skabelon' },
  { value: 'other', label: 'Andet' },
];

const FilterBar = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 1fr) repeat(2, minmax(170px, 0.3fr));
  gap: 10px;
  padding: 20px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};

  input,
  select {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid ${(p) => p.theme.colors.line};
    border-radius: 0;
    background: ${(p) => p.theme.colors.surface};
    color: ${(p) => p.theme.colors.ink};
  }

  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const Editor = styled.section`
  margin: 24px 0;
  padding: 26px;
  border: 1px solid ${(p) => p.theme.colors.primary};
  background: ${(p) => p.theme.colors.primaryShallow};

  h2 { margin: 0 0 20px; font-size: 1.45rem; }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  .wide { grid-column: 1 / -1; }

  @media (max-width: 680px) { grid-template-columns: 1fr; .wide { grid-column: auto; } }
`;

const EditorActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const DocumentCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 300px;
  overflow-wrap: anywhere;
`;

const CardHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 10px 16px;
  min-width: 0;

  > div { flex: 1 1 180px; min-width: 0; }
  > ${StatusPill} {
    flex: 0 1 auto;
    max-width: 100%;
    white-space: normal;
    line-height: 1.35;
  }
`;

const Metadata = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
  margin: 0;

  dt { color: ${(p) => p.theme.colors.inkFaded}; font-size: 0.64rem; letter-spacing: 0.08em; text-transform: uppercase; }
  dd { margin: 4px 0 0; color: ${(p) => p.theme.colors.ink}; font-size: 0.78rem; overflow-wrap: anywhere; }
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Tag = styled.span`
  max-width: 100%;
  padding: 4px 7px;
  background: ${(p) => p.theme.colors.paperSoft};
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 0.66rem;
`;

const CardActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 13px;
  margin-top: auto;
  padding-top: 8px;
`;

const DownloadLink = styled(TextLink)`
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-left: 1px solid ${(p) => p.theme.colors.line};

  div { padding: 18px; border-right: 1px solid ${(p) => p.theme.colors.line}; border-bottom: 1px solid ${(p) => p.theme.colors.line}; }
  span { display: block; color: ${(p) => p.theme.colors.inkFaded}; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.07em; }
  strong { display: block; margin-top: 10px; color: ${(p) => p.theme.colors.ink}; font-size: 1.3rem; }

  @media (max-width: 700px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const initialDocument = {
  title: '',
  category: 'data_processing_agreement',
  owner: '',
  description: '',
  document_key: '',
  classification: 'internal',
  tags: '',
  valid_from: '',
  valid_to: '',
  review_at: '',
  file: null,
};

async function fetchDocuments() {
  const response = await axios.get('/api/v3/documents');
  return response.data;
}

async function createDocument(form) {
  const metadata = {
    title: form.title.trim(),
    category: form.category,
    owner: form.owner.trim() || null,
    description: form.description.trim() || null,
    document_key: form.document_key.trim() || null,
    classification: form.classification,
    tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    valid_from: toDocumentDateTime(form.valid_from),
    valid_to: toDocumentDateTime(form.valid_to, true),
    review_at: toDocumentDateTime(form.review_at),
  };
  const body = new FormData();
  body.append('metadata', JSON.stringify(metadata));
  body.append('file', form.file);
  const response = await axios.post('/api/v3/documents', body);
  return response.data;
}

async function approveDocumentVersion({ documentId, versionId, approvalNote }) {
  const response = await axios.post(
    `/api/v3/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/approve`,
    { approval_note: approvalNote },
  );
  return response.data;
}

async function downloadDocumentVersion({ href, filename }) {
  const response = await axios.get(href, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(response.data);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename || 'dokument';
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

async function linkDocument({ caseId, documentId, purpose, versionId }) {
  const response = await axios.post(`/api/v3/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}`, {
    document_version_id: versionId || null,
    link_role: 'evidence',
    note: purpose,
  });
  return response.data;
}

function normalizeDocuments(payload) {
  const list = payload?.documents || payload?.items || payload;
  return toArray(list).map((item) => {
    const versions = toArray(item.versions);
    const latestVersion = item.latest_version || versions[versions.length - 1] || {};
    return { ...item, latestVersion, versions };
  });
}

function documentState(document) {
  const validUntil = document.valid_until || document.latestVersion.valid_to || document.expires_at;
  const reviewDate = document.review_date || document.latestVersion.review_at;
  const now = new Date();
  const expires = validUntil ? new Date(validUntil) : null;
  const review = reviewDate ? new Date(reviewDate) : null;
  if (expires && !Number.isNaN(expires.getTime()) && expires < now) return { label: 'Udløbet', tone: 'danger', key: 'expired' };
  if (review && !Number.isNaN(review.getTime()) && review < now) return { label: 'Review forfalden', tone: 'warning', key: 'review' };
  if (!document.versions.length) return { label: 'Mangler version', tone: 'warning', key: 'draft' };
  if (document.latestVersion.status === 'superseded') return { label: 'Erstattet', tone: 'neutral', key: 'superseded' };
  return { label: document.latestVersion.status === 'draft' ? 'Kladde' : 'Gyldig', tone: document.latestVersion.status === 'approved' ? 'success' : 'neutral', key: document.latestVersion.status === 'approved' ? 'valid' : 'draft' };
}

function documentTitle(document) {
  return document.title || document.name || document.filename || 'Dokument uden titel';
}

function categoryLabel(value) {
  return CATEGORIES.find((category) => category.value === value)?.label || value || 'Ikke kategoriseret';
}

function CreateEditor({ form, setForm, mutation, onClose }) {
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    mutation.mutate(form);
  };
  return (
    <Editor id="document-create-panel" aria-labelledby="document-create-title">
      <h2 id="document-create-title">Registrér dokument</h2>
      <Form onSubmit={submit}>
        <FormGrid>
          <Field><label htmlFor="document-title">Titel</label><input id="document-title" autoFocus value={form.title} onChange={(event) => setField('title', event.target.value)} required /></Field>
          <Field><label htmlFor="document-category">Kategori</label><select id="document-category" value={form.category} onChange={(event) => setField('category', event.target.value)}>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></Field>
          <Field><label htmlFor="document-owner">Dokumentejer</label><input id="document-owner" value={form.owner} onChange={(event) => setField('owner', event.target.value)} placeholder="Navn eller organisatorisk funktion" required /></Field>
          <Field><label htmlFor="document-key">Fast dokumentnøgle (valgfri)</label><input id="document-key" value={form.document_key} onChange={(event) => setField('document_key', event.target.value)} placeholder="Fx standard-dba-it" /></Field>
          <Field className="wide"><label htmlFor="document-description">Beskrivelse og evidensværdi</label><textarea id="document-description" value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Beskriv hvad dokumentet dokumenterer, og hvilke vurderinger det kan bruges i…" required /></Field>
          <Field><label htmlFor="document-classification">Adgangsniveau</label><select id="document-classification" value={form.classification} onChange={(event) => setField('classification', event.target.value)}><option value="internal">Intern</option><option value="restricted">Begrænset</option><option value="public">Offentlig</option></select></Field>
          <Field><label htmlFor="document-file">Dokumentfil</label><input id="document-file" type="file" accept=".pptx,.pdf,.docx,.xlsx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" onChange={(event) => setField('file', event.target.files?.[0] || null)} required /><small>PowerPoint (PPTX), PDF, DOCX, XLSX eller UTF-8 TXT. Maksimal størrelse fastsættes af kommunen.</small></Field>
          <Field><label htmlFor="document-valid-from">Gyldig fra</label><input id="document-valid-from" type="date" value={form.valid_from} onChange={(event) => setField('valid_from', event.target.value)} /></Field>
          <Field><label htmlFor="document-valid-to">Gyldig til</label><input id="document-valid-to" type="date" min={form.valid_from || undefined} value={form.valid_to} onChange={(event) => setField('valid_to', event.target.value)} /></Field>
          <Field><label htmlFor="document-review-at">Review senest</label><input id="document-review-at" type="date" value={form.review_at} onChange={(event) => setField('review_at', event.target.value)} /></Field>
          <Field className="wide"><label htmlFor="document-tags">Tags</label><input id="document-tags" value={form.tags} onChange={(event) => setField('tags', event.target.value)} placeholder="GDPR, leverandør, sikkerhed" /><small>Adskil tags med komma.</small></Field>
        </FormGrid>
        {mutation.isError ? <ErrorPanel role="alert"><strong>Dokumentet kunne ikke oprettes</strong><p>{String(mutation.error?.response?.data?.detail || mutation.error?.message)}</p></ErrorPanel> : null}
        <EditorActions><SecondaryButton type="button" onClick={onClose}>Annullér</SecondaryButton><Button type="submit" disabled={mutation.isLoading || !form.file || form.title.trim().length < 3 || form.owner.trim().length < 2 || (form.valid_from && form.valid_to && form.valid_to < form.valid_from)}>{mutation.isLoading ? 'Uploader…' : 'Upload dokument'}</Button></EditorActions>
      </Form>
    </Editor>
  );
}

function ApprovalEditor({ document, version, mutation, onClose }) {
  const [approvalNote, setApprovalNote] = useState('');
  const submit = (event) => {
    event.preventDefault();
    mutation.mutate({
      documentId: document.id,
      versionId: version.id,
      approvalNote: approvalNote.trim(),
    });
  };
  return (
    <Editor id="document-approval-panel" aria-labelledby="document-approval-title">
      <h2 id="document-approval-title">Godkend version {version.version_number} af “{documentTitle(document)}”</h2>
      <Form onSubmit={submit}>
        <Field>
          <label htmlFor="document-approval-note">Godkendelsesnote</label>
          <textarea id="document-approval-note" autoFocus value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Beskriv hvad der er kontrolleret, og hvorfor versionen kan genbruges som evidens…" required />
          <small>Noten bliver en del af det revisionssikre godkendelsesspor og skal være mindst 10 tegn.</small>
        </Field>
        {mutation.isError ? <ErrorPanel role="alert"><strong>Versionen kunne ikke godkendes</strong><p>{String(mutation.error?.response?.data?.detail || mutation.error?.message)}</p></ErrorPanel> : null}
        <EditorActions><SecondaryButton type="button" onClick={onClose}>Annullér</SecondaryButton><Button type="submit" disabled={mutation.isLoading || approvalNote.trim().length < 10}>{mutation.isLoading ? 'Godkender…' : 'Godkend version'}</Button></EditorActions>
      </Form>
    </Editor>
  );
}

function LinkEditor({ document, initialCaseId, mutation, onClose }) {
  const approvedVersions = document.versions.filter((version) => version.status === 'approved');
  const defaultVersion = [...approvedVersions].reverse()[0];
  const [form, setForm] = useState(() => ({ caseId: initialCaseId, purpose: '', versionId: defaultVersion?.id || '' }));
  const submit = (event) => {
    event.preventDefault();
    mutation.mutate({ caseId: form.caseId.trim(), documentId: document.id, purpose: form.purpose.trim(), versionId: form.versionId });
  };
  return (
    <Editor id="document-link-panel" aria-labelledby="document-link-title">
      <h2 id="document-link-title">Tilknyt “{documentTitle(document)}” til en sag</h2>
      <Form onSubmit={submit}>
        <FormGrid>
          <Field><label htmlFor="link-case-id">Sags-ID</label><input id="link-case-id" autoFocus value={form.caseId} onChange={(event) => setForm((current) => ({ ...current, caseId: event.target.value }))} required /></Field>
          <Field><label htmlFor="link-version">Godkendt version</label><select id="link-version" value={form.versionId} onChange={(event) => setForm((current) => ({ ...current, versionId: event.target.value }))}>{approvedVersions.length ? approvedVersions.map((version) => <option key={version.id} value={version.id}>Version {version.version_number}</option>) : <option value="">Ingen godkendt version</option>}</select></Field>
          <Field className="wide"><label htmlFor="link-purpose">Hvad dokumenterer filen i denne sag?</label><textarea id="link-purpose" value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="Fx evidens for databehandlerens slettefrister og underdatabehandlere…" required /></Field>
        </FormGrid>
        {mutation.isError ? <ErrorPanel role="alert"><strong>Dokumentet kunne ikke tilknyttes</strong><p>{String(mutation.error?.response?.data?.detail || mutation.error?.message)}</p></ErrorPanel> : null}
        {mutation.isSuccess ? <StatePanel role="status"><strong>Dokumentet er tilknyttet</strong><p>Versionen og formålet er registreret på sagen.</p></StatePanel> : null}
        <EditorActions><SecondaryButton type="button" onClick={onClose}>Luk</SecondaryButton><Button type="submit" disabled={mutation.isLoading || !form.versionId || form.caseId.trim().length < 2 || form.purpose.trim().length < 10}>{mutation.isLoading ? 'Tilknytter…' : 'Tilknyt til sag'}</Button></EditorActions>
      </Form>
    </Editor>
  );
}

function DocumentBankPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDocumentId = searchParams.get('document_id') || '';
  const requestedQuery = searchParams.get('query') || '';
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canApprove = hasRole('Hammeren.Godkender', 'Hammeren.DPO', 'Hammeren.Admin');
  const query = useQuery('document-bank', fetchDocuments);
  const [filters, setFilters] = useState({ search: '', category: 'all', validity: 'all' });
  useEffect(() => {
    setFilters({ search: requestedQuery, category: 'all', validity: 'all' });
  }, [requestedQuery, requestedDocumentId]);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(initialDocument);
  const [linkTarget, setLinkTarget] = useState(null);
  const [approvalTarget, setApprovalTarget] = useState(null);
  const createMutation = useMutation(createDocument, {
    onSuccess: () => {
      queryClient.invalidateQueries('document-bank');
      setDraft(initialDocument);
      setShowCreate(false);
    },
  });
  const linkMutation = useMutation(linkDocument);
  const approvalMutation = useMutation(approveDocumentVersion, {
    onSuccess: () => {
      queryClient.invalidateQueries('document-bank');
      setApprovalTarget(null);
    },
  });
  const downloadMutation = useMutation(downloadDocumentVersion);
  const documents = useMemo(() => normalizeDocuments(query.data), [query.data]);
  const filtered = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return documents.filter((document) => {
      const state = documentState(document);
      const haystack = [documentTitle(document), document.description, document.owner, document.category, ...toArray(document.tags)].join(' ').toLowerCase();
      return (!requestedDocumentId || String(document.id) === requestedDocumentId) && (!needle || haystack.includes(needle)) && (filters.category === 'all' || document.category === filters.category) && (filters.validity === 'all' || state.key === filters.validity);
    });
  }, [documents, filters, requestedDocumentId]);
  const summary = useMemo(() => documents.reduce((totals, document) => {
    const state = documentState(document).key;
    return { ...totals, [state]: (totals[state] || 0) + 1 };
  }, {}), [documents]);

  return (
    <Page>
      <PageHeader data-tour="document-bank">
        <div><Eyebrow>S.H.I.E.L.D. · fælles evidens</Eyebrow><Title>Dokumenter og skabeloner</Title><Lede>Genbrug godkendt dokumentation med tydelig ejer, version, gyldighed og reviewdato – uden at kopiere en tidligere godkendelse ukritisk.</Lede></div>
        <HeaderActions><Button type="button" aria-expanded={showCreate} aria-controls="document-create-panel" onClick={() => { setShowCreate((current) => !current); setLinkTarget(null); setApprovalTarget(null); createMutation.reset(); }}>Registrér dokument</Button></HeaderActions>
      </PageHeader>

      <Summary aria-label="Dokumentstatus">
        <div><span>Dokumenter</span><strong>{documents.length}</strong></div>
        <div><span>Gyldige</span><strong>{summary.valid || 0}</strong></div>
        <div><span>Review forfalden</span><strong>{summary.review || 0}</strong></div>
        <div><span>Udløbne</span><strong>{summary.expired || 0}</strong></div>
      </Summary>

      {showCreate ? <CreateEditor form={draft} setForm={setDraft} mutation={createMutation} onClose={() => setShowCreate(false)} /> : null}
      {linkTarget ? <LinkEditor key={linkTarget.id} document={linkTarget} initialCaseId={searchParams.get('case_id') || ''} mutation={linkMutation} onClose={() => { setLinkTarget(null); linkMutation.reset(); }} /> : null}
      {approvalTarget ? <ApprovalEditor key={approvalTarget.version.id} document={approvalTarget.document} version={approvalTarget.version} mutation={approvalMutation} onClose={() => { setApprovalTarget(null); approvalMutation.reset(); }} /> : null}

      {downloadMutation.isError ? <ErrorPanel role="alert"><strong>Filen kunne ikke hentes</strong><p>{String(downloadMutation.error?.response?.data?.detail || downloadMutation.error?.message)}</p></ErrorPanel> : null}

      <FilterBar aria-label="Filtrér dokumentbanken">
        <label><VisuallyHidden>Søg</VisuallyHidden><input type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Søg i titel, ejer, beskrivelse eller tags…" /></label>
        <label><VisuallyHidden>Kategori</VisuallyHidden><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="all">Alle kategorier</option>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
        <label><VisuallyHidden>Gyldighed</VisuallyHidden><select value={filters.validity} onChange={(event) => setFilters((current) => ({ ...current, validity: event.target.value }))}><option value="all">Alle statusser</option><option value="valid">Gyldig</option><option value="review">Review forfalden</option><option value="expired">Udløbet</option><option value="draft">Kladde</option><option value="superseded">Erstattet</option></select></label>
      </FilterBar>
      {requestedDocumentId && <StatePanel role="status"><strong>Dokument fra søgeresultatet</strong><p>Listen viser det valgte dokument. Åbn hele dokumentbanken for at se de øvrige kilder og skabeloner.</p><SecondaryButton type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('document_id'); next.delete('query'); setSearchParams(next); }}>Vis alle dokumenter</SecondaryButton></StatePanel>}

      <Section>
        <SectionHeader><div><h2>{filtered.length} dokument{filtered.length === 1 ? '' : 'er'}</h2><p>Den konkrete version låses, når dokumentet tilknyttes en sag.</p></div></SectionHeader>
        {query.isLoading ? <StatePanel role="status" aria-live="polite"><strong>Henter dokumentbanken…</strong><p>Versioner og gyldighed kontrolleres.</p></StatePanel> : null}
        {query.isError ? <ErrorPanel role="alert"><strong>Dokumentbanken kunne ikke hentes</strong><p>{String(query.error?.response?.data?.detail || query.error?.message)}</p><Button type="button" onClick={() => query.refetch()}>Prøv igen</Button></ErrorPanel> : null}
        {!query.isLoading && !query.isError && !filtered.length ? <StatePanel><strong>Ingen dokumenter matcher</strong><p>Juster filtrene eller registrér det første dokument i banken.</p></StatePanel> : null}
        {filtered.length ? (
          <Grid $columns={3}>
            {filtered.map((document) => {
              const state = documentState(document);
              const tags = toArray(document.tags);
              return (
                <DocumentCard key={document.id}>
                  <CardHeader><div><h3>{documentTitle(document)}</h3><p>{categoryLabel(document.category)}</p></div><StatusPill $tone={state.tone}>{state.label}</StatusPill></CardHeader>
                  <p>{document.description || 'Ingen beskrivelse af dokumentets evidensværdi.'}</p>
                  <Metadata>
                    <div><dt>Version</dt><dd>{document.latestVersion.version_number || 'Ingen'}</dd></div>
                    <div><dt>Ejer</dt><dd>{document.owner || document.latestVersion.owner || 'Ikke angivet'}</dd></div>
                    <div><dt>Review</dt><dd>{formatDocumentDate(document.latestVersion.review_at)}</dd></div>
                    <div><dt>Gyldig til</dt><dd>{formatDocumentDate(document.latestVersion.valid_to)}</dd></div>
                    <div><dt>Evidens</dt><dd>{document.latestVersion.status === 'approved' ? 'Godkendt version' : 'Ikke godkendt'}</dd></div>
                    <div><dt>Versioner</dt><dd>{document.versions.length || 1}</dd></div>
                  </Metadata>
                  {tags.length ? <Tags>{tags.map((tag) => <Tag key={typeof tag === 'string' ? tag : tag.id || tag.label}>{typeof tag === 'string' ? tag : tag.label}</Tag>)}</Tags> : null}
                  <CardActions>
                    {document.latestVersion.download_href ? <DownloadLink as="button" type="button" disabled={downloadMutation.isLoading} onClick={() => downloadMutation.mutate({ href: document.latestVersion.download_href, filename: document.latestVersion.original_filename })}>{downloadMutation.isLoading ? 'Henter…' : 'Download fil'}</DownloadLink> : null}
                    <Button type="button" onClick={() => { setLinkTarget(document); setApprovalTarget(null); setShowCreate(false); linkMutation.reset(); }} aria-controls="document-link-panel">Tilknyt til sag</Button>
                    {canApprove && document.latestVersion.status === 'draft' ? <SecondaryButton type="button" onClick={() => { setApprovalTarget({ document, version: document.latestVersion }); setLinkTarget(null); setShowCreate(false); approvalMutation.reset(); }} aria-controls="document-approval-panel">Godkend version</SecondaryButton> : null}
                  </CardActions>
                </DocumentCard>
              );
            })}
          </Grid>
        ) : null}
      </Section>
    </Page>
  );
}

export default DocumentBankPage;
