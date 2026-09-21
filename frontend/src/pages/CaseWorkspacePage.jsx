import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { formatDocumentDate } from '../features/documents/documentDates';
import {
  Button,
  Card,
  ErrorPanel,
  Eyebrow,
  Field,
  Form,
  Grid,
  HeaderActions,
  Inset,
  Lede,
  List,
  ListItem,
  Metric,
  MetricGrid,
  Page,
  PageHeader,
  ProgressTrack,
  ProgressValue,
  Section,
  SectionHeader,
  StatePanel,
  StatusPill,
  Tab,
  TabList,
  TextLink,
  Title,
  formatDate,
  toArray,
  toneForStatus,
} from '../components/workflow/WorkflowUi';
import { useAuth } from '../contexts/AuthContext';
import TechnicalRunsPanel from '../components/cases/TechnicalRunsPanel';

const TABS = [
  { id: 'overview', label: 'Overblik' },
  { id: 'assessments', label: 'Vurderinger' },
  { id: 'technical-runs', label: 'Teknisk kørsel' },
  { id: 'documents', label: 'Dokumentation' },
  { id: 'measures', label: 'Foranstaltninger' },
  { id: 'approvals', label: 'Godkendelser & historik' },
  { id: 'exports', label: 'Eksport' },
];

const STATUS_LABELS = {
  approved: 'Godkendt',
  approved_with_conditions: 'Godkendt med vilkår',
  changes_requested: 'Sendt tilbage til rettelse',
  rejected: 'Afvist',
  blocked: 'Blokeret',
  pending: 'Afventer godkendelse',
  draft: 'Kladde',
  valid: 'Gyldig',
  completed: 'Afsluttet',
  done: 'Afsluttet',
  in_progress: 'I gang',
  open: 'Åben',
  dismissed: 'Ikke relevant',
  ready_for_review: 'Klar til faglig gennemgang',
  ready_for_legal_review: 'Klar til juridisk gennemgang',
  ready_for_human_decision: 'Klar til menneskelig beslutning',
  requires_action: 'Kræver handling',
  not_required_on_current_facts: 'Ikke påkrævet ud fra de registrerede oplysninger',
  low: 'Lav',
  medium: 'Middel',
  high: 'Høj',
  critical: 'Kritisk',
  kladde: 'Kladde',
  vurderet: 'Vurderet',
  remediation: 'Kræver handling',
  godkendt: 'Godkendt',
  idriftsat: 'Idriftsat',
  arkiveret: 'Arkiveret',
  GO: 'Klar til beslutning',
  'BETINGET-GO': 'Kræver opfølgning',
  'NO-GO': 'Blokeret',
};

const ROLE_LABELS = {
  all_operators: 'alle operatører',
  deployer: 'idriftsætter',
  provider: 'udbyder',
  importer: 'importør',
  distributor: 'distributør',
  product_manufacturer: 'produktfabrikant',
};

function statusLabel(value) {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  const mapped = STATUS_LABELS[raw] || STATUS_LABELS[raw.toLowerCase()];
  if (mapped) return mapped;
  const readable = raw.replace(/_/g, ' ');
  return readable.charAt(0).toLocaleUpperCase('da-DK') + readable.slice(1);
}

function lowerFirst(value) {
  return value ? value.charAt(0).toLocaleLowerCase('da-DK') + value.slice(1) : value;
}

function humanizeDescription(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/Workflowstatus:\s*([a-z_]+)\./gi, (_, status) => `Status: ${statusLabel(status)}.`)
    .replace(/Resterende risiko:\s*([a-z_]+)\./gi, (_, risk) => `Resterende risiko: ${lowerFirst(statusLabel(risk))}.`)
    .replace(/DPIA\s*·\s*([a-z_]+)\s*·\s*([a-z_]+)/gi, (_, status, risk) => `DPIA · ${statusLabel(status)} · risiko: ${lowerFirst(statusLabel(risk))}`)
    .replace(/Auto-transition efter første vurdering \(([^)]+)\)/gi, (_, status) => `Automatisk statusskift efter første vurdering (${lowerFirst(statusLabel(status))})`)
    .replace(/Rolle:\s*([a-z_]+)\./gi, (_, role) => `Rolle: ${ROLE_LABELS[role.toLowerCase()] || role.replace(/_/g, ' ')}.`)
    .replace(/\bArticles\b/g, 'artikler')
    .replace(/\bArticle\b/g, 'artikel');
}

const ContentHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;

  > div:first-child { min-width: 0; }
