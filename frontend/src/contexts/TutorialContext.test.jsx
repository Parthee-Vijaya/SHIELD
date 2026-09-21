import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { lightTheme } from '../theme';
import { useAuth } from './AuthContext';
import { TutorialProvider, tutorialDestination, useTutorial } from './TutorialContext';
import PrivacyNotice from '../components/PrivacyNotice';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));

const fresh = { tutorial_version: 1, status: 'not_started', step_id: null, updated_at: null };
const reply = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });
let identity;
let records;
let authFetch;

beforeEach(() => {
  records = { alpha: { ...fresh }, beta: { ...fresh, status: 'completed', step_id: 'finish' } };
  identity = { ready: true, isAuthenticated: true, user: { oid: 'alpha' } };
  authFetch = jest.fn((url, options = {}) => {
    const owner = identity.user.oid;
    if (url !== '/api/user/tutorial') return reply({}, false);
    if (options.method === 'PATCH') records[owner] = { ...records[owner], ...JSON.parse(options.body) };
    return reply(records[owner]);
  });
  useAuth.mockImplementation(() => ({ ...identity, authFetch }));
  window.localStorage.clear();
});

function Surface({ targets = true }) {
  const location = useLocation();
  const { restart } = useTutorial();
  return <main id="main-content" tabIndex="-1">
    <button onClick={restart}>Genstart guide</button>
    <output data-testid="route">{location.pathname}{location.search}</output>
    {targets && ['new-case', 'cases-list', 'document-bank', 'case-documents', 'assessment-form', 'ai-report', 'case-assessments', 'assessment-downloads', 'case-exports'].map(target => <div data-tour={target} key={target}>Område {target}</div>)}
    <PrivacyNotice />
  </main>;
}

function App({ targets = true, route = '/indstillinger' }) {
  return <ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[route]}><TutorialProvider><Surface targets={targets} /></TutorialProvider></MemoryRouter></ThemeProvider>;
}

const click = async label => {
  const button = await screen.findByRole('button', { name: label });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
};

test('første login viser invitation uden navigation eller automatisk skrivning og skjuler privatlivsnoten', async () => {
  render(<App />);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByTestId('route')).toHaveTextContent('/indstillinger');
  expect(authFetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Privatliv og persondata')).not.toBeInTheDocument();
  await click('Start guide');
  expect(await screen.findByRole('heading', { name: /Saml arbejdet/ })).toBeInTheDocument();
  expect(screen.getByTestId('route')).toHaveTextContent('/sager');
  expect(records.alpha).toMatchObject({ status: 'in_progress', step_id: 'cases' });
  expect(authFetch).toHaveBeenCalledTimes(2);
});

test('ingen guide eller API-kald før autentificering er klar', async () => {
  identity = { ready: false, isAuthenticated: false, user: null };
  const view = render(<App />);
  expect(authFetch).not.toHaveBeenCalled();
  identity = { ready: true, isAuthenticated: true, user: { oid: 'alpha' } };
  view.rerender(<App />);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(authFetch).toHaveBeenCalledTimes(1);
});

test('spring over gemmes, genindlæsning åbner ikke igen, manuel genstart nulstiller', async () => {
  const view = render(<App />);
  await click('Spring over');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(records.alpha.status).toBe('dismissed');
  view.unmount();
  render(<App />);
  await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await click('Genstart guide');
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(records.alpha).toMatchObject({ status: 'not_started', step_id: 'welcome' });
});

test('gemt trin genoptages på den relevante sagsfane med bevaret vurderingskontekst', async () => {
  records.alpha = { ...fresh, status: 'in_progress', step_id: 'documents' };
  render(<App route="/sager/example?guide_assessment=report-2&guide_example=1" />);
  expect(await screen.findByRole('heading', { name: /Tilknyt dokumenteret grundlag/ })).toBeInTheDocument();
  expect(screen.getByTestId('route')).toHaveTextContent('/sager/example?tab=documents&guide_case=example&guide_assessment=report-2&guide_example=1');
  await click('Næste');
  expect(await screen.findByRole('heading', { name: /Udarbejd konsekvensanalysen/ })).toBeInTheDocument();
  expect(screen.getByTestId('route')).toHaveTextContent('/vurdering?assessment_id=report-2&case=example');
  await click('Tilbage');
  await waitFor(() => expect(records.alpha.step_id).toBe('documents'));
});

