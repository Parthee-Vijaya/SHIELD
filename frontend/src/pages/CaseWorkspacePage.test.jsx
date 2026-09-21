import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from 'react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { lightTheme } from '../theme';
import CaseWorkspacePage, { AssessmentsPanel, ExampleRunPanel, normalizeWorkspace } from './CaseWorkspacePage';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('axios');

test('sagens DPIA-versioner har hver sit link til læsning og dokumenter', () => {
  render(<ThemeProvider theme={lightTheme}><AssessmentsPanel assessments={[
    { id: 'assessment-1', type: 'dpia_assessment', case_db_id: 'case-1', project_name: 'Sagsløsning', version: 1 },
    { id: 'assessment-2', type: 'dpia_assessment', case_db_id: 'case-1', project_name: 'Sagsløsning', version: 2 },
  ]} /></ThemeProvider>);
  const links = screen.getAllByRole('link', { name: /Læs analyse og hent Word \/ Excel/ });
  expect(links[0]).toHaveAttribute('href', '/vurdering?assessment_id=assessment-1&case=case-1');
  expect(links[1]).toHaveAttribute('href', '/vurdering?assessment_id=assessment-2&case=case-1');
  expect(screen.getByText('Version 1 · Konsekvensanalyse og risikovurdering')).toBeInTheDocument();
  expect(screen.getByText('Version 2 · Konsekvensanalyse og risikovurdering')).toBeInTheDocument();
});

const exampleRun = {
  schema_version: 1,
  title: 'Offentlig databehandleraftale – eksempelkørsel',
  executed_at: '2026-09-20T10:00:00Z',
  status: 'blocked',
  summary: 'GPT kunne ikke udarbejde rapporten, fordi teamet mangler betalte kreditter.',
  assessment_id: 'assessment-example',
  steps: [
    { id: 'source', label: 'Hent offentlig databehandleraftale', status: 'passed', detail: 'Kilden er hentet og gemt.' },
    { id: 'gpt', label: 'GPT udarbejder konsekvensanalysen', status: 'blocked', detail: 'Kræver betalte kreditter.' },
    { id: 'report', label: 'Gem ny AI-version', status: 'not_run' },
  ],
  sources: [{ title: 'Databehandleraftale', url: 'https://example.org/dpa', retrieved_at: '2026-09-20T09:00:00Z', sha256: 'a'.repeat(64) }],
  assumptions: ['Eksemplet bruger syntetiske sagsoplysninger.'],
  jev: { model: 'typesafe-ai/jev', checks: [{ label: 'Kontrol af en syntetisk påstand', text: 'Eksempelpåstand om kommunal godkendelse.', expected_requires_review: true, probability: 0.97 }], note: 'Separat kontrol af vurderingsmodellen.' },
};

function exampleDocuments(run = exampleRun) {
  return normalizeWorkspace({ documents: [{
    id: 'link-1', document: { title: 'Testkvittering' },
    version: { version_number: 1, original_filename: 'testkvittering.txt', metadata: { example_run: run }, download_href: '/api/v3/documents/document-1/versions/version-1/download' },
  }] }).documents;
}

function mountExample(documents) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ThemeProvider theme={lightTheme}><ExampleRunPanel documents={documents} caseId="case-example" /></ThemeProvider></QueryClientProvider>);
}

