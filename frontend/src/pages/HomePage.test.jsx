import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';
import HomePage from './HomePage';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../contexts/TutorialContext', () => ({ useTutorial: jest.fn() }));

const row = index => ({ id: `case-${index}`, case_id: `K-2026-${index}`, title: `System ${index}`, status: 'vurderet', status_label: 'Vurderet', assigned_to: 'Fiktiv ansvarlig', attention: { kind: 'requires_action', label: 'Gennemgå blokeringer', detail: 'Dokumentér behandlingsgrundlaget.', tab: 'assessments', priority: index } });
const payload = {
  stats: { active: 7, archived: 0, examples: 2, requires_action: 6, awaiting_approval: 0, review_due_soon: 1, review_overdue: 0 },
  items: Array.from({ length: 7 }, (_, index) => row(index)),
  latest_assessments: [{ id: 'saved-version', case_db_id: 'case-2', project_name: 'Kommunal referatassistent', version: 3, created_at: '2026-09-20T10:00:00', status_label: 'Kræver faglig gennemgang' }],
};
let authFetch;
let restart;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function mount(url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, cacheTime: 0, refetchOnWindowFocus: false } }, logger: { log: () => {}, warn: () => {}, error: () => {} } });
  return render(<QueryClientProvider client={client}><ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}><HomePage /><Location /></MemoryRouter></ThemeProvider></QueryClientProvider>);
}
beforeEach(() => {
  authFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
  restart = jest.fn();
  useAuth.mockReturnValue({ user: { oid: 'synthetic-user', name: 'Parthee Vijaya' }, ready: true, isAuthenticated: true, authFetch });
  useTutorial.mockReturnValue({ canStart: true, restart });
});

test('shows server-derived action counts and opens the exact saved version', async () => {
  mount();
  const overview = await screen.findByLabelText('Sagsstatus');
  expect(within(overview).getByText('6')).toBeInTheDocument();
  expect(within(overview).getByText('7')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Kommunal referatassistent/ })).toHaveAttribute('href', '/vurdering?assessment_id=saved-version&case=case-2');
  expect(screen.queryByText('Kladde gemt')).not.toBeInTheDocument();
  expect(authFetch).toHaveBeenCalledWith('/api/v3/cases/overview?scope=work&limit=500', expect.objectContaining({ signal: expect.anything() }));
});

test('pagination preserves addressable case actions and the home page has one shared search', async () => {
  mount();
  const list = await screen.findByRole('list', { name: 'Sager med næste handling' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Næste' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Næste handlinger' })).toHaveFocus();
  expect(screen.getByRole('combobox', { name: 'Søg på tværs af SHIELD' })).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Forrige' }));
  expect(within(list).getAllByRole('link')[2]).toHaveAttribute('href', '/sager/case-2?tab=assessments');
});

test('changing scope requests new data and updates URL without mutating cases', async () => {
  mount('/?source=guide');
  await screen.findByLabelText('Sagsstatus');
  fireEvent.change(screen.getByRole('combobox', { name: 'Vis' }), { target: { value: 'examples' } });
  await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/v3/cases/overview?scope=examples&limit=500', expect.anything()));
  expect(screen.getByTestId('location')).toHaveTextContent('/?source=guide&scope=examples');
  expect(screen.getByText('Fiktive sager til gennemgang og demonstration')).toBeInTheDocument();
  expect(authFetch.mock.calls.every(([,options]) => !options.method)).toBe(true);
});

test('failed loading shows retry instead of zero counts or fake healthy states', async () => {
  authFetch.mockResolvedValue({ ok: false });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Overblikket kunne ikke hentes');
  expect(screen.queryByLabelText('Sagsstatus')).not.toBeInTheDocument();
  authFetch.mockResolvedValue({ ok: true, json: async () => payload });
  fireEvent.click(screen.getByRole('button', { name: 'Prøv igen' }));
  expect(await screen.findByLabelText('Sagsstatus')).toBeInTheDocument();
});

