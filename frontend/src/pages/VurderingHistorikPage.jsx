import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useQuery } from 'react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { filterNoiseWarnings } from '../utils/warnings';
import DataOverview from '../components/data-overview/DataOverview';
import AssessmentHistorySection from '../components/assessment/AssessmentHistorySection';
import {
  ComplianceVerdict,
  EvidenceChecklist,
  SidenotesColumn,
  toSuperscript,
} from '../components/rules';

/**
 * VurderingHistorikPage — Design C historik over /api/v3/audit.
 *
 * Two modes selected by route:
 *   /historik         → list of recent assessments (table)
 *   /historik/:id     → detail view of one assessment (mirrors result-mode
 *                       in V3VurderingPage but reading from audit log)
 *
 * The audit log is append-only — no edit, no delete. Filtering by case_id
 * and aggregate_status happens server-side via query params.
 */

// ---- API ----------------------------------------------------------------

async function fetchAuditList({ queryKey }) {
  const [, { limit, status, caseId }] = queryKey;
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (status) params.set('status', status);
  if (caseId) params.set('case_id', caseId);
  const qs = params.toString();
  const url = `/api/v3/audit${qs ? `?${qs}` : ''}`;
  const res = await axios.get(url);
  return res.data;
}

async function fetchAuditDetail(id) {
  const res = await axios.get(`/api/v3/audit/${id}`);
  return res.data;
}

// ---- Helpers ------------------------------------------------------------

const formatDanishDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
};

const formatDanishDateTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('da-DK', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const STATUS_LABELS = {
  GO: 'Ingen blokeringer',
  'BETINGET-GO': 'Kræver handling',
  'NO-GO': 'Blokeret',
  NEEDS_INPUT: 'Mangler oplysninger',
};
const statusLabel = (s) => {
  const key = String(s || '').toUpperCase();
  return STATUS_LABELS[key] || s || '—';
};

const verdictTone = (theme, status) => {
  const key = String(status || '').toUpperCase();
  if (key === 'GO') {
    return { background: theme.colors.successSoft, border: theme.colors.success };
  }
  if (key === 'BETINGET-GO') {
    return { background: theme.colors.warningSoft, border: theme.colors.warning };
  }
  if (key === 'NO-GO') {
    return { background: theme.colors.dangerSoft, border: theme.colors.danger };
  }
  return { background: theme.colors.surfaceAlt, border: theme.colors.border };
};

const deriveTitle = (description, caseId) => {
  if (description) {
    const first = description.split(/\.|\n/)[0].trim();
    if (first.length > 0 && first.length < 120) {
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
  }
  return caseId ? `Vurdering ${caseId}` : 'Vurdering';
};

const ruleHumanTitle = (decision) => {
  if (decision?.kilde?.artikel) {
    return `${decision.kilde.lov ? decision.kilde.lov + ' — ' : ''}${decision.kilde.artikel}`;
  }
  return decision?.rule_id || 'Ukendt regel';
};

// Drop infrastructure noise from warnings displayed — see ../utils/warnings.

// ---- Layout shell -------------------------------------------------------

const Page = styled.div`
  max-width: 1320px;
  margin: 0 auto;
  padding: clamp(2.75rem, 6vw, 4.75rem) 20px 6rem;

  @media (max-width: 520px) {
    padding-right: 14px;
    padding-left: 14px;
  }
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-bottom: 0.6rem;
  font-weight: 600;
`;

const Title = styled.h1`
  overflow-wrap: anywhere;
  font-family: ${(p) => p.theme.fonts.display};
  font-size: clamp(2.5rem, 5vw, 4.25rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 0.98;
  margin: 0 0 0.85rem;
  color: ${(p) => p.theme.colors.ink};
`;

const Lede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  margin: 0 0 2rem;
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 1.05rem;
  line-height: 1.65;
  max-width: 720px;
`;

const Shell = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 350px);
  column-gap: clamp(2rem, 5vw, 4rem);

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    column-gap: 0;
  }
`;

const Doc = styled.article`
  max-width: 780px;
  min-width: 0;
`;

// ---- List mode: filter + table -----------------------------------------

const FilterRow = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
`;

const FilterChip = styled.button`
  background: ${(p) =>
    p.$active ? p.theme.colors.primaryBg : p.theme.colors.card};
  color: ${(p) => (p.$active ? p.theme.colors.primary : p.theme.colors.inkSoft)};
  border: 1px solid ${(p) =>
    p.$active ? p.theme.colors.primary : p.theme.colors.line};
  padding: 0.5rem 0.8rem;
  border-radius: 0;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color ${(p) => p.theme.animations.transitionFast};

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.primary};
    outline-offset: 2px;
  }
