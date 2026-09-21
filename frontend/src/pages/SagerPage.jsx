import React, { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import CaseProcessOverview, { CASE_STAGES as STATUSES } from '../components/cases/CaseProcessOverview';

const EMPTY_CASES = [];

// ---- API ----------------------------------------------------------------

async function fetchCases() {
  const res = await axios.get('/api/v3/cases');
  return res.data;
}

async function fetchCaseOverview(scope) {
  const res = await axios.get(`/api/v3/cases/overview?scope=${scope}&limit=500`);
  return res.data;
}

async function createCase(body) {
  const res = await axios.post('/api/v3/cases', body);
  return res.data;
}

async function transitionCase({ id, new_status, note, confirmed = false }) {
  const res = await axios.post(`/api/v3/cases/${id}/transition`, {
    new_status,
    note,
    confirmed,
  });
  return res.data;
}

// ---- Layout shell -------------------------------------------------------

const Page = styled.div`
  max-width: 1320px;
  margin: 0 auto;
  padding: 34px 24px 90px;
  min-width: 0;
  box-sizing: border-box;

  @media (max-width: 600px) { padding: 34px 14px 76px; }
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  margin-bottom: 0;
  padding-bottom: 24px;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};
  flex-wrap: wrap;
  > div:first-child { flex: 1 1 580px; min-width: 0; }
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.primary};
  margin-bottom: 0.6rem;
  font-weight: 600;
`;

const Title = styled.h1`
  overflow-wrap: anywhere;
  font-family: ${(p) => p.theme.fonts.display};
  font-size: clamp(2.3rem, 4.5vw, 3.4rem);
  font-weight: 580;
  letter-spacing: -0.055em;
  line-height: 1.1;
  margin: 0 0 14px;
  color: ${(p) => p.theme.colors.ink};
`;

const Lede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  margin: 0;
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 0.93rem;
  line-height: 1.55;
  max-width: 680px;
`;

const PrimaryButton = styled.button`
  background: ${(p) => p.theme.colors.primary};
  color: white;
  border: none;
  padding: 0.7rem 1.4rem;
  border-radius: 0;
  font-family: ${(p) => p.theme.fonts.sans};
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  align-self: flex-end;

  &:hover { background: ${(p) => p.theme.colors.primaryDark}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SummaryGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 26px;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};

  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const SummaryItem = styled.div`
  min-width: 0;
  padding: 16px 20px;
  border-right: 1px solid ${(p) => p.theme.colors.line};

  &:last-child { border-right: 0; }
  small { color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.72rem; }
  strong { display: block; margin-top: 12px; font: 580 1.75rem/1 ${(p) => p.theme.fonts.display}; }
  span { display: block; margin-top: 8px; color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.68rem; line-height: 1.5; }

  @media (max-width: 760px) {
    border-bottom: 1px solid ${(p) => p.theme.colors.line};
    &:nth-child(2) { border-right: 0; }
  }
`;

const BoardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  margin-bottom: 22px;

  > div { flex: 1; min-width: 0; }
  h2 { margin: 8px 0 0; font-size: 1.6rem; font-weight: 590; letter-spacing: -0.035em; }
  p { flex: 1; max-width: 440px; margin: 0; color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.82rem; line-height: 1.55; }

  @media (max-width: 680px) { align-items: start; flex-direction: column; }
`;

const ViewFilters = styled.div`
  display: flex;
  gap: 8px 24px;
  flex-wrap: wrap;
  margin: 0 0 18px;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};
  button {
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 12px 0;
    background: transparent;
    color: ${(p) => p.theme.colors.inkSoft};
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  button[aria-pressed='true'] {
    border-color: ${(p) => p.theme.colors.primary};
    color: ${(p) => p.theme.colors.primary};
    font-weight: 600;
  }
`;

// ---- Modal --------------------------------------------------------------

const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(20, 17, 13, 0.4);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
`;

const ModalPanel = styled.form`
  width: min(540px, 92vw);
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 0;
  padding: 1.6rem 1.75rem;
  display: flex; flex-direction: column;
  gap: 0.85rem;
`;

const ModalTitle = styled.h2`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.4rem;
  margin: 0 0 0.25rem;
`;

const DecisionSummary = styled.div`
  padding: 14px 16px;
  border-left: 4px solid ${(p) => p.theme.colors.primary};
  background: ${(p) => p.theme.colors.paperSoft};
  font-size: 0.84rem;
  line-height: 1.55;

  strong { display: block; margin-bottom: 4px; }
  span { color: ${(p) => p.theme.colors.inkSoft}; }
`;

const Confirmation = styled.label`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  padding: 13px 14px;
  border: 1px solid ${(p) => p.theme.colors.line};
  background: ${(p) => p.theme.colors.paperSoft};
  font-size: 0.8rem;
  line-height: 1.5;
  cursor: pointer;

  input { margin-top: 3px; accent-color: ${(p) => p.theme.colors.primary}; }
`;

const Field = styled.div`
  display: flex; flex-direction: column;
  gap: 0.35rem;

  label {
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${(p) => p.theme.colors.inkSoft};
    font-weight: 500;
  }
  input, textarea {
    border: 1px solid ${(p) => p.theme.colors.line};
    border-radius: 0;
    padding: 0.55rem 0.75rem;
    font-family: ${(p) => p.theme.fonts.body};
    font-size: 0.95rem;
    background: ${(p) => p.theme.colors.paper};
    color: ${(p) => p.theme.colors.ink};
  }
  textarea { min-height: 80px; resize: vertical; }
`;

const ModalActions = styled.div`
  display: flex; gap: 0.7rem; justify-content: flex-end;
  margin-top: 0.4rem;
`;

const SecondaryButton = styled.button`
  background: transparent;
  color: ${(p) => p.theme.colors.ink};
  border: 1px solid ${(p) => p.theme.colors.line};
  padding: 0.55rem 1rem;
  border-radius: 0;
  font-family: ${(p) => p.theme.fonts.sans};
  font-weight: 500;
  font-size: 0.88rem;
  cursor: pointer;
`;

const ErrorBox = styled.div`
  background: ${(p) => p.theme.colors.dangerSoft};
  border: 1px solid ${(p) => p.theme.colors.danger};
  color: ${(p) => p.theme.colors.danger};
  padding: 0.85rem 1rem;
  border-radius: 0;
  margin-bottom: 1rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.88rem;
`;

// ---- Page ---------------------------------------------------------------

const aggregateLabel = (status) => ({
  GO: 'Ingen blokeringer',
  'BETINGET-GO': 'Kræver handling',
  'NO-GO': 'Blokeret',
}[status] || status || 'Ingen vurdering');

const DECISION_GATED_STATUSES = new Set(['godkendt', 'idriftsat']);

const SagerPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const examplesOnly = searchParams.get('examples') === '1';
  const queryClient = useQueryClient();
  const { user, hasRole, isDevelopmentIdentity } = useAuth();
  const canApprove = hasRole(
    'Hammeren.Godkender',
    'Hammeren.DPO',
    'Hammeren.Admin',
  );

  const { data, isLoading, isError, error } = useQuery('v3-cases', fetchCases, { staleTime: 0 });
  const scope = examplesOnly ? 'examples' : 'work';
  const overview = useQuery(['case-overview', user?.oid || user?.id, scope], () => fetchCaseOverview(scope), { staleTime: 0 });
  const stats = overview.isError ? null : overview.data?.stats;
  const statValue = key => Number.isFinite(stats?.[key]) ? stats[key] : '—';
  const allCases = data?.items ?? EMPTY_CASES;
  const exampleCases = useMemo(() => allCases.filter(item => String(item.case_id || '').startsWith('EKSEMPEL-')), [allCases]);
  const cases = useMemo(() => examplesOnly ? exampleCases : allCases.filter(item => !String(item.case_id || '').startsWith('EKSEMPEL-')), [allCases, exampleCases, examplesOnly]);
  const showExamples = value => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('examples', '1'); else params.delete('examples');
    setSearchParams(params);
  };

  const [showCreate, setShowCreate] = useState(false);
  const [draftCase, setDraftCase] = useState({
    case_id: '',
    title: '',
    notes: '',
    assigned_to: user?.name || '',
    next_review_at: '',
  });
  const [pendingTransition, setPendingTransition] = useState(null);
  const [decisionForm, setDecisionForm] = useState({ note: '', confirmed: false });
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const createButtonRef = useRef(null);

  const closeCreateModal = () => {
    setShowCreate(false);
    requestAnimationFrame(() => createButtonRef.current?.focus());
  };

  const handleModalKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCreateModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const createMutation = useMutation(createCase, {
    onSuccess: () => {
      queryClient.invalidateQueries('v3-cases');
      queryClient.invalidateQueries('case-overview');
      closeCreateModal();
      setDraftCase({
        case_id: '',
        title: '',
        notes: '',
        assigned_to: user?.name || '',
        next_review_at: '',
      });
    },
  });

  const transitionMutation = useMutation(transitionCase, {
    onSuccess: () => {
      queryClient.invalidateQueries('v3-cases');
      queryClient.invalidateQueries('case-overview');
      setPendingTransition(null);
      setDecisionForm({ note: '', confirmed: false });
    },
  });

  const summary = [
    { label: examplesOnly ? 'Eksempelsager' : 'Arbejdssager', value: statValue('total'), note: 'På tværs af hele processen' },
    { label: 'Kladder', value: statValue('drafts'), note: 'Kan fortsættes af sagsbehandler' },
    { label: 'Kræver handling', value: statValue('requires_action'), note: 'Blokeringer, åbne tiltag eller udestående opfølgning' },
    {
      label: 'Godkendt',
      value: Number.isFinite(stats?.approved) && Number.isFinite(stats?.in_operation) ? stats.approved + stats.in_operation : '—',
      note: 'Godkendt eller sat i drift',
    },
  ];

  const handleDragStart = (e, caseId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', caseId);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    const caseId = e.dataTransfer.getData('text/plain');
    const moving = cases.find((c) => c.id === caseId);
    if (!moving || moving.status === columnId) return;
    if (DECISION_GATED_STATUSES.has(columnId)) {
      transitionMutation.reset();
      setPendingTransition({ case: moving, new_status: columnId });
      setDecisionForm({ note: '', confirmed: false });
      return;
    }
    transitionMutation.mutate({
      id: caseId,
      new_status: columnId,
      note: `Flyttet til ${STATUSES.find((s) => s.id === columnId)?.label} via kanban`,
    });
  };

  const closeDecisionModal = () => {
    if (transitionMutation.isLoading) return;
    setPendingTransition(null);
    setDecisionForm({ note: '', confirmed: false });
    transitionMutation.reset();
  };

  const handleDecisionKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDecisionModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submitDecision = (event) => {
    event.preventDefault();
    if (!pendingTransition) return;
    transitionMutation.mutate({
      id: pendingTransition.case.id,
      new_status: pendingTransition.new_status,
      note: decisionForm.note.trim(),
      confirmed: decisionForm.confirmed,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!draftCase.case_id.trim() || !draftCase.title.trim()) return;
    createMutation.mutate({
      case_id: draftCase.case_id.trim(),
      title: draftCase.title.trim(),
      notes: draftCase.notes.trim() || undefined,
      assigned_to: draftCase.assigned_to.trim() || undefined,
      next_review_at: draftCase.next_review_at
        ? new Date(`${draftCase.next_review_at}T12:00:00`).toISOString()
        : undefined,
      status: 'kladde',
    });
  };

  return (
    <Page>
      <Header>
        <div>
          <Eyebrow>S.H.I.E.L.D. · sager</Eyebrow>
          <Title>Sager &amp; godkendelse</Title>
          <Lede>
            Følg kommunens vurderinger fra første kladde til godkendelse og drift.
            Find den enkelte AI-løsning, se hvor sagen står, og fortsæt arbejdet med dokumentation og vurdering.
          </Lede>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
          <SecondaryButton ref={createButtonRef} type="button" onClick={() => setShowCreate(true)}>Opret sag manuelt</SecondaryButton>
          <PrimaryButton as={Link} data-tour="new-case" to="/anskaffelse">Ny AI-løsning →</PrimaryButton>
        </div>
      </Header>

      <SummaryGrid aria-label="Sagsstatus">
        {summary.map((item) => (
          <SummaryItem key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.note}</span>
          </SummaryItem>
        ))}
      </SummaryGrid>

      {overview.isError && <ErrorBox role="alert">Sagsstatus kunne ikke hentes. Oversigten viser derfor ingen optælling.</ErrorBox>}

      {isError && (
        <ErrorBox>
          Kunne ikke hente sager: {String(error?.message || error)}
        </ErrorBox>
      )}
      {transitionMutation.isError && !pendingTransition && (
        <ErrorBox role="alert">
          Status kunne ikke ændres: {String(transitionMutation.error?.response?.data?.detail || transitionMutation.error?.message)}
        </ErrorBox>
      )}

      <BoardHeader>
        <div>
          <Eyebrow>Procesoverblik</Eyebrow>
          <h2>{examplesOnly ? 'Eksempler til gennemgang og demonstration' : 'Fra kladde til drift'}</h2>
        </div>
        <p>
          Vælg et procestrin for at se de relevante sager.
          Åbn en sag for at se dokumentation, konsekvensanalyse og næste handling.
        </p>
      </BoardHeader>

      <ViewFilters aria-label="Vælg sagsvisning">
        <button type="button" aria-pressed={!examplesOnly} onClick={() => showExamples(false)}>Kommunens arbejdssager</button>
        <button type="button" aria-pressed={examplesOnly} onClick={() => showExamples(true)}>Eksempelsager ({exampleCases.length})</button>
      </ViewFilters>

      <div data-tour="cases-list">
        <CaseProcessOverview
          key={scope}
          cases={cases}
          examplesOnly={examplesOnly}
          isLoading={isLoading}
          dragOverColumn={dragOverColumn}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOverColumn(null)}
          onDrop={handleDrop}
        />
      </div>

      {showCreate && (
        <ModalOverlay onClick={closeCreateModal} role="presentation">
          <ModalPanel
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKeyDown}
            onSubmit={handleSubmit}
            aria-labelledby="create-case-title"
          >
            <ModalTitle id="create-case-title">Ny sag</ModalTitle>
            <Field>
              <label htmlFor="case-id">Sags-ID</label>
              <input
                id="case-id"
                autoFocus
                placeholder="K-2026-…"
                value={draftCase.case_id}
                onChange={(e) => setDraftCase({ ...draftCase, case_id: e.target.value })}
                required
              />
            </Field>
            <Field>
              <label htmlFor="case-title">Titel</label>
              <input
                id="case-title"
                placeholder="Fx Borgerassistent — pension"
                value={draftCase.title}
                onChange={(e) => setDraftCase({ ...draftCase, title: e.target.value })}
                required
              />
            </Field>
            <Field>
              <label htmlFor="case-owner">Ansvarlig sagsbehandler</label>
              <input
                id="case-owner"
                value={draftCase.assigned_to}
                onChange={(e) => setDraftCase({ ...draftCase, assigned_to: e.target.value })}
                placeholder="Navn eller funktion"
              />
            </Field>
            <Field>
                <label htmlFor="case-review-date">Næste opfølgningsdato</label>
              <input
                id="case-review-date"
                type="date"
                value={draftCase.next_review_at}
                onChange={(e) => setDraftCase({ ...draftCase, next_review_at: e.target.value })}
              />
            </Field>
            <Field>
              <label htmlFor="case-note">Note (valgfri)</label>
              <textarea
                id="case-note"
                placeholder="Kort beskrivelse af sagen…"
                value={draftCase.notes}
                onChange={(e) => setDraftCase({ ...draftCase, notes: e.target.value })}
              />
            </Field>
            {createMutation.isError && (
              <ErrorBox>
                {String(createMutation.error?.response?.data?.detail || createMutation.error?.message)}
              </ErrorBox>
            )}
            <ModalActions>
              <SecondaryButton type="button" onClick={closeCreateModal}>
                Annullér
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={createMutation.isLoading}>
                {createMutation.isLoading ? 'Opretter…' : 'Opret sag'}
              </PrimaryButton>
            </ModalActions>
          </ModalPanel>
        </ModalOverlay>
      )}

      {pendingTransition && (() => {
        const targetLabel = STATUSES.find((status) => status.id === pendingTransition.new_status)?.label;
        const hasGoAssessment = Boolean(pendingTransition.case.last_assessment_log_id)
          && pendingTransition.case.last_aggregate_status === 'GO';
        const validCurrentStatus = pendingTransition.new_status === 'godkendt'
          ? ['vurderet', 'remediation'].includes(pendingTransition.case.status)
          : pendingTransition.case.status === 'godkendt';
        const gateProblem = !canApprove
          ? 'Din bruger mangler rollen Godkender, DPO eller Administrator.'
          : !hasGoAssessment
          ? 'Sagen mangler en aktuel vurdering uden blokeringer.'
          : !validCurrentStatus
            ? `Sagen kan ikke flyttes fra ${pendingTransition.case.status_label || pendingTransition.case.status} til ${targetLabel}.`
            : '';
        const formReady = !gateProblem
          && Boolean(user?.name)
          && decisionForm.note.trim().length >= 20
          && decisionForm.confirmed;

        return (
          <ModalOverlay onClick={closeDecisionModal} role="presentation">
            <ModalPanel
              role="dialog"
              aria-modal="true"
              aria-labelledby="decision-title"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleDecisionKeyDown}
              onSubmit={submitDecision}
            >
              <ModalTitle id="decision-title">Dokumentér beslutning: {targetLabel}</ModalTitle>
              <DecisionSummary>
                <strong>{pendingTransition.case.case_id} · {pendingTransition.case.title}</strong>
                <span>Seneste vurdering: {aggregateLabel(pendingTransition.case.last_aggregate_status)}</span>
              </DecisionSummary>
              {gateProblem && <ErrorBox role="alert">{gateProblem}</ErrorBox>}
              <Field>
                <label htmlFor="decision-maker">Beslutningstager</label>
                <input
                  id="decision-maker"
                  autoFocus
                  value={user?.name || 'Ingen verificeret bruger'}
                  readOnly
                />
              </Field>
              {isDevelopmentIdentity && (
                <DecisionSummary role="note">
                  <strong>Identitet uden Entra-signatur</strong>
                  <span>Beslutningen registreres i revisionssporet og skal bekræftes med Entra ID før produktionsbrug.</span>
                </DecisionSummary>
              )}
              <Field>
                <label htmlFor="decision-note">Beslutningsbegrundelse</label>
                <textarea
                  id="decision-note"
                  minLength={20}
                  placeholder="Beskriv det gennemgåede grundlag, accepteret restrisiko og eventuelle vilkår…"
                  value={decisionForm.note}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, note: event.target.value }))}
                  required
                />
              </Field>
              <Confirmation>
                <input
                  type="checkbox"
                  checked={decisionForm.confirmed}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, confirmed: event.target.checked }))}
                />
                <span>Jeg har kontrolleret vurderingen, lovgrundlaget, restrisici og de dokumenterede foranstaltninger. Beslutningen gemmes i revisionssporet.</span>
              </Confirmation>
              {transitionMutation.isError && (
                <ErrorBox role="alert">
                  {String(transitionMutation.error?.response?.data?.detail || transitionMutation.error?.message)}
                </ErrorBox>
              )}
              <ModalActions>
                <SecondaryButton type="button" onClick={closeDecisionModal}>Annullér</SecondaryButton>
                <PrimaryButton type="submit" disabled={!formReady || transitionMutation.isLoading}>
                  {transitionMutation.isLoading ? 'Gemmer beslutning…' : `Bekræft ${targetLabel.toLowerCase()}`}
                </PrimaryButton>
              </ModalActions>
            </ModalPanel>
          </ModalOverlay>
        );
      })()}
    </Page>
  );
};

export default SagerPage;
