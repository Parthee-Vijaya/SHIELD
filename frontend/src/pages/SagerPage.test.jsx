import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from 'styled-components';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { lightTheme } from '../theme';
import SagerPage from './SagerPage';

jest.mock('axios');
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const cases = [
  { id: 'example-1', case_id: 'EKSEMPEL-DEMO-2026-001', title: 'EKSEMPEL · Interne nyheder', status: 'kladde', notes: 'Fiktive medarbejdere og offentligt aftalegrundlag.' },
  { id: 'example-2', case_id: 'EKSEMPEL-DEMO-2026-002', title: 'EKSEMPEL – Mødereferater', status: 'remediation', notes: 'Krav om menneskelig gennemgang.' },
  { id: 'ordinary-1', case_id: 'K-2026-101', title: 'Kommunal behandling', status: 'godkendt' },
  { id: 'ordinary-2', case_id: 'K-2026-102', title: 'EKSEMPEL · Navn alene', status: 'idriftsat' },
  { id: 'ordinary-3', case_id: null, title: 'Sag uden eksempelsags-ID', status: 'vurderet' },
];

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function mount(url = '/sager', items = cases, { statsByScope = {}, overviewError = false, cachedStats } = {}) {
  axios.get.mockImplementation(path => {
    if (path === '/api/v3/cases') return Promise.resolve({ data: { items } });
    const match = path.match(/^\/api\/v3\/cases\/overview\?scope=(work|examples)&limit=500$/);
    if (match) {
      if (overviewError) return Promise.reject(new Error('Overview unavailable'));
      const scopedItems = items.filter(item => String(item.case_id || '').startsWith('EKSEMPEL-') === (match[1] === 'examples'));
      return Promise.resolve({ data: { items: scopedItems, stats: statsByScope[match[1]] || {
        total: scopedItems.length,
        drafts: scopedItems.filter(item => item.status === 'kladde').length,
        requires_action: scopedItems.filter(item => item.status === 'remediation').length,
        approved: scopedItems.filter(item => item.status === 'godkendt').length,
        in_operation: scopedItems.filter(item => item.status === 'idriftsat').length,
      } } });
    }
    return Promise.reject(new Error(`Unexpected GET ${path}`));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0, refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 }, mutations: { retry: false } } });
  if (cachedStats) client.setQueryData(['case-overview', undefined, 'work'], { items, stats: cachedStats });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={lightTheme}>
        <MemoryRouter initialEntries={[url]}>
          <SagerPage />
          <CurrentLocation />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { name: 'Syntetisk testbruger' }, hasRole: () => false, isDevelopmentIdentity: true });
});

test('arbejdssager er standard og eksempler kræver aktivt tilvalg', async () => {
  mount();
  expect(await screen.findByRole('link', { name: /Kommunal behandling/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Kommunens arbejdssager' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Eksempelsager (2)' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(document.querySelector('[data-tour="cases-list"]')).getAllByRole('link')).toHaveLength(3);
  expect(screen.getByRole('link', { name: /Navn alene/ })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Sagsstatus' })).getByText('3')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Fiktive eksempelsager' })).not.toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith('/api/v3/cases');
});