`;

const Table = styled.div`
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 0;
  overflow: hidden;
`;

const TableHead = styled.div`
  display: grid;
  grid-template-columns: minmax(140px, 160px) minmax(260px, 1.4fr) minmax(150px, auto) minmax(160px, 0.8fr);
  gap: clamp(0.75rem, 2vw, 1.5rem);
  padding: 0.75rem 1rem;
  background: ${(p) => p.theme.colors.paperSoft};
  border-bottom: 1px solid ${(p) => p.theme.colors.line};
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.inkFaded};
  font-weight: 600;

  @media (max-width: 720px) {
    display: none;
  }
`;

const Row = styled(Link)`
  display: grid;
  grid-template-columns: minmax(140px, 160px) minmax(260px, 1.4fr) minmax(150px, auto) minmax(160px, 0.8fr);
  gap: clamp(0.75rem, 2vw, 1.5rem);
  padding: 0.9rem 1rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
  text-decoration: none;
  color: ${(p) => p.theme.colors.ink};
  transition: background ${(p) => p.theme.animations.transitionFast};
  align-items: center;

  &:last-child { border-bottom: none; }

  &:hover {
    background: ${(p) => p.theme.colors.paperSoft};
    color: ${(p) => p.theme.colors.ink};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.primary};
    outline-offset: -2px;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 0.8rem 0.9rem;
  }
`;

const Cell = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;
  color: ${(p) => p.theme.colors.ink};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
    padding: 0.42rem 0;
    overflow: visible;
    white-space: normal;

    &::before {
      content: attr(data-label);
      font-family: ${(p) => p.theme.fonts.mono};
      font-size: 0.64rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      line-height: 1.45;
      text-transform: uppercase;
      color: ${(p) => p.theme.colors.inkFaded};
    }

    .cell-value {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }
`;

const CellDate = styled(Cell)`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.78rem;
  color: ${(p) => p.theme.colors.inkSoft};
  letter-spacing: 0.02em;
`;

const CellCase = styled(Cell)`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.inkSoft};
  letter-spacing: 0.04em;
`;

const CellNote = styled(Cell)`
  font-family: ${(p) => p.theme.fonts.body};
  color: ${(p) => p.theme.colors.inkSoft};
  font-style: italic;
`;

const EmptyState = styled.div`
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px dashed ${(p) => p.theme.colors.line};
  border-radius: 0;
  padding: 3rem;
  text-align: center;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  font-style: italic;
`;

const LoadingRow = styled.div`
  padding: 1rem 1.2rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.85rem;
  color: ${(p) => p.theme.colors.inkFaded};
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
`;

const ResultMeta = styled.p`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.85rem;
  color: ${(p) => p.theme.colors.inkSoft};
  margin: 0.5rem 0 1.5rem;
`;

// ---- Detail mode (case-focused, mirrors V3VurderingPage result-mode) ----

const BackLink = styled.button`
  display: inline-block;
  font-family: ${(p) => p.theme.fonts.sans};
  margin-bottom: 1.5rem;
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.inkSoft};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  &:hover { color: ${(p) => p.theme.colors.ink}; }
`;

const Breadcrumb = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-bottom: 1.5rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;

  span.crumb-sep { color: ${(p) => p.theme.colors.borderSoft}; }
  span.crumb-current { color: ${(p) => p.theme.colors.inkSoft}; }
`;

const CaseId = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  color: ${(p) => p.theme.colors.inkFaded};
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 0.6rem;
`;

const CaseTitle = styled.h1`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  margin: 0 0 0.65rem;
  color: ${(p) => p.theme.colors.ink};
`;

const CaseMeta = styled.p`
  font-family: ${(p) => p.theme.fonts.sans};
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 0.92rem;
  margin: 0 0 1.75rem;
  line-height: 1.55;
`;

const VerdictBanner = styled.div`
  background: ${({ theme, $status }) => verdictTone(theme, $status).background};
  border: 1px solid ${({ theme, $status }) => verdictTone(theme, $status).border};
  border-left-width: 4px;
  border-radius: 0;
  padding: 1rem 1.2rem;
  margin: 1.5rem 0 2.25rem;
`;

const VerdictHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.65rem;
`;

const VerdictText = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1.05rem;
  color: ${(p) => p.theme.colors.ink};
  line-height: 1.5;
`;

const SectionH = styled.h2`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.7rem;
  font-weight: 600;
  letter-spacing: -0.012em;
  margin: 3rem 0 0.4rem;
  color: ${(p) => p.theme.colors.ink};
`;

const SectionLede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  font-style: italic;
  color: ${(p) => p.theme.colors.inkSoft};
  margin: 0 0 1.5rem;
  line-height: 1.55;
`;

const Rule = styled.div`
  padding: 1.6rem 0;
  border-top: 1px solid ${(p) => p.theme.colors.line};

  &:last-child { border-bottom: 1px solid ${(p) => p.theme.colors.line}; }
`;

const RuleHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.85rem;

  @media (max-width: 520px) {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.65rem;
  }
`;

const RuleMarker = styled.span`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${(p) => p.theme.colors.primary};
  font-weight: 700;
`;

const RuleTitle = styled.h3`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.012em;
  line-height: 1.3;
  margin: 0 0 1rem;
  color: ${(p) => p.theme.colors.ink};
`;

const FootnoteRef = styled.a`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.primary};
  text-decoration: none;
  margin-left: 2px;
  vertical-align: super;
  line-height: 1;

  &:hover { text-decoration: underline; }
`;

const RuleBody = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1.06rem;
  line-height: 1.7;
  color: ${(p) => p.theme.colors.ink};
  margin: 0 0 1rem;
`;

const KravBlock = styled.div`
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 6px;
  padding: 1.1rem 1.4rem;
  margin-top: 1rem;
`;

const KravHeader = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${(p) => p.theme.colors.inkFaded};
  font-weight: 600;
  margin-bottom: 0.7rem;
`;

const KravList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const KravItem = styled.li`
  display: grid;
  grid-template-columns: 1.1rem 1fr;
  gap: 0.55rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;
  line-height: 1.55;
  color: ${(p) => p.theme.colors.ink};
  padding: 0.3rem 0;

  &::before {
    content: '§';
    font-family: ${(p) => p.theme.fonts.display};
    color: ${(p) => p.theme.colors.primary};
    font-weight: 700;
    font-size: 1rem;
  }
`;

const Warnings = styled.div`
  background: rgba(184, 134, 11, 0.08);
  border-left: 3px solid ${(p) => p.theme.colors.warning};
  border-radius: 0 6px 6px 0;
  padding: 0.85rem 1.1rem;
  margin-bottom: 2rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.inkSoft};

  strong { color: ${(p) => p.theme.colors.ink}; }
  ul { margin: 0.4rem 0 0; padding-left: 1.25rem; }
`;

const AuditFootnote = styled.div`
  margin-top: 3rem;
  padding: 1.1rem 1.3rem;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 0;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.inkSoft};
  line-height: 1.85;

  b { color: ${(p) => p.theme.colors.ink}; font-weight: 600; }
`;

// ---- List mode component ------------------------------------------------

const STATUS_FILTERS = [
  { id: 'all', label: 'Alle', value: undefined },
  { id: 'go', label: 'Ingen blokeringer', value: 'GO' },
  { id: 'betinget', label: 'Kræver handling', value: 'BETINGET-GO' },
  { id: 'no-go', label: 'Blokeret', value: 'NO-GO' },
];