test('eksempelkørslen viser blokeret GPT-trin, kilder og den tilknyttede analyse', () => {
  const documents = exampleDocuments();
  expect(documents[0].metadata.example_run).toEqual(exampleRun);
  mountExample(documents);
  expect(screen.getByText('Eksempelsag')).toBeInTheDocument();
  expect(screen.getByText('Samlet test: Blokeret')).toBeInTheDocument();
  expect(screen.queryByText('Samlet test: Bestået')).not.toBeInTheDocument();
  expect(screen.getByText('Kræver betalte kreditter.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'https://example.org/dpa' })).toHaveAttribute('rel', 'noreferrer noopener');
  expect(screen.getByRole('link', { name: 'Læs sagens konsekvensanalyse og risikovurdering' })).toHaveAttribute('href', '/vurdering?assessment_id=assessment-example&case=case-example');
  expect(screen.getByText('Se forudsætninger og afgrænsning (1)').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText(/97 % signal/)).toBeInTheDocument();
  expect(screen.getByText('Påstand: Eksempelpåstand om kommunal godkendelse.')).toBeInTheDocument();
  expect(screen.getByText(/Bevidst fejlagtig testpåstand/)).toBeInTheDocument();
  expect(screen.getByText(/Det er ikke juridisk certificering/)).toBeInTheDocument();
});

test('nyeste registrerede eksempelkørsel vælges uafhængigt af dokumenternes rækkefølge', () => {
  const older = exampleDocuments({ ...exampleRun, title: 'Tidligere kørsel', executed_at: '2026-09-19T10:00:00Z' })[0];
  const newest = exampleDocuments({ ...exampleRun, title: 'Nyeste kørsel', executed_at: '2026-09-20T10:00:00Z' })[0];
  const undated = exampleDocuments({ ...exampleRun, title: 'Ukendt tidspunkt', executed_at: 'invalid' })[0];
  mountExample([older, newest, undated]);
  expect(screen.getByRole('heading', { name: 'Nyeste kørsel' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Tidligere kørsel' })).not.toBeInTheDocument();
});

test('den eksisterende beskyttede download henter eksemplets præcise testkvittering', async () => {
  axios.get.mockResolvedValueOnce({ data: new Blob(['testkvittering']) });
  URL.createObjectURL = jest.fn(() => 'blob:example-receipt');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    mountExample(exampleDocuments());
    fireEvent.click(screen.getByRole('button', { name: 'Hent testkvittering' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(axios.get).toHaveBeenCalledWith('/api/v3/documents/document-1/versions/version-1/download', { responseType: 'blob' });
  } finally {
    click.mockRestore();
  }
});

test('modstridende bestået-status bliver ikke grøn bestået, når GPT-trinnet er blokeret', () => {
  mountExample(exampleDocuments({ ...exampleRun, status: 'passed' }));
  expect(screen.getByText('Samlet test: Blokeret')).toBeInTheDocument();
  expect(screen.queryByText('Samlet test: Bestået')).not.toBeInTheDocument();
});

test('fejlformede metadata og usikre adresser bliver hverken aktive links eller HTML', () => {
  const run = {
    schema_version: 1, status: 'passed', title: {}, executed_at: {}, summary: '<img src=x onerror=alert(1)>',
    steps: [null, 'text', { label: {}, detail: [], status: '__proto__' }],
    sources: [{ title: 'Script', url: 'javascript:alert(1)' }, { title: 'Loginadresse', url: 'https://secret:password@example.org/dpa' }, null],
    assumptions: [{ text: 'ignored' }],
    jev: { model: {}, note: [], checks: [{ label: 'A', probability: Infinity }, { label: 'B', probability: -0.1 }, { label: 'C', probability: 1.1 }, { label: 'D', probability: '0.9' }, null] },
  };
  const documents = exampleDocuments(run);
  documents[0].download_href = 'https://example.org/private-download';
  const { container } = mountExample(documents);
  expect(screen.getByText('Samlet test: Ikke dokumenteret')).toBeInTheDocument();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Hent testkvittering' })).not.toBeInTheDocument();
  expect(screen.getAllByText(/Signal ikke tilgængeligt/)).toHaveLength(4);
});

test.each([undefined, [], [{ metadata: {} }], [{ metadata: { example_run: 'bad' } }], [{ metadata: { example_run: { schema_version: 99 } } }]])('almindelige sager uden genkendelig eksempelkørsel får intet panel (%j)', documents => {
  const { container } = mountExample(documents);
  expect(container).toBeEmptyDOMElement();
});

function NavigationState() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="workspace-location">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Browser tilbage</button></>;
}

function mountWorkspace(url, { client, measures = [], procurement = null } = {}) {
  useAuth.mockReturnValue({ user: { id: 'test-user' }, hasRole: () => false });
  axios.get.mockImplementation(path => {
    if (path === '/api/v3/cases/case-example/technical-runs') return Promise.resolve({ data: { runs: [] } });
    if (path !== '/api/v3/cases/case-example/workspace') return Promise.reject(new Error(`Unexpected GET ${path}`));
    return Promise.resolve({ data: { case: { id: 'case-example', case_id: 'EKSEMPEL-001', title: 'Eksempel til navigation', status: 'kladde' }, measures, procurement } });
  });
  const queryClient = client || new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0, refetchOnWindowFocus: false } } });
  return render(<QueryClientProvider client={queryClient}><ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/sager/:caseId" element={<CaseWorkspacePage />} /><Route path="/sager" element={<p>Sagslisten</p>} /></Routes>
    <NavigationState />
  </MemoryRouter></ThemeProvider></QueryClientProvider>);
}

test('sagens organisation vises eksplicit og bevares på tværs af faner', async () => {
  mountWorkspace('/sager/case-example', { procurement: { organisation: 'Eksempel Kommune' } });
  const label = await screen.findByText('Sagens organisation:');
  expect(label.closest('p')).toHaveTextContent('Sagens organisation: Eksempel Kommune');
  fireEvent.click(screen.getByRole('tab', { name: 'Dokumentation' }));
  expect(screen.getByText('Sagens organisation:').closest('p')).toHaveTextContent('Eksempel Kommune');
});

test('eksempelfilter og guideparametre bevares gennem faneskift, browser tilbage og tilbage til sager', async () => {
  mountWorkspace('/sager/case-example?from=examples&tab=documents&guide_case=case-example');
  expect(await screen.findByRole('heading', { name: 'Eksempel til navigation' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Dokumentation' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('link', { name: '← Tilbage til sager' })).toHaveAttribute('href', '/sager?examples=1');
  fireEvent.click(screen.getByRole('tab', { name: 'Vurderinger' }));
  expect(screen.getByTestId('workspace-location')).toHaveTextContent('/sager/case-example?from=examples&tab=assessments&guide_case=case-example');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Vurderinger' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Teknisk kørsel' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Teknisk kørsel' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Dokumentation' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('workspace-location')).toHaveTextContent('from=examples&tab=documents&guide_case=case-example');
  fireEvent.click(screen.getByRole('button', { name: 'Browser tilbage' }));
  expect(screen.getByRole('tab', { name: 'Teknisk kørsel' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Browser tilbage' }));
  expect(screen.getByRole('tab', { name: 'Vurderinger' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('link', { name: '← Tilbage til sager' }));
  expect(screen.getByTestId('workspace-location').textContent).toBe('/sager?examples=1');
});

test('almindelig sagsindgang returnerer til alle sager efter faneskift', async () => {
  mountWorkspace('/sager/case-example');
  await screen.findByRole('heading', { name: 'Eksempel til navigation' });
  fireEvent.click(screen.getByRole('tab', { name: 'Dokumentation' }));
  expect(screen.getByTestId('workspace-location').textContent).toBe('/sager/case-example?tab=documents');
  expect(screen.getByRole('link', { name: '← Tilbage til sager' })).toHaveAttribute('href', '/sager');
});

test('afklaringsopgaver viser gemte svar og kræver 20 tegn ved afslutning', async () => {
  mountWorkspace('/sager/case-example?tab=measures', { measures: [{ id:'clarification-1', title:'Afklar aftalegrundlag', description:'Aftalen skal gennemgås.\nAnalyse: internal-id\nSpørgsmål: question_dpa', status:'in_progress', source_reference_type:'procurement_clarification', evidence_note:'Leverandøren er bedt om et udkast til aftale.' }] });
  await screen.findByRole('heading',{name:'Afklar aftalegrundlag'});
  expect(screen.getByText('Dokumenteret afklaring')).toBeInTheDocument();
  expect(screen.queryByText(/internal-id/)).not.toBeInTheDocument();
  const field=screen.getByRole('textbox',{name:'Dokumentation for udført handling'});
  expect(field).toHaveValue('Leverandøren er bedt om et udkast til aftale.');
  fireEvent.change(field,{target:{value:'Kort svar'}});
  expect(screen.getByRole('button',{name:'Markér afsluttet'})).toBeDisabled();
});

test('afslutning af et tiltag markerer både oversigtstal og sagsliste til genhentning', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000 } } });
  const overviewKey = ['case-overview', 'test-user', 'all'];
  client.setQueryData(overviewKey, { stats: { requires_action: 1 } });
  client.setQueryData('v3-cases', { items: [] });
  axios.patch.mockResolvedValue({ data: { status: 'completed' } });
  mountWorkspace('/sager/case-example?tab=measures', { client, measures: [{ id: 'action-1', title: 'Gennemgå dokumentation', status: 'open' }] });
  await screen.findByRole('heading', { name: 'Gennemgå dokumentation' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Dokumentation for udført handling' }), { target: { value: 'Kontrol dokumenteret i syntetisk test.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Markér afsluttet' }));
  await waitFor(() => expect(client.getQueryState(overviewKey).isInvalidated).toBe(true));
  expect(client.getQueryState('v3-cases').isInvalidated).toBe(true);
  expect(axios.patch).toHaveBeenCalledWith('/api/v3/cases/case-example/actions/action-1', { status: 'completed', evidence_note: 'Kontrol dokumenteret i syntetisk test.' });
  client.clear();
});