test('guide uses the existing tutorial and unauthenticated home makes no case requests', async () => {
  const view = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Start interaktiv guide' }));
  expect(restart).toHaveBeenCalledTimes(1);
  view.unmount();
  authFetch.mockClear();
  const login = jest.fn();
  useAuth.mockReturnValue({ ready: true, isAuthenticated: false, authFetch, login });
  mount();
  expect(authFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Log ind med Microsoft' }));
  expect(login).toHaveBeenCalledTimes(1);
});

test('empty scope shows a useful next step instead of invented cases', async () => {
  authFetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, items: [], latest_assessments: [], stats: { active: 0, archived: 0, examples: 0, requires_action: 0, awaiting_approval: 0, review_due_soon: 0, review_overdue: 0 } }) });
  mount();
  expect(await screen.findByText('Der er ingen aktive sager i dette udsnit')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Opret den første sag' })).toHaveAttribute('href', '/anskaffelse');
  expect(screen.queryByRole('list', { name: 'Sager med næste handling' })).not.toBeInTheDocument();
});


test('onboards a municipal procurement with a material-first path and explicit human review', async () => {
  mount();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Goddag, Parthee');
  expect(screen.getByRole('link', { name: 'Opret AI-løsning' })).toHaveAttribute('href', '/anskaffelse');
  expect(screen.getByText('Sådan arbejder I med en AI-løsning').closest('details')).toHaveAttribute('open');
  const workflow = screen.getByRole('region', { name: 'Sådan vurderer I en AI-løsning' });
  expect(within(workflow).getAllByRole('listitem')).toHaveLength(4);
  expect(workflow).toHaveTextContent('Den faglige og juridiske vurdering skal gennemgås af kommunen.');
  const materials = screen.getByRole('region', { name: 'Start med det, I allerede har' });
  expect(materials).toHaveTextContent('Præsentation af AI-løsningen');
  expect(materials).toHaveTextContent('Databehandleraftale og bilag');
  expect(materials).toHaveTextContent('Leverandørens hjemmeside');
  await screen.findByLabelText('Sagsstatus');
  expect(screen.getByRole('combobox', { name: 'Vis' })).toHaveValue('work');
  expect(screen.getByText('Eksempelsager vises kun, når du vælger dem')).toBeInTheDocument();
});

test('example scope stays explicit and preserves the return link to examples', async () => {
  authFetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, items: [{ ...row(1), is_example: true }] }) });
  mount('/?scope=examples');
  const list = await screen.findByRole('list', { name: 'Sager med næste handling' });
  expect(within(list).getByText('Eksempelsag')).toBeInTheDocument();
  expect(within(list).getByRole('link')).toHaveAttribute('href', '/sager/case-1?tab=assessments&from=examples');
  fireEvent.change(screen.getByRole('combobox', { name: 'Vis' }), { target: { value: 'work' } });
  await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/v3/cases/overview?scope=work&limit=500', expect.anything()));
  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(screen.getByTestId('location')).not.toHaveTextContent('scope=');
});

test('new procurement and workflow explanation remain available if the case overview fails', async () => {
  authFetch.mockResolvedValue({ ok: false });
  mount();
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('link', { name: 'Opret AI-løsning' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/anskaffelse');
  expect(screen.getByText('Sådan arbejder I med en AI-løsning')).toBeInTheDocument();
});


test('recent summaries distinguish saved time, recorded start and owner without inventing missing metadata', async () => {
  authFetch.mockResolvedValue({ok:true,json:async()=>({...payload,latest_assessments:[{...payload.latest_assessments[0],version:null,owner:'Faglig ansvarlig',initiated_at:null}]})});
  mount();
  const recent=await screen.findByRole('link',{name:/Kommunal referatassistent/});
  expect(recent).toHaveTextContent('Version ikke registreret');
  expect(recent).toHaveTextContent('Ansvarlig: Faglig ansvarlig');
  expect(recent).toHaveTextContent('Igangsat: Ikke registreret');
  expect(recent).toHaveTextContent('Gemt');
});