`;

const Metadata = styled.dl`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 18px 0 0;
  gap: 14px 24px;

  div { min-width: 0; }
  dt {
    color: ${(p) => p.theme.colors.inkFaded};
    font: 620 0.64rem/1.2 ${(p) => p.theme.fonts.sans};
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  dd {
    margin: 5px 0 0;
    color: ${(p) => p.theme.colors.ink};
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }

  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  padding-top: 28px;
`;

const MeasureCard = styled(Card)`
  display: grid;
  gap: 15px;
`;

const MeasureMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  color: ${(p) => p.theme.colors.inkFaded};
  font-size: 0.74rem;
`;

const Timeline = styled.ol`
  position: relative;
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;

  &::before {
    content: '';
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 7px;
    width: 1px;
    background: ${(p) => p.theme.colors.line};
  }
`;

const TimelineItem = styled.li`
  position: relative;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 16px;
  padding: 0 0 24px;

  &::before {
    content: '';
    z-index: 1;
    width: 13px;
    height: 13px;
    margin-top: 5px;
    border: 2px solid ${(p) => p.theme.colors.primary};
    background: ${(p) => p.theme.colors.background};
  }

  strong { font-size: 0.87rem; }
  p { margin: 4px 0 0; color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.8rem; line-height: 1.5; }
  time { display: block; margin-top: 7px; color: ${(p) => p.theme.colors.inkFaded}; font: 0.7rem ${(p) => p.theme.fonts.mono}; }
`;

const ExportCard = styled(Card)`
  display: flex;
  flex-direction: column;
  align-items: start;
  min-height: 190px;

  ${TextLink} { margin-top: auto; padding-top: 18px; }
`;

const WorkflowControls = styled.div`
  display: grid;
  gap: 18px;
  margin-bottom: 28px;
  padding: 22px;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-left: 4px solid ${(p) => p.theme.colors.primary};
  background: ${(p) => p.theme.colors.surface};

  h3 { margin: 0; font-size: 1.08rem; }
  p { margin: 6px 0 0; color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.84rem; line-height: 1.55; }
`;

const ControlRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;

  ${Field} { flex: 1 1 260px; }
`;

const IdentityNote = styled.div`
  padding: 12px 14px;
  background: ${(p) => p.$verified ? p.theme.colors.successSoft : p.theme.colors.warningSoft};
  border-left: 3px solid ${(p) => p.$verified ? p.theme.colors.success : p.theme.colors.warning};
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 0.78rem;
  line-height: 1.5;
`;

const InlineActions = styled.div`
  display: grid;
  gap: 10px;
  padding-top: 4px;

  textarea {
    width: 100%;
    min-height: 76px;
    padding: 10px 12px;
    border: 1px solid ${(p) => p.theme.colors.line};
    border-radius: 0;
    background: ${(p) => p.theme.colors.inputBackground};
    color: ${(p) => p.theme.colors.ink};
    resize: vertical;
  }
`;

const ExampleRunContent = styled.div`
  display: grid;
  gap: 18px;
  p { margin: 0; color: ${(p) => p.theme.colors.inkSoft}; line-height: 1.6; }
  ul { margin: 10px 0 0; padding-left: 22px; }
  li { margin: 8px 0; line-height: 1.5; overflow-wrap: anywhere; }
  details { border-top: 1px solid ${(p) => p.theme.colors.line}; padding-top: 14px; }
  summary { cursor: pointer; font-weight: 620; }
  small { display: block; color: ${(p) => p.theme.colors.inkFaded}; font-size: 0.76rem; }
  ${TextLink} { overflow-wrap: anywhere; }
`;

const Empty = ({ title, children }) => (
  <StatePanel>
    <strong>{title}</strong>
    <p>{children}</p>
  </StatePanel>
);

async function fetchWorkspace(caseId) {
  const response = await axios.get(`/api/v3/cases/${encodeURIComponent(caseId)}/workspace`);
  return response.data;
}

async function requestApproval({ caseId, approvalType, note }) {
  const response = await axios.post(`/api/v3/cases/${encodeURIComponent(caseId)}/approvals`, {
    approval_type: approvalType,
    note: note.trim() || null,
  });
  return response.data;
}

async function decideApproval({ caseId, approvalId, decision, reason, conditions }) {
  const response = await axios.post(
    `/api/v3/cases/${encodeURIComponent(caseId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
    { decision, reason: reason.trim(), conditions },
  );
  return response.data;
}

async function completeMeasure({ caseId, actionId, evidenceNote }) {
  const response = await axios.patch(
    `/api/v3/cases/${encodeURIComponent(caseId)}/actions/${encodeURIComponent(actionId)}`,
    { status: 'completed', evidence_note: evidenceNote.trim() },
  );
  return response.data;
}

async function downloadProtected({ href, filename }) {
  const response = await axios.get(href, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename || 'shield-eksport';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const plainText = value => typeof value === 'string' ? value : '';
const recordList = value => Array.isArray(value) ? value.filter(isRecord) : [];
const safeSourceUrl = value => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch (_) {
    return null;
  }
};
const exampleDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? formatDate(value, true) : 'Ikke dokumenteret';
const RUN_STATUSES = {
  passed: { label: 'Bestået', tone: 'success' },
  blocked: { label: 'Blokeret', tone: 'warning' },
  failed: { label: 'Fejlet', tone: 'danger' },
  not_run: { label: 'Ikke kørt', tone: 'neutral' },
  unknown: { label: 'Ikke dokumenteret', tone: 'neutral' },
};
const runStatus = value => Object.prototype.hasOwnProperty.call(RUN_STATUSES, plainText(value)) ? RUN_STATUSES[value] : RUN_STATUSES.unknown;

export function normalizeWorkspace(payload) {
  const source = payload?.workspace || payload || {};
  const caseRecord = source.case || source.case_record || source;
  const assessmentSource = source.assessments || source.assessment_history || source.latest_assessments;
  const assessments = Array.isArray(assessmentSource)
    ? [...assessmentSource]
    : assessmentSource && typeof assessmentSource === 'object'
      ? Object.entries(assessmentSource).flatMap(([type, items]) => {
          if (type === 'references') return [];
          return toArray(items).map((item) => ({
            ...(['ai_act', 'fria'].includes(type) ? item.details?.result || {} : {}),
            ...item,
            assessment_type: item.assessment_type || type,
          }));
        })
      : [];
  if (!assessments.length && source.assessment) assessments.push(source.assessment);
  if (!assessments.length && source.latest_assessment) assessments.push(source.latest_assessment);

  return {
    caseRecord,
    assessments: assessments.filter(Boolean),
    documents: toArray(source.documents || source.evidence || source.attachments).filter(isRecord).map((item) => ({
      ...(item.document || {}),
      ...(item.version || {}),
      ...item,
      title: item.document?.title || item.title,
      owner: item.document?.owner || item.owner,
      version: item.version?.version_number || item.version_number || item.version,
      metadata: isRecord(item.version?.metadata) ? item.version.metadata : isRecord(item.metadata) ? item.metadata : {},
      download_href: item.version?.download_href || item.download_href,
      valid_until: item.version?.valid_to || item.valid_to || item.valid_until,
      review_at: item.version?.review_at || item.review_at,
    })),
    measures: toArray(source.measures || source.actions || source.mitigations),
    approvals: toArray(source.approvals || source.decisions),
    timeline: toArray(source.timeline || source.transitions || source.history).map((item) => ({
      ...(item.payload || {}),
      ...item,
      created_at: item.occurred_at || item.created_at,
      changed_by: item.actor || item.changed_by,
    })),
    exports: toArray(source.exports || source.export_formats),
    readiness: source.readiness || source.approval_readiness || {},
  };
}

export function ExampleRunPanel({ documents, caseId }) {
  const downloadMutation = useMutation(downloadProtected);
  const runTimestamp = item => {
    const timestamp = Date.parse(plainText(item.metadata.example_run.executed_at));
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const exampleDocument = recordList(documents)
    .filter(item => isRecord(item.metadata?.example_run) && item.metadata.example_run.schema_version === 1)
    .sort((left, right) => runTimestamp(right) - runTimestamp(left))[0];
  if (!exampleDocument) return null;
  const run = exampleDocument.metadata.example_run;
  const steps = recordList(run.steps);
  const sources = recordList(run.sources);
  const assumptions = Array.isArray(run.assumptions) ? run.assumptions.filter(item => typeof item === 'string') : [];
  const checks = recordList(run.jev?.checks);
  const stepStates = steps.map(step => plainText(step.status));
  const overallStatus = run.status === 'failed' || stepStates.includes('failed') ? 'failed'
    : run.status === 'blocked' || stepStates.some(status => ['blocked', 'not_run'].includes(status)) ? 'blocked'
      : run.status === 'passed' && steps.length > 0 && steps.length === run.steps.length && stepStates.every(status => status === 'passed') ? 'passed'
        : 'unknown';
  const overall = runStatus(overallStatus);
  const assessmentId = plainText(run.assessment_id);
  const downloadHref = plainText(exampleDocument.download_href);
  const canDownload = /^\/api\/v3\/documents\/[a-z0-9-]+\/versions\/[a-z0-9-]+\/download$/i.test(downloadHref);

  return (
    <Section aria-labelledby="example-run-title">
      <SectionHeader>
        <div><Eyebrow>Eksempelsag</Eyebrow><h2 id="example-run-title">{plainText(run.title) || 'Dokumenteret eksempelkørsel'}</h2><p>Kørt {exampleDate(run.executed_at)}</p></div>
        <StatusPill $tone={overall.tone}>Samlet test: {overall.label}</StatusPill>
      </SectionHeader>
      <ExampleRunContent>
        {plainText(run.summary) && <p>{run.summary}</p>}
        {steps.length > 0 && (
          <List aria-label="Eksempelkørslens trin">
            {steps.map((step, index) => <ListItem key={`${plainText(step.id)}-${index}`}><div><strong>{plainText(step.label) || `Trin ${index + 1}`}</strong>{plainText(step.detail) && <p>{step.detail}</p>}</div><StatusPill $tone={runStatus(step.status).tone}>{runStatus(step.status).label}</StatusPill></ListItem>)}
          </List>
        )}
        {sources.length > 0 && <div><strong>Offentligt kildegrundlag</strong><ul>{sources.map((source, index) => {
          const url = safeSourceUrl(source.url);
          return <li key={index}>{plainText(source.title) || `Kilde ${index + 1}`}<br />{url ? <TextLink href={url} target="_blank" rel="noreferrer noopener">{url}</TextLink> : <small>Kildeadresse ikke dokumenteret.</small>}<small>Hentet {exampleDate(source.retrieved_at)}</small></li>;
        })}</ul></div>}
        {assumptions.length > 0 && <details><summary>Se forudsætninger og afgrænsning ({assumptions.length})</summary><ul>{assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
        {isRecord(run.jev) && (
          <details>
            <summary>Se JEV-kontrollen</summary>
            {plainText(run.jev.model) && <p>Model: {run.jev.model}</p>}
            <ul>{checks.map((check, index) => (
              <li key={index}>
                <strong>{plainText(check.label) || `Kontrol ${index + 1}`}</strong> · {typeof check.probability === 'number' && Number.isFinite(check.probability) && check.probability >= 0 && check.probability <= 1 ? `${Math.round(check.probability * 100)} % signal om mulig fejl` : 'Signal ikke tilgængeligt'}
                {plainText(check.text) && <p>Påstand: {check.text}</p>}
                {check.expected_requires_review === true && <small>Bevidst fejlagtig testpåstand · forventet: markering til gennemgang.</small>}
                {check.expected_requires_review === false && <small>Forventet: ingen fejl i testpåstanden.</small>}
              </li>
            ))}</ul>
            {plainText(run.jev.note) && <p>{run.jev.note}</p>}
            <p>Et højt signal betyder, at JEV ser en mulig fejl i testpåstanden. Det er ikke juridisk certificering eller en godkendelse af sagen.</p>
          </details>
        )}
        <HeaderActions>
          {assessmentId && plainText(caseId) && <TextLink href={`/vurdering?assessment_id=${encodeURIComponent(assessmentId)}&case=${encodeURIComponent(caseId)}`}>Læs sagens konsekvensanalyse og risikovurdering</TextLink>}
          {canDownload && <Button type="button" disabled={downloadMutation.isLoading} onClick={() => downloadMutation.mutate({ href: downloadHref, filename: plainText(exampleDocument.original_filename) || 'eksempel-testkvittering.txt' })}>{downloadMutation.isLoading ? 'Henter testkvittering…' : 'Hent testkvittering'}</Button>}
        </HeaderActions>
        {downloadMutation.isError && <ErrorPanel role="alert"><strong>Testkvitteringen kunne ikke hentes</strong><p>Prøv at hente filen igen.</p></ErrorPanel>}
      </ExampleRunContent>
    </Section>
  );
}

function itemTitle(item, fallback) {
  const value = item?.project_name || item?.system_name || item?.title || item?.name || item?.label || item?.type || fallback;
  return typeof value === 'string'
    ? value.replace(/^Status:\s*(.+)$/i, (_, status) => `Status: ${statusLabel(status)}`)
    : value;
}

function itemDescription(item) {
  const value = item?.summary || item?.description || item?.note || item?.reason || '';
  return humanizeDescription(value);
}

function OverviewPanel({ workspace }) {
  const { caseRecord, assessments, documents, measures, approvals, readiness } = workspace;
  const completedMeasures = measures.filter((item) => ['done', 'completed', 'afsluttet'].includes(String(item.status || '').toLowerCase())).length;
  const ready = Boolean(readiness.can_request_approval || readiness.can_approve || readiness.can_deploy || readiness.ready);
  const readinessValue = Number(readiness.percent ?? readiness.percentage ?? caseRecord.completion_percent ?? (ready ? 100 : 0));
  const nextAction = readiness.next_action || toArray(readiness.blockers)[0] || caseRecord.next_action || 'Færdiggør vurderingen og dokumentér de åbne foranstaltninger.';
  const latestApprover = approvals.find((item) => item.decided_by)?.decided_by;

  return (
    <Panel id="case-panel-overview" role="tabpanel" aria-labelledby="case-tab-overview">
      <ExampleRunPanel documents={documents} caseId={caseRecord.id} />
      <MetricGrid>
        <Metric><span>Vurderinger</span><strong>{assessments.length}</strong></Metric>
        <Metric><span>Dokumenter</span><strong>{documents.length}</strong></Metric>
        <Metric><span>Foranstaltninger</span><strong>{completedMeasures}/{measures.length}</strong></Metric>
        <Metric><span>Godkendelser</span><strong>{approvals.length}</strong></Metric>
      </MetricGrid>

      <Section>
        <SectionHeader>
          <div><h2>Næste handling</h2><p>S.H.I.E.L.D. samler det, der mangler, før sagen kan gå videre.</p></div>
          <StatusPill $tone={ready ? 'success' : 'warning'}>{ready ? 'Klar' : 'Kræver handling'}</StatusPill>
        </SectionHeader>
        <Inset $accent={ready ? undefined : '#b08a4a'}>
          <strong>{nextAction}</strong>
          {readinessValue > 0 ? (
            <>
              <p>{Math.round(readinessValue)} % af beslutningsgrundlaget er dokumenteret.</p>
              <ProgressTrack aria-label={`${Math.round(readinessValue)} procent færdig`}>
                <ProgressValue $value={readinessValue} />
              </ProgressTrack>
            </>
          ) : null}
        </Inset>
      </Section>

      <Section>
        <SectionHeader><div><h2>Sagens stamdata</h2><p>Fælles kontekst, som genbruges på tværs af vurderinger.</p></div></SectionHeader>
        <Grid $columns={2}>
          <Card>
            <h3>Ansvar og opfølgning</h3>
            <Metadata>
              <div><dt>Ansvarlig</dt><dd>{caseRecord.assigned_to || caseRecord.owner || 'Ikke tildelt'}</dd></div>
              <div><dt>Godkender</dt><dd>{caseRecord.approver || caseRecord.approver_role || latestApprover || 'Ikke tildelt'}</dd></div>
              <div><dt>Næste opfølgning</dt><dd>{formatDate(caseRecord.next_review_at || caseRecord.review_date)}</dd></div>
              <div><dt>Senest ændret</dt><dd>{formatDate(caseRecord.updated_at, true)}</dd></div>
            </Metadata>
          </Card>
          <Card>
            <h3>Formål og afgrænsning</h3>
            <p>{caseRecord.description || caseRecord.notes || caseRecord.scope || 'Sagens formål og afgrænsning er ikke beskrevet endnu.'}</p>
          </Card>
        </Grid>
      </Section>
    </Panel>
  );
}

export function AssessmentsPanel({ assessments }) {
  return (
    <Panel id="case-panel-assessments" role="tabpanel" aria-labelledby="case-tab-assessments">
      <SectionHeader data-tour="case-assessments"><div><h2>Vurderinger</h2><p>Alle vurderinger vises med resultat, version og tidspunkt.</p></div></SectionHeader>
      {assessments.length ? (
        <List>
          {assessments.map((item, index) => {
            const status = item.aggregate_status || item.status || item.result || 'Kladde';
            const isDpia = ['dpia', 'dpia_assessment'].includes(item.type || item.assessment_type);
            const dpiaHref = isDpia && item.id ? `/vurdering?assessment_id=${encodeURIComponent(item.id)}${item.case_db_id ? `&case=${encodeURIComponent(item.case_db_id)}` : ''}` : null;
            const href = dpiaHref || item.url || item.href || (item.audit_log_id ? `/historik/${item.audit_log_id}` : item.type === 'legal_screening' || item.assessment_type === 'legal_screening' ? `/historik/${item.id}` : null);
            return (
              <ListItem key={item.id || item.audit_log_id || `${itemTitle(item, 'Vurdering')}-${index}`}>
                <div>
                  <strong>{itemTitle(item, `Vurdering ${index + 1}`)}</strong>
                  <p>{itemDescription(item) || `Gennemført ${formatDate(item.created_at || item.completed_at, true)}.`}</p>
                  <p>Version {item.version || 1}{isDpia ? ' · Konsekvensanalyse og risikovurdering' : ''}</p>
                  {href ? <TextLink href={href}>{isDpia ? 'Læs analyse og hent Word / Excel' : 'Åbn låst vurdering'} <span aria-hidden="true">→</span></TextLink> : null}
                </div>
                <StatusPill $tone={toneForStatus(status)}>{statusLabel(status)}</StatusPill>
              </ListItem>
            );
          })}
        </List>
      ) : <Empty title="Ingen vurderinger endnu">Start en DPIA-, AI Act- eller juridisk vurdering fra sagen.</Empty>}
    </Panel>
  );
}

function DocumentsPanel({ documents }) {
  const downloadMutation = useMutation(downloadProtected);
  return (
    <Panel id="case-panel-documents" role="tabpanel" aria-labelledby="case-tab-documents">
      <SectionHeader data-tour="case-documents"><div><h2>Dokumentation og evidens</h2><p>Dokumenter er versionsstyrede, så godkenderen kan se det præcise grundlag.</p></div></SectionHeader>
      {documents.length ? (
        <List>
          {documents.map((item, index) => (
            <ListItem key={item.id || `${itemTitle(item, 'Dokument')}-${index}`}>
              <div>
                <strong>{itemTitle(item, `Dokument ${index + 1}`)}</strong>
                <p>{itemDescription(item) || `${item.document_type || item.category || 'Dokument'} · version ${item.version || '1'}`}</p>
                <Metadata>
                  <div><dt>Ejer</dt><dd>{item.owner || 'Ikke angivet'}</dd></div>
                  <div><dt>Næste dokumentgennemgang</dt><dd>{formatDocumentDate(item.review_at || item.valid_until || item.expires_at)}</dd></div>
                </Metadata>
                {item.download_href ? (
                  <Button
                    type="button"
                    disabled={downloadMutation.isLoading}
                    onClick={() => downloadMutation.mutate({ href: item.download_href, filename: item.original_filename || item.title })}
                  >
                    {downloadMutation.isLoading ? 'Henter…' : 'Hent denne version'}
                  </Button>
                ) : null}
              </div>
              <StatusPill $tone={item.verified || ['valid', 'approved'].includes(item.status) ? 'success' : 'neutral'}>{statusLabel(item.status || (item.verified ? 'Verificeret' : 'Registreret'))}</StatusPill>
            </ListItem>
          ))}
        </List>
      ) : <Empty title="Intet dokumenteret grundlag">Tilknyt databehandleraftaler, sikkerhedsbeskrivelser og anden evidens fra dokumentbanken.</Empty>}
      {downloadMutation.isError ? <ErrorPanel role="alert"><strong>Dokumentet kunne ikke hentes</strong><p>{String(downloadMutation.error?.response?.data?.detail || downloadMutation.error?.message)}</p></ErrorPanel> : null}
    </Panel>
  );
}

function MeasuresPanel({ measures, completeMutation }) {
  const [evidenceNotes, setEvidenceNotes] = useState({});
  return (
    <Panel id="case-panel-measures" role="tabpanel" aria-labelledby="case-tab-measures">
      <SectionHeader><div><h2>Foranstaltninger</h2><p>Restrisici omsættes til opgaver med ejer, frist og evidens.</p></div></SectionHeader>
      {measures.length ? (
        <Grid $columns={2}>
          {measures.map((item, index) => {
            const status = item.status || 'Åben';
            const isClarification = item.source_reference_type === 'procurement_clarification';
            const description = isClarification ? itemDescription(item).replace(/\n(?:Analyse|Spørgsmål):[^\n]*/g, '') : itemDescription(item);
            const evidenceNote = evidenceNotes[item.id] ?? item.evidence_note ?? '';
            return (
              <MeasureCard key={item.id || `${itemTitle(item, 'Foranstaltning')}-${index}`}>
                <ContentHeader>
                  <div><h3>{itemTitle(item, `Foranstaltning ${index + 1}`)}</h3><p>{description}</p></div>
                  <StatusPill $tone={toneForStatus(status)}>{statusLabel(status)}</StatusPill>
                </ContentHeader>
                <MeasureMeta>
                  <span>Ansvarlig: {item.owner || item.assigned_to || 'Ikke tildelt'}</span>
                  <span>Frist: {formatDate(item.due_at || item.due_date || item.deadline)}</span>
                  <span>Evidens: {toArray(item.evidence || item.documents).length}</span>
                </MeasureMeta>
                {item.evidence_note && <Inset><strong>{isClarification ? 'Dokumenteret afklaring' : 'Evidens'}</strong><p>{item.evidence_note}</p></Inset>}
                {!['done', 'completed', 'afsluttet', 'dismissed'].includes(String(status).toLowerCase()) ? (
                  <InlineActions>
                    <label htmlFor={`measure-evidence-${item.id}`}>Dokumentation for udført handling</label>
                    <textarea
                      id={`measure-evidence-${item.id}`}
                      value={evidenceNote}
                      onChange={(event) => setEvidenceNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Beskriv kontrollen, testresultatet eller den version af dokumentationen, der beviser udførelsen…"
                    />
                    <Button
                      type="button"
                      disabled={completeMutation.isLoading || evidenceNote.trim().length < (isClarification ? 20 : 5)}
                      onClick={() => completeMutation.mutate({ actionId: item.id, evidenceNote })}
                    >
                      {completeMutation.isLoading && completeMutation.variables?.actionId === item.id ? 'Gemmer…' : 'Markér afsluttet'}
                    </Button>
                    {isClarification && <small>Afslutning kræver et dokumenteret svar på mindst 20 tegn.</small>}
                  </InlineActions>
                ) : null}
              </MeasureCard>
            );
          })}
        </Grid>
      ) : <Empty title="Ingen foranstaltninger">Når en vurdering finder en risiko, skal den omsættes til en konkret handling her.</Empty>}
      {completeMutation.isError ? <ErrorPanel role="alert"><strong>Foranstaltningen kunne ikke afsluttes</strong><p>{String(completeMutation.error?.response?.data?.detail || completeMutation.error?.message)}</p></ErrorPanel> : null}
    </Panel>
  );
}

function ApprovalsPanel({ approvals, timeline, readiness, caseRecord, user, canApprove, requestMutation, decisionMutation }) {
  const [requestNote, setRequestNote] = useState('');
  const [decision, setDecision] = useState('approved');
  const [reason, setReason] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const pendingApproval = approvals.find((item) => item.status === 'pending');
  const caseStatus = String(caseRecord.status || '').toLowerCase();
  const approvalType = caseStatus === 'godkendt' ? 'deployment' : 'case';
  const requestStageIsOpen = approvalType === 'deployment'
    ? caseStatus === 'godkendt'
    : ['vurderet', 'remediation'].includes(caseStatus);
  const canRequest = requestStageIsOpen && (approvalType === 'deployment'
    ? Boolean(readiness.can_deploy && !pendingApproval)
    : Boolean(readiness.can_request_approval));
  const conditions = conditionsText.split('\n').map((item) => item.trim()).filter(Boolean);
  const decisionValid = reason.trim().length >= 20 && (decision !== 'approved_with_conditions' || conditions.length > 0);
  const verifiedIdentity = user?.identityAssurance === 'verified_entra_token';
  const nonApprovalTimeline = timeline.filter((item) => !String(item.event_type || '').startsWith('approval_'));
  const entries = [...approvals.map((item) => ({ ...item, _entryType: 'approval', created_at: item.decided_at || item.requested_at })), ...nonApprovalTimeline.map((item) => ({ ...item, _entryType: 'timeline' }))]
    .sort((a, b) => new Date(b.created_at || b.changed_at || 0) - new Date(a.created_at || a.changed_at || 0));

  return (
    <Panel id="case-panel-approvals" role="tabpanel" aria-labelledby="case-tab-approvals">
      <SectionHeader><div><h2>Godkendelser og historik</h2><p>Beslutninger, statusskift og begrundelser bevares i ét revisionsspor.</p></div></SectionHeader>
      <WorkflowControls>
        <div>
          <h3>{pendingApproval ? 'Godkendelsesopgave' : 'Næste beslutning'}</h3>
          <p>{readiness.next_action || 'S.H.I.E.L.D. kontrollerer vurderinger og åbne handlinger, før sagen kan sendes videre.'}</p>
        </div>
        {canRequest || pendingApproval ? (
          <IdentityNote $verified={verifiedIdentity}>
            {verifiedIdentity
              ? `Beslutningen signeres med verificeret Microsoft Entra ID for ${user?.name || 'den aktuelle bruger'}.`
              : 'Identiteten er ikke Entra-signeret i denne installation. Beslutningen skal bekræftes med Entra ID før produktionsbrug.'}
          </IdentityNote>
        ) : caseStatus === 'idriftsat' ? (
          <StatePanel><strong>Sagen er idriftsat</strong><p>Næste formelle beslutning træffes ved opfølgning {formatDate(caseRecord.next_review_at || caseRecord.review_date)} eller ved en væsentlig ændring.</p></StatePanel>
        ) : null}

        {canRequest ? (
          <Form onSubmit={(event) => { event.preventDefault(); requestMutation.mutate({ approvalType, note: requestNote }); }}>
            <Field>
              <label htmlFor="approval-request-note">Bemærkning til godkenderen</label>
              <textarea id="approval-request-note" value={requestNote} onChange={(event) => setRequestNote(event.target.value)} placeholder="Fremhæv fx de vigtigste kontroller, antagelser eller forhold, godkenderen skal tage stilling til…" />
            </Field>
            <ControlRow>
              <Button type="submit" disabled={requestMutation.isLoading}>
                {requestMutation.isLoading ? 'Sender…' : approvalType === 'deployment' ? 'Send idriftsættelse til godkendelse' : 'Send sagen til godkendelse'}
              </Button>
            </ControlRow>
          </Form>
        ) : null}

        {pendingApproval && canApprove ? (
          <Form onSubmit={(event) => {
            event.preventDefault();
            decisionMutation.mutate({ approvalId: pendingApproval.id, decision, reason, conditions });
          }}>
            <ControlRow>
              <Field>
                <label htmlFor="approval-decision">Beslutning</label>
                <select id="approval-decision" value={decision} onChange={(event) => setDecision(event.target.value)}>
                  <option value="approved">Godkend</option>
                  <option value="approved_with_conditions">Godkend med vilkår</option>
                  <option value="changes_requested">Send tilbage til rettelse</option>
                  <option value="rejected">Afvis</option>
                </select>
              </Field>
            </ControlRow>
            <Field>
              <label htmlFor="approval-reason">Begrundelse</label>
              <textarea id="approval-reason" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={20} placeholder="Beskriv den faglige begrundelse og det materiale, beslutningen bygger på…" />
              <small>Mindst 20 tegn. Begrundelsen bevares i revisionssporet.</small>
            </Field>
            {decision === 'approved_with_conditions' ? (
              <Field>
                <label htmlFor="approval-conditions">Vilkår – ét pr. linje</label>
                <textarea id="approval-conditions" value={conditionsText} onChange={(event) => setConditionsText(event.target.value)} required placeholder="Dokumentér slettekontrol før idriftsættelse\nGodkend underdatabehandlerlisten" />
                <small>Hvert vilkår oprettes automatisk som en blokerende foranstaltning.</small>
              </Field>
            ) : null}
            <ControlRow>
              <Button type="submit" disabled={decisionMutation.isLoading || !decisionValid}>{decisionMutation.isLoading ? 'Gemmer beslutning…' : 'Afgiv og signér beslutning'}</Button>
            </ControlRow>
          </Form>
        ) : null}

        {pendingApproval && !canApprove ? <StatePanel><strong>Afventer godkender</strong><p>En bruger med rollen Godkender, DPO eller Administrator skal logge ind og afgive en begrundet beslutning.</p></StatePanel> : null}
        {!canRequest && !pendingApproval && toArray(readiness.blockers).length ? (
          <Inset $accent="#b08a4a"><strong>Før sagen kan sendes videre</strong><ul>{toArray(readiness.blockers).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></Inset>
        ) : null}
        {requestMutation.isError || decisionMutation.isError ? <ErrorPanel role="alert"><strong>Godkendelsesflowet kunne ikke gennemføres</strong><p>{String((requestMutation.error || decisionMutation.error)?.response?.data?.detail?.message || (requestMutation.error || decisionMutation.error)?.response?.data?.detail || (requestMutation.error || decisionMutation.error)?.message)}</p></ErrorPanel> : null}
      </WorkflowControls>
      {entries.length ? (
        <Timeline>
          {entries.map((item, index) => (
            <TimelineItem key={item.id || `${item._entryType}-${index}`}>
              <div>
                <strong>{item._entryType === 'approval' ? `Godkendelse: ${statusLabel(item.status)}` : itemTitle(item, 'Status ændret')}</strong>
                <p>{itemDescription(item) || `${item.from_status || ''}${item.from_status ? ' → ' : ''}${item.to_status || item.status || ''}`}</p>
                <time dateTime={item.created_at || item.changed_at}>{formatDate(item.created_at || item.changed_at, true)} · {item.decided_by || item.requested_by || item.changed_by || item.actor || 'System'}</time>
                {item._entryType === 'approval' && item.decided_at ? <StatusPill $tone={item.is_identity_verified ? 'success' : 'warning'}>{item.is_identity_verified ? 'Entra-verificeret' : 'Ikke Entra-signeret'}</StatusPill> : null}
              </div>
            </TimelineItem>
          ))}
        </Timeline>
      ) : <Empty title="Ingen beslutninger endnu">Når sagen skifter status eller godkendes, vises begrundelsen her.</Empty>}
    </Panel>
  );
}

function ExportsPanel({ exports: exportItems }) {
  const downloadMutation = useMutation(downloadProtected);
  return (
    <Panel id="case-panel-exports" role="tabpanel" aria-labelledby="case-tab-exports">
      <SectionHeader data-tour="case-exports"><div><h2>Eksportér beslutningsgrundlaget</h2><p>Eksporten skal være et låst øjebliksbillede med vurderinger, kilder og godkendelser.</p></div></SectionHeader>
      {exportItems.length ? (
        <Grid $columns={3}>
          {exportItems.map((item, index) => (
            <ExportCard key={item.id || `${itemTitle(item, 'Eksport')}-${index}`}>
              <h3>{itemTitle(item, item.format || `Eksport ${index + 1}`)}</h3>
              <p>{itemDescription(item) || 'Hent den dokumenterede sagsversion.'}</p>
              {item.url || item.href ? (
                <Button
                  type="button"
                  disabled={downloadMutation.isLoading}
                  onClick={() => downloadMutation.mutate({
                    href: item.url || item.href,
                    filename: item.download_name || `shield-${item.type || 'eksport'}.${item.format || 'json'}`,
                  })}
                >
                  {downloadMutation.isLoading ? 'Henter…' : 'Hent fil ↓'}
                </Button>
              ) : <StatusPill $tone="neutral">Ikke klar</StatusPill>}
            </ExportCard>
          ))}
        </Grid>
      ) : <Empty title="Ingen eksport klar">Eksport bliver tilgængelig, når sagen har et dokumenteret vurderingsgrundlag.</Empty>}
      {downloadMutation.isError ? <ErrorPanel role="alert"><strong>Eksporten kunne ikke hentes</strong><p>{String(downloadMutation.error?.response?.data?.detail || downloadMutation.error?.message)}</p></ErrorPanel> : null}
    </Panel>
  );
}

function CaseWorkspacePage() {
  const params = useParams();
  const caseId = params.caseId || params.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = TABS.some(tab => tab.id === requestedTab) ? requestedTab : 'overview';
  const backToCases = searchParams.get('from') === 'examples' ? '/sager?examples=1' : '/sager';
  const selectTab = tabId => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tabId);
    setSearchParams(nextParams);
  };
  const queryClient = useQueryClient();
  const { user, hasRole } = useAuth();
  const query = useQuery(['case-workspace', caseId], () => fetchWorkspace(caseId), {
    enabled: Boolean(caseId),
  });
  const refreshWorkspace = () => Promise.all([
    queryClient.invalidateQueries(['case-workspace', caseId]),
    queryClient.invalidateQueries('case-overview'),
    queryClient.invalidateQueries('v3-cases'),
  ]);
  const requestMutation = useMutation(
    ({ approvalType, note }) => requestApproval({ caseId, approvalType, note }),
    { onSuccess: refreshWorkspace },
  );
  const decisionMutation = useMutation(
    ({ approvalId, decision, reason, conditions }) => decideApproval({ caseId, approvalId, decision, reason, conditions }),
    { onSuccess: refreshWorkspace },
  );
  const completeMutation = useMutation(
    ({ actionId, evidenceNote }) => completeMeasure({ caseId, actionId, evidenceNote }),
    { onSuccess: refreshWorkspace },
  );
  const workspace = useMemo(() => normalizeWorkspace(query.data), [query.data]);
  const caseRecord = workspace.caseRecord;
  const status = caseRecord.status_label || caseRecord.status || 'Kladde';

  const changeTab = (event, nextId) => {
    const index = TABS.findIndex((tab) => tab.id === nextId);
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[nextIndex].id);
    document.getElementById(`case-tab-${TABS[nextIndex].id}`)?.focus();
  };

  if (!caseId) {
    return <Page><ErrorPanel role="alert"><strong>Sagen kunne ikke åbnes</strong><p>Ruten mangler et sags-ID. Gå tilbage til sagsoversigten og vælg sagen igen.</p></ErrorPanel></Page>;
  }

  if (query.isLoading) {
    return <Page><StatePanel role="status" aria-live="polite"><strong>Samler sagen…</strong><p>Vurderinger, dokumenter og beslutningshistorik hentes.</p></StatePanel></Page>;
  }

  if (query.isError) {
    return (
      <Page>
        <ErrorPanel role="alert">
          <strong>Sagen kunne ikke hentes</strong>
          <p>{String(query.error?.response?.data?.detail || query.error?.message || 'Ukendt fejl')}</p>
          <Button type="button" onClick={() => query.refetch()}>Prøv igen</Button>
        </ErrorPanel>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader $stacked>
        <div>
          <Eyebrow>S.H.I.E.L.D. · samlet sag · {caseRecord.case_id || caseId}</Eyebrow>
          <Title>{caseRecord.title || caseRecord.name || 'Sag uden titel'}</Title>
          <Lede>{caseRecord.description || caseRecord.notes || 'Følg hele beslutningsprocessen fra første vurdering til godkendelse, drift og senere opfølgning.'}</Lede>
        </div>
        <HeaderActions>
          <StatusPill $tone={toneForStatus(status)}>{status}</StatusPill>
          {query.data?.procurement && <Button as={Link} to={`/anskaffelse?case=${encodeURIComponent(caseId)}&step=materials`}>AI-løsning og leverandørmateriale</Button>}
          <Button as={Link} to={`/vurdering?case=${encodeURIComponent(caseId)}`}>Ny konsekvensanalyse</Button>
          <Button as={Link} to={`/juridisk-screening?case=${encodeURIComponent(caseId)}`}>Juridisk screening</Button>
          <Button as={Link} to={`/ai-act-vurdering?case_id=${encodeURIComponent(caseId)}`}>AI Act</Button>
          <Button as={Link} to={`/grundrettigheder?case_id=${encodeURIComponent(caseId)}`}>Grundrettigheder</Button>
          <Button as={Link} to={`/dokumentbank?case_id=${encodeURIComponent(caseId)}`}>Dokumentbank</Button>
          <Link to={backToCases}>← Tilbage til sager</Link>
        </HeaderActions>
      </PageHeader>

      <TabList role="tablist" aria-label="Sagens indhold">
        {TABS.map((tab) => (
          <Tab
            key={tab.id}
            id={`case-tab-${tab.id}`}
            type="button"
            role="tab"
            $active={activeTab === tab.id}
            aria-selected={activeTab === tab.id}
            aria-controls={`case-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => changeTab(event, tab.id)}
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>

      {activeTab === 'overview' ? <OverviewPanel workspace={workspace} /> : null}
      {activeTab === 'assessments' ? <AssessmentsPanel assessments={workspace.assessments} /> : null}
      {activeTab === 'technical-runs' ? <TechnicalRunsPanel caseId={caseId} /> : null}
      {activeTab === 'documents' ? <DocumentsPanel documents={workspace.documents} /> : null}
      {activeTab === 'measures' ? <MeasuresPanel measures={workspace.measures} completeMutation={completeMutation} /> : null}
      {activeTab === 'approvals' ? (
        <ApprovalsPanel
          approvals={workspace.approvals}
          timeline={workspace.timeline}
          readiness={workspace.readiness}
          caseRecord={workspace.caseRecord}
          user={user}
          canApprove={hasRole('Hammeren.Godkender', 'Hammeren.DPO', 'Hammeren.Admin')}
          requestMutation={requestMutation}
          decisionMutation={decisionMutation}
        />
      ) : null}
      {activeTab === 'exports' ? <ExportsPanel exports={workspace.exports} /> : null}
    </Page>
  );
}

export default CaseWorkspacePage;