const ListMode = () => {
  const [status, setStatus] = React.useState();
  const { data, isLoading, isError, error } = useQuery(
    ['v3-audit-list', { limit: 50, status, caseId: undefined }],
    fetchAuditList,
  );

  const items = data?.items || [];

  return (
    <Page>
      <Eyebrow>S.H.I.E.L.D. · gemte vurderinger</Eyebrow>
      <Title>Vurderingshistorik</Title>
      <Lede>
        Genfind konsekvensanalyser, risikovurderinger og juridiske screeninger.
        Hver gemt version bevarer sit oprindelige grundlag og resultat.
      </Lede>

      <AssessmentHistorySection />
      <h2>Juridiske screeninger</h2>

      <FilterRow role="group" aria-label="Filtrer vurderinger efter status">
        {STATUS_FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            type="button"
            $active={status === f.value || (status === undefined && f.value === undefined)}
            aria-pressed={status === f.value || (status === undefined && f.value === undefined)}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </FilterChip>
        ))}
      </FilterRow>

      {isError && (
        <EmptyState>
          Kunne ikke hente audit-log: {String(error?.message || error)}
        </EmptyState>
      )}

      {!isError && (
        <>
          <ResultMeta>
            {isLoading ? 'Indlæser…' : `${items.length} vurderinger fundet${status ? ` med status ${statusLabel(status)}` : ''}.`}
          </ResultMeta>

          <Table>
            <TableHead>
              <div>Tidspunkt</div>
              <div>Sag · note</div>
              <div>Status</div>
              <div>Engine</div>
            </TableHead>

            {isLoading && <LoadingRow>Indlæser audit-log…</LoadingRow>}

            {!isLoading && items.length === 0 && (
              <LoadingRow>Ingen vurderinger registreret endnu.</LoadingRow>
            )}

            {items.map((item) => (
              <Row
                key={item.id}
                to={`/historik/${item.id}`}
                aria-label={`Åbn vurdering ${item.case_id || ''} fra ${formatDanishDateTime(item.created_at)} — ${statusLabel(item.aggregate_status)}`.trim()}
              >
                <CellDate data-label="Tidspunkt">
                  <span className="cell-value">{formatDanishDateTime(item.created_at)}</span>
                </CellDate>
                <CellNote data-label="Sag og note">
                  <span className="cell-value">
                    <strong style={{ fontStyle: 'normal', fontFamily: 'inherit', fontWeight: 500 }}>
                      {item.case_id || '—'}
                    </strong>
                    {item.note && <> · {item.note}</>}
                  </span>
                </CellNote>
                <Cell data-label="Status">
                  <span className="cell-value">
                    <ComplianceVerdict status={item.aggregate_status} size="sm" />
                  </span>
                </Cell>
                <CellCase data-label="Regelmotor">
                  <span className="cell-value">
                    v{item.rule_engine_version} · {item.rules_loaded} regler
                  </span>
                </CellCase>
              </Row>
            ))}
          </Table>
        </>
      )}
      <DataOverview scope="historik" />
    </Page>
  );
};

// ---- Detail mode component ----------------------------------------------