test('eksempelknappen læser eksisterende sag og seneste rapport og skriver kun guidefremdrift', async () => {
  authFetch.mockImplementation((url, options = {}) => {
    if (url === '/api/v3/cases') return reply({ items: [{ id: 'ordinary', title: 'EKSEMPEL i normal titel', case_id: 'CASE-1' }, { id: 'example', title: 'EKSEMPEL · Fiktiv sag', case_id: 'EKSEMPEL-TEST' }] });
    if (url === '/api/v3/cases/example/workspace') return reply({ assessments: { dpia: [{ id: 'old', version: 1 }, { id: 'new', version: 2 }] } });
    if (options.method === 'PATCH') records.alpha = { ...records.alpha, ...JSON.parse(options.body) };
    return reply(records.alpha);
  });
  render(<App />);
  await click('Se et eksempel');
  expect(await screen.findByRole('heading', { name: /Saml arbejdet/ })).toBeInTheDocument();
  expect(screen.getByTestId('route')).toHaveTextContent('/sager?examples=1&guide_case=example&guide_assessment=new&guide_example=1');
  await click('Næste');
  await screen.findByRole('heading', { name: /Tilknyt dokumenteret grundlag/ });
  await click('Næste');
  await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('/vurdering?assessment_id=new&case=example'));
  expect(authFetch.mock.calls.filter(([, options]) => options?.method && options.method !== 'GET').every(([url, options]) => url === '/api/user/tutorial' && options.method === 'PATCH')).toBe(true);
});

test('brugerbytte skjuler straks forrige guide og ignorerer dens forsinkede gemmesvar', async () => {
  let complete;
  const view = render(<App />);
  await screen.findByRole('dialog');
  authFetch.mockImplementationOnce(() => new Promise(resolve => { complete = () => resolve({ ok: true, json: () => Promise.resolve({ ...fresh, status: 'in_progress', step_id: 'cases' }) }); }));
  await click('Start guide');
  identity = { ...identity, user: { oid: 'beta' } };
  view.rerender(<App />);
  await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => complete());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('route')).toHaveTextContent('/indstillinger');
});

test('samme monterede app afgrænser guidefremdrift efter bruger', async () => {
  const view = render(<App />);
  await click('Start guide');
  await screen.findByRole('heading', { name: /Saml arbejdet/ });
  identity = { ...identity, user: { oid: 'beta' } };
  view.rerender(<App />);
  await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await click('Genstart guide');
  await screen.findByRole('heading', { name: 'Fra sag til dokumenteret vurdering' });
  expect(records.beta).toMatchObject({ status: 'not_started', step_id: 'welcome' });
  expect(records.alpha).toMatchObject({ status: 'in_progress', step_id: 'cases' });
});

test('gemmefejl bliver synlig uden automatisk gentagelse og kan lukkes lokalt', async () => {
  render(<App />);
  await screen.findByRole('dialog');
  authFetch.mockRejectedValueOnce(new Error('offline'));
  await click('Start guide');
  expect(await screen.findByRole('alert')).toHaveTextContent('Din fremdrift kunne ikke gemmes');
  expect(authFetch).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('route')).toHaveTextContent('/indstillinger');
  await click('Luk uden at gemme');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(authFetch).toHaveBeenCalledTimes(2);
});

test('dialogen fanger fokus, Escape gemmer fravalg og returnerer fokus', async () => {
  records.alpha = { ...fresh, status: 'completed', step_id: 'finish' };
  render(<App />);
  const opener = screen.getByRole('button', { name: 'Genstart guide' });
  await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1));
  opener.focus();
  await click('Genstart guide');
  const heading = await screen.findByRole('heading', { name: 'Fra sag til dokumenteret vurdering' });
  expect(heading).toHaveFocus();
  expect(document.querySelector('[data-tutorial-background]')).toHaveAttribute('inert');
  fireEvent.keyDown(heading, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Se et eksempel' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Luk guide' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(records.alpha.status).toBe('dismissed');
  expect(opener).toHaveFocus();
  expect(document.querySelector('[data-tutorial-background]')).not.toHaveAttribute('inert');
});

test('guiden venter på et forsinket routeanker før næste trin', async () => {
  records.alpha = { ...fresh, status: 'in_progress', step_id: 'cases' };
  const view = render(<App targets={false} />);
  await screen.findByRole('dialog');
  expect(screen.getByRole('button', { name: 'Næste' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Åbner det relevante område');
  view.rerender(<App targets />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Næste' })).toBeEnabled());
});

test('afslutning gemmes, og læsefejl udløser ingen gentagelsesløkke', async () => {
  records.alpha = { ...fresh, status: 'in_progress', step_id: 'finish' };
  const view = render(<App />);
  await click('Afslut guide');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(records.alpha.status).toBe('completed');
  view.unmount();
  authFetch.mockRejectedValueOnce(new Error('offline'));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Guidens gemte fremdrift kunne ikke hentes');
  expect(authFetch).toHaveBeenCalledTimes(3);
});

test('downloadtrinnet adresserer præcis samme vurdering og sag', () => {
  expect(tutorialDestination('export', { caseId: 'case/1', assessmentId: 'version&2' })).toEqual({ path: '/vurdering?assessment_id=version%262&case=case%2F1', target: '[data-tour="assessment-downloads"]' });
});