test('examples=1 viser kun EKSEMPEL-sags-IDer med kildebeskrivelser og direkte sagslinks', async () => {
  mount('/sager?examples=1');
  const first = await screen.findByRole('link', { name: 'Interne nyheder →' });
  expect(first).toHaveAttribute('href', '/sager/example-1?from=examples');
  expect(screen.getByRole('link', { name: 'Mødereferater →' })).toHaveAttribute('href', '/sager/example-2?from=examples');
  expect(screen.getByRole('heading', { name: 'Eksempler til gennemgang og demonstration' })).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Fiktive eksempelsager' })).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByText('Fiktive medarbejdere og offentligt aftalegrundlag.')).toBeInTheDocument();
  expect(screen.queryByText('Kommunal behandling')).not.toBeInTheDocument();
  expect(screen.queryByText(/Navn alene/)).not.toBeInTheDocument();
  expect(screen.queryByText('Sag uden eksempelsags-ID')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Sagsstatus' })).getByText('2')).toBeInTheDocument();
  fireEvent.click(first);
  expect(screen.getByTestId('current-location')).toHaveTextContent('/sager/example-1?from=examples');
});

test('skift mellem eksempler og arbejdssager opdaterer URL, antal og visning uden at ændre sager', async () => {
  mount('/sager?source=tutorial');
  await screen.findByRole('link', { name: /Kommunal behandling/ });
  fireEvent.click(screen.getByRole('button', { name: 'Eksempelsager (2)' }));
  expect(await screen.findByRole('link', { name: 'Interne nyheder →' })).toBeInTheDocument();
  expect(screen.getByTestId('current-location')).toHaveTextContent('/sager?source=tutorial&examples=1');
  expect(screen.getByRole('button', { name: 'Eksempelsager (2)' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(document.querySelector('[data-tour="cases-list"]')).getAllByRole('link')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Kommunens arbejdssager' }));
  expect(await screen.findByRole('link', { name: /Kommunal behandling/ })).toBeInTheDocument();
  expect(screen.getByTestId('current-location')).toHaveTextContent('/sager?source=tutorial');
  expect(within(document.querySelector('[data-tour="cases-list"]')).getAllByRole('link')).toHaveLength(3);
  expect(axios.post).not.toHaveBeenCalled();
});

test('tom eksempelliste viser nul og tomtilstand selv om andre sager findes', async () => {
  mount('/sager?examples=1', cases.filter(item => !String(item.case_id || '').startsWith('EKSEMPEL-')));
  await waitFor(() => expect(screen.getByText('Der er endnu ingen eksempelsager.')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Eksempelsager (0)' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(document.querySelector('[data-tour="cases-list"]')).queryAllByRole('link')).toHaveLength(0);
  expect(screen.queryByText('Kommunal behandling')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kommunens arbejdssager' }));
  expect(await screen.findByRole('link', { name: /Kommunal behandling/ })).toBeInTheDocument();
  expect(within(document.querySelector('[data-tour="cases-list"]')).getAllByRole('link')).toHaveLength(3);
});

function summaryValue(label) {
  return within(screen.getByRole('region', { name: 'Sagsstatus' })).getByText(label).parentElement.querySelector('strong').textContent;
}

test('sagsstatus bruger fælles API-statistik for valgt scope, også handling på vurderede sager', async () => {
  mount('/sager', cases, { statsByScope: {
    work: { total: 12, drafts: 3, requires_action: 7, approved: 2, in_operation: 4 },
    examples: { total: 2, drafts: 1, requires_action: 2, approved: 0, in_operation: 0 },
  } });
  await waitFor(() => expect(summaryValue('Kræver handling')).toBe('7'));
  expect(summaryValue('Arbejdssager')).toBe('12');
  expect(summaryValue('Kladder')).toBe('3');
  expect(summaryValue('Godkendt')).toBe('6');
  expect(axios.get).toHaveBeenCalledWith('/api/v3/cases/overview?scope=work&limit=500');
  fireEvent.click(screen.getByRole('button', { name: 'Eksempelsager (2)' }));
  await waitFor(() => expect(summaryValue('Kræver handling')).toBe('2'));
  expect(summaryValue('Eksempelsager')).toBe('2');
  expect(summaryValue('Godkendt')).toBe('0');
  expect(axios.get).toHaveBeenCalledWith('/api/v3/cases/overview?scope=examples&limit=500');
});

test('fejl i statistik viser ukendte antal, mens sagslisten stadig kan åbnes', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mount('/sager', cases, { overviewError: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('Sagsstatus kunne ikke hentes');
    expect(within(screen.getByRole('region', { name: 'Sagsstatus' })).getAllByText('—')).toHaveLength(4);
    fireEvent.click(screen.getByRole('link', { name: /Kommunal behandling/ }));
    expect(screen.getByTestId('current-location').textContent).toBe('/sager/ordinary-1');
  } finally {
    consoleError.mockRestore();
  }
});

test('tilbagevenden til sagslisten genhenter tællinger trods appens cachetid på fem minutter', async () => {
  mount('/sager', cases, { cachedStats: { total: 5, drafts: 1, requires_action: 99, approved: 1, in_operation: 1 } });
  await waitFor(() => expect(summaryValue('Kræver handling')).toBe('0'));
  expect(axios.get).toHaveBeenCalledWith('/api/v3/cases/overview?scope=work&limit=500');
});


test('new fagsystem is primary and the manual dialog remains available', async () => {
  mount();
  await screen.findByRole('link', { name: /Kommunal behandling/ });
  const primary = screen.getByRole('link', { name: 'Ny AI-løsning →' });
  expect(primary).toHaveAttribute('href', '/anskaffelse');
  expect(primary).toHaveAttribute('data-tour', 'new-case');
  fireEvent.click(screen.getByRole('button', { name: 'Opret sag manuelt' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

const reviewedCase = {
  id: 'reviewed-case',
  case_id: 'K-2026-200',
  title: 'AI til interne projektreferater',
  status: 'vurderet',
  last_assessment_log_id: 'assessment-200',
  last_aggregate_status: 'GO',
};

async function dragCaseTo(caseItem, targetStatus) {
  await screen.findByRole('link', { name: `${caseItem.title} →` });
  fireEvent.click(screen.getByRole('button', { name: 'Procestavle' }));
  const board = screen.getByLabelText('Sager fordelt efter status');
  const card = within(board).getByRole('link', { name: `${caseItem.title} →` }).closest('[draggable="true"]');
  const target = within(board).getByRole('region', { name: targetStatus });
  const draggedData = {};
  const dataTransfer = {
    setData: jest.fn((format, value) => { draggedData[format] = value; }),
    getData: jest.fn(format => draggedData[format]),
  };
  fireEvent.dragStart(card, { dataTransfer });
  expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', caseItem.id);
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

test('procestavlens almindelige statusflytning sender sagens ID og mål til API', async () => {
  axios.post.mockResolvedValue({ data: { ...reviewedCase, status: 'remediation' } });
  mount('/sager', [reviewedCase]);
  await dragCaseTo(reviewedCase, 'Afklaring');

  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  expect(axios.post).toHaveBeenCalledWith('/api/v3/cases/reviewed-case/transition', {
    new_status: 'remediation',
    note: expect.stringContaining('Afklaring'),
    confirmed: false,
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('drop til godkendt åbner beslutningsdialogen uden at gemme en overgang', async () => {
  useAuth.mockReturnValue({ user: { name: 'Syntetisk godkender' }, hasRole: () => true, isDevelopmentIdentity: false });
  mount('/sager', [reviewedCase]);
  await dragCaseTo(reviewedCase, 'Godkendt');

  const dialog = await screen.findByRole('dialog', { name: 'Dokumentér beslutning: Godkendt' });
  expect(within(dialog).getByText(/AI til interne projektreferater/)).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Bekræft godkendt' })).toBeDisabled();
  expect(axios.post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annullér' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});

test.each([
  { description: 'manglende godkenderrolle', canApprove: false, aggregateStatus: 'GO', message: 'Din bruger mangler rollen Godkender, DPO eller Administrator.' },
  { description: 'manglende GO-vurdering', canApprove: true, aggregateStatus: 'NO-GO', message: 'Sagen mangler en aktuel vurdering uden blokeringer.' },
])('$description blokerer godkendelse selv med begrundelse og bekræftelse', async ({ canApprove, aggregateStatus, message }) => {
  useAuth.mockReturnValue({ user: { name: 'Syntetisk testbruger' }, hasRole: () => canApprove, isDevelopmentIdentity: false });
  const caseItem = { ...reviewedCase, last_aggregate_status: aggregateStatus };
  mount('/sager', [caseItem]);
  await dragCaseTo(caseItem, 'Godkendt');

  const dialog = await screen.findByRole('dialog', { name: 'Dokumentér beslutning: Godkendt' });
  expect(within(dialog).getByRole('alert')).toHaveTextContent(message);
  fireEvent.change(within(dialog).getByLabelText('Beslutningsbegrundelse'), { target: { value: 'Grundlaget er gennemgået i denne syntetiske test.' } });
  fireEvent.click(within(dialog).getByRole('checkbox'));
  const submit = within(dialog).getByRole('button', { name: 'Bekræft godkendt' });
  expect(submit).toBeDisabled();
  fireEvent.click(submit);
  expect(axios.post).not.toHaveBeenCalled();
});

test('gyldig godkendelse kræver mindst 20 tegn og eksplicit bekræftelse før API-kald', async () => {
  useAuth.mockReturnValue({ user: { name: 'Syntetisk godkender' }, hasRole: () => true, isDevelopmentIdentity: false });
  axios.post.mockResolvedValue({ data: { ...reviewedCase, status: 'godkendt' } });
  mount('/sager', [reviewedCase]);
  await dragCaseTo(reviewedCase, 'Godkendt');

  const dialog = await screen.findByRole('dialog', { name: 'Dokumentér beslutning: Godkendt' });
  const note = within(dialog).getByLabelText('Beslutningsbegrundelse');
  const confirmation = within(dialog).getByRole('checkbox');
  const submit = within(dialog).getByRole('button', { name: 'Bekræft godkendt' });
  const validNote = 'Grundlaget er gennemgået i denne syntetiske test.';

  expect(within(dialog).getByLabelText('Beslutningstager')).toHaveValue('Syntetisk godkender');
  fireEvent.change(note, { target: { value: validNote.slice(0, 19) } });
  fireEvent.click(confirmation);
  expect(submit).toBeDisabled();
  fireEvent.change(note, { target: { value: validNote.slice(0, 20) } });
  expect(submit).toBeEnabled();
  fireEvent.click(confirmation);
  expect(submit).toBeDisabled();
  expect(axios.post).not.toHaveBeenCalled();

  fireEvent.change(note, { target: { value: `  ${validNote}  ` } });
  fireEvent.click(confirmation);
  fireEvent.click(submit);
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  expect(axios.post).toHaveBeenCalledWith('/api/v3/cases/reviewed-case/transition', {
    new_status: 'godkendt',
    note: validNote,
    confirmed: true,
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