const DetailMode = ({ id }) => {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useQuery(
    ['v3-audit-detail', id],
    () => fetchAuditDetail(id),
  );

  const result = data?.response_payload;
  const requestPayload = data?.request_payload;

  const decisions = useMemo(
    () => (result?.decisions || []).filter((d) => d.triggered),
    [result],
  );

  const sidenotes = useMemo(
    () =>
      decisions
        .filter((d) => d.kilde)
        .map((d) => ({
          id: d.rule_id,
          citat: d.kilde.citat,
          lov: d.kilde.lov,
          artikel: d.kilde.artikel,
          url: d.kilde.url,
          sidst_verificeret: d.kilde.sidst_verificeret,
        })),
    [decisions],
  );

  const evidenceItems = useMemo(() => {
    const all = new Set();
    decisions.forEach((d) => {
      (d.outcome?.evidens_påkrævet || []).forEach((e) => all.add(e));
    });
    return Array.from(all).map((eid) => ({
      id: eid,
      label: eid.replace(/_/g, ' '),
      status: 'pending',
    }));
  }, [decisions]);

  if (isLoading) {
    return (
      <Page>
        <BackLink type="button" onClick={() => navigate('/historik')}>
          ← Tilbage til historik
        </BackLink>
        <Lede>Indlæser audit-detalje…</Lede>
      </Page>
    );
  }

  if (isError) {
    return (
      <Page>
        <BackLink type="button" onClick={() => navigate('/historik')}>
          ← Tilbage til historik
        </BackLink>
        <EmptyState>
          Kunne ikke hente audit-entry: {String(error?.message || error)}
        </EmptyState>
      </Page>
    );
  }

  if (!data) return null;

  const totalKrav = decisions.reduce(
    (sum, d) => sum + (d.outcome?.krav?.length || 0),
    0,
  );

  const description = requestPayload?.system_description || '';
  const note = data.note;
  const caseIdRaw = data.case_id;
  const displayTitle = deriveTitle(description, caseIdRaw);
  const displayCaseId = caseIdRaw || data.id.slice(0, 8);
  const evaluatedDate = formatDanishDate(data.created_at);
  const relevantWarnings = filterNoiseWarnings(result?.warnings || []);

  return (
    <Page>
      <Shell>
        <Doc>
          <BackLink type="button" onClick={() => navigate('/historik')}>
            ← Tilbage til historik
          </BackLink>

          <Breadcrumb>
            <span>Historik</span>
            <span className="crumb-sep">/</span>
            <span>{displayTitle}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">{formatDanishDateTime(data.created_at)}</span>
          </Breadcrumb>

          {displayCaseId && <CaseId>Sag {displayCaseId}</CaseId>}
          <CaseTitle>{displayTitle}</CaseTitle>
          <CaseMeta>
            {note && <>{note} · </>}
            {evaluatedDate && <>Vurderet {evaluatedDate}</>}
            {evaluatedDate && ' · '}
            rule_engine {data.rule_engine_version}
          </CaseMeta>

          {relevantWarnings.length > 0 && (
            <Warnings>
              <strong>Bemærkninger:</strong>
              <ul>
                {relevantWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Warnings>
          )}

          <VerdictBanner $status={data.aggregate_status}>
            <VerdictHeader>
              <ComplianceVerdict status={data.aggregate_status} size="md" />
            </VerdictHeader>
            <VerdictText>
              {decisions.length} af {data.rules_loaded} lovartikler udløser krav.
              {evidenceItems.length > 0 && (
                <> {evidenceItems.length} konkrete artefakter skal etableres; {totalKrav} dokumentationskrav skal opfyldes.</>
              )}
            </VerdictText>
          </VerdictBanner>

          {decisions.length > 0 && (
            <>
              <SectionH>Vurderingens grundlag</SectionH>
              <SectionLede>
                {decisions.length === 1
                  ? 'Én lovartikel udløste krav. Læs grundlaget her — kilden står i marginen til højre.'
                  : `${decisions.length} lovartikler regulerede tilsammen denne anvendelse på vurderingstidspunktet.`}
              </SectionLede>

              {decisions.map((decision, idx) => {
                const num = idx + 1;
                const fnSup = toSuperscript(num);
                return (
                  <Rule key={decision.rule_id}>
                    <RuleHead>
                      <RuleMarker>Lovartikel {num} af {decisions.length}</RuleMarker>
                      <ComplianceVerdict status={decision.status || 'NEEDS_INPUT'} size="sm" />
                    </RuleHead>
                    <RuleTitle>
                      {ruleHumanTitle(decision)}
                      <FootnoteRef href={`#sn${num}`}>{fnSup}</FootnoteRef>
                    </RuleTitle>
                    {decision.outcome?.begrundelse && (
                      <RuleBody>
                        {decision.outcome.begrundelse}
                        <FootnoteRef href={`#sn${num}`}>{fnSup}</FootnoteRef>
                      </RuleBody>
                    )}
                    {decision.outcome?.krav && decision.outcome.krav.length > 0 && (
                      <KravBlock>
                        <KravHeader>Krav for compliance</KravHeader>
                        <KravList>
                          {decision.outcome.krav.map((krav, i) => (
                            <KravItem key={i}>
                              <span>{krav}</span>
                            </KravItem>
                          ))}
                        </KravList>
                      </KravBlock>
                    )}
                  </Rule>
                );
              })}
            </>
          )}

          {evidenceItems.length > 0 && (
            <>
              <SectionH>Evidens-checkliste</SectionH>
              <SectionLede>
                {evidenceItems.length} artefakter blev identificeret på tværs af de ramte regler.
              </SectionLede>
              <EvidenceChecklist items={evidenceItems} />
            </>
          )}

          <AuditFootnote>
            <b>Audit-spor</b>
            <br />
            rule_engine {data.rule_engine_version} · arkiveret {data.created_at}
            <br />
            rules_loaded={data.rules_loaded} · triggered={decisions.length} · aggregate=<b>{statusLabel(data.aggregate_status)}</b>
            <br />
            audit_log_id: <b>{data.id}</b>
          </AuditFootnote>
        </Doc>

        <SidenotesColumn notes={sidenotes} />
      </Shell>
    </Page>
  );
};

// ---- Page router (chooses list vs detail) -------------------------------

const VurderingHistorikPage = () => {
  const { id } = useParams();
  if (id) return <DetailMode id={id} />;
  return <ListMode />;
};

export default VurderingHistorikPage;
