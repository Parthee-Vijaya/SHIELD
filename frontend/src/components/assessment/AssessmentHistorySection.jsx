import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import styled from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';

const Section = styled.section`
  margin: 36px 0 48px;
  h2 { margin-bottom: 12px; font-size: 1.7rem; }
  p { color: ${p => p.theme.colors.textMuted}; }
  ul { margin: 20px 0; padding: 0; list-style: none; }
  li { padding: 20px 0; border-top: 1px solid ${p => p.theme.colors.border}; }
  h3 { margin: 0 0 8px; font-size: 1.1rem; overflow-wrap: anywhere; }
  small { display: block; line-height: 1.7; color: ${p => p.theme.colors.textMuted}; }
  nav { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
  button { min-height: 42px; padding: 8px 14px; border: 1px solid ${p => p.theme.colors.border}; }
`;
const PAGE_SIZE = 8;
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Dato ikke registreret' : date.toLocaleDateString('da-DK');
};

export default function AssessmentHistorySection() {
  const { authFetch, user } = useAuth();
  const [page, setPage] = useState(0);
  const { data, isLoading, isFetching, isError, refetch } = useQuery(
    ['dpia-history', user?.oid || user?.id, page],
    async () => {
      const response = await authFetch(`/api/dpia/assessments?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      if (!response.ok) throw new Error('Vurderingerne kunne ikke hentes.');
      return response.json();
    },
    { staleTime: 0 },
  );
  const items = Array.isArray(data?.items) ? data.items : [];
  return <Section aria-labelledby="dpia-history-title">
    <h2 id="dpia-history-title">Konsekvensanalyser og risikovurderinger</h2>
    <p>Find systemet og den gemte version. Åbn vurderingen for at læse analysen og hente Word eller Excel.</p>
    {isLoading && <p role="status">Henter gemte konsekvensanalyser…</p>}
    {isError && <p role="alert">Konsekvensanalyserne kunne ikke hentes. <button type="button" onClick={() => refetch()}>Prøv igen</button></p>}
    {!isLoading && !isError && <>
      {!items.length ? <p>Der er endnu ingen gemte konsekvensanalyser.</p> : <ul>{items.map(item => <li key={item.id}>
        <h3><Link to={`/vurdering?assessment_id=${encodeURIComponent(item.id)}${item.case_db_id ? `&case=${encodeURIComponent(item.case_db_id)}` : ''}`}>{item.project_name || `Vurdering ${item.id.slice(0, 8)}`}</Link></h3>
        <small>Version {item.version || 1} · {dateLabel(item.created_at)}{item.department ? ` · ${item.department}` : ''}</small>
        <small>{item.status_label || 'Kræver faglig gennemgang'}</small>
      </li>)}</ul>}
      {(data?.count > PAGE_SIZE || page > 0) && <nav aria-label="Flere gemte konsekvensanalyser">
        <button type="button" disabled={page === 0 || isFetching} onClick={() => setPage(value => value - 1)}>Forrige</button>
        <span>Side {page + 1} af {Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE))}</span>
        <button type="button" disabled={isFetching || (page + 1) * PAGE_SIZE >= (data?.count || 0)} onClick={() => setPage(value => value + 1)}>Næste</button>
      </nav>}
    </>}
  </Section>;
}
