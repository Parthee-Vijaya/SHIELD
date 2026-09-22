import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import WorkspaceSearch from './WorkspaceSearch';
import CommandPalette from '../command-palette/CommandPalette';
import ResourcesPage from '../../pages/ResourcesPage';
import resourceLibrary from '../../data/resourceLibrary';
import { fuzzyScore, normalizeSearch, safeSearchRoute, navigationResults, resourceResults, safeResourceUrl } from './searchUtils';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
const result = (type, id, title, route = `/sager/${id}`) => ({ id, type, title, summary: 'Gemte oplysninger', action: { route } });
const response = items => ({ ok: true, json: async () => ({ results: items }) });
let authFetch;
function Location() { const location = useLocation(); return <span data-testid="search-location">{location.pathname}{location.search}</span>; }
function mount(children = <WorkspaceSearch />) { return render(<ThemeProvider theme={lightTheme}><MemoryRouter>{children}<Location /></MemoryRouter></ThemeProvider>); }
beforeEach(() => {
  authFetch = jest.fn().mockResolvedValue(response([]));
  useAuth.mockReturnValue({ ready: true, isAuthenticated: true, user: { oid: 'reader' }, authFetch });
});

test('Danish spellings, accent forms and transpositions match without matching unrelated terms', () => {
  expect(normalizeSearch('Følsomme målinger Ændringer')).toBe('folsomme maalinger aendringer');
  expect(fuzzyScore('Krips', 'Krisp')).toBeGreaterThan(0);
  expect(fuzzyScore('konsekvensanlyse', 'Konsekvensanalyse og risici')).toBeGreaterThan(0);
  expect(fuzzyScore('vejlednign', 'Viden og vejledning')).toBeGreaterThan(0);
  expect(fuzzyScore('bager', 'Databehandleraftale')).toBe(0);
  expect(navigationResults('GPT')[0].action.route).toBe('/om-loesningen');
  expect(safeSearchRoute({ action: { route: '//external.invalid' } })).toBeNull();
  expect(safeSearchRoute({ action: { route: '/\\external.invalid' } })).toBeNull();
});

test('results arrive while typing, use categories and navigate to the selected version', async () => {
  authFetch.mockResolvedValue(response([
    result('cases', 'case-a', 'Krisp · Kalundborg'),
    result('assessments', 'dpia-a', 'Krisp · Konsekvensanalyse version 6', '/vurdering?assessment_id=dpia-a&case=case-a'),
    result('documents', 'document-a', 'Krisp · Databehandleraftale', '/dokumentbank?document_id=document-a'),
  ]));
  mount();
  const input = screen.getByRole('combobox', { name: 'Søg på tværs af SHIELD' });
  fireEvent.change(input, { target: { value: 'Krips' } });
  expect(screen.getByRole('status')).toHaveTextContent('Søger i sager');
  expect(await screen.findByRole('group', { name: 'Sager' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Dokumenter' })).toBeInTheDocument();
  const assessments = screen.getByRole('group', { name: 'Vurderinger' });
  expect(within(assessments).getByRole('option')).toHaveAttribute('href', '/vurdering?assessment_id=dpia-a&case=case-a');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByTestId('search-location')).toHaveTextContent('/vurdering?assessment_id=dpia-a&case=case-a');
  expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('an older response cannot replace the latest query and old hits disappear immediately', async () => {
  let resolveOld;
  authFetch.mockImplementation(url => url.includes('Krisp') ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(response([result('cases', 'clear', 'Cleardox · Gentofte')])));
  mount();
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'Krisp' } });
  await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: 'Cleardox' } });
  expect(await screen.findByRole('option', { name: /Cleardox/ })).toBeInTheDocument();
  await act(async () => resolveOld(response([result('cases', 'krisp', 'Krisp · Kalundborg')])));
  expect(screen.queryByRole('option', { name: /Krisp/ })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'xyz' } });
  expect(screen.queryByRole('option', { name: /Cleardox/ })).not.toBeInTheDocument();
});

test('navigation uses the same fuzzy search during outages and retry fetches data', async () => {
  authFetch.mockResolvedValue({ ok: false, status: 503 });
  mount();
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'vejlednign' } });
  expect(screen.getByRole('option', { name: /Viden og vejledning/ })).toHaveAttribute('href', '/videnbase');
  expect(await screen.findByRole('alert')).toHaveTextContent('kunne ikke hentes');
  authFetch.mockResolvedValue(response([result('cases', 'guide', 'Vejledning til intern brug')]));
  fireEvent.click(screen.getByRole('button', { name: 'Prøv igen' }));
  expect(await screen.findByRole('option', { name: /Vejledning til intern brug/ })).toBeInTheDocument();
});

test('unauthenticated sessions do not fetch or show private search metadata', async () => {
  useAuth.mockReturnValue({ ready: true, isAuthenticated: false, authFetch });
  mount();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Krisp' } });
  await act(async () => new Promise(resolve => setTimeout(resolve, 300)));
  expect(authFetch).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('0 resultater');
});

test('the keyboard launcher searches case data too and closes on navigation', async () => {
  const onClose = jest.fn();
  authFetch.mockResolvedValue(response([result('cases', 'case-a', 'Krisp · Kalundborg')]));
  mount(<CommandPalette isOpen onClose={onClose} />);
  const input = screen.getByRole('combobox');
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'Krisp' } });
  fireEvent.click(await screen.findByRole('option', { name: /Krisp/ }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('search-location')).toHaveTextContent('/sager/case-a');
});

test('clear and Escape close the search without navigating', async () => {
  mount();
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'xxyyzz' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 resultater'));
  fireEvent.click(screen.getByRole('button', { name: 'Ryd søgning på tværs af SHIELD' }));
  expect(input).toHaveValue('');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-location')).toHaveTextContent('/');
});

test('rapid typing issues one request and changing user hides previous private hits', async () => {
  authFetch.mockResolvedValue(response([result('cases', 'case-a', 'Krisp · Kalundborg')]));
  const view = mount();
  const input = screen.getByRole('combobox');
  ['Kr', 'Kris', 'Krisp'].forEach(value => fireEvent.change(input, { target: { value } }));
  expect(await screen.findByRole('option', { name: /Krisp/ })).toBeInTheDocument();
  expect(authFetch).toHaveBeenCalledTimes(1);
  expect(authFetch).toHaveBeenCalledWith('/api/search/global?q=Krisp&limit=4', expect.anything());
  useAuth.mockReturnValue({ ready: true, isAuthenticated: false, authFetch });
  view.rerender(<ThemeProvider theme={lightTheme}><MemoryRouter><WorkspaceSearch /><Location /></MemoryRouter></ThemeProvider>);
  expect(screen.queryByRole('option', { name: /Krisp/ })).not.toBeInTheDocument();
});


test('public report metadata is fuzzy-searchable and opens the matching source page', async () => {
  const report = resourceLibrary.find(item => item.id === 'report-1');
  mount(<Routes><Route path="/" element={<WorkspaceSearch />} /><Route path="/ressourcer" element={<ResourcesPage />} /></Routes>);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'medfinansere' } });
  const option = await screen.findByRole('option', { name: new RegExp(report.title) });
  expect(option).toHaveAttribute('href', '/ressourcer?resource_id=report-1');
  expect(within(screen.getByRole('group', { name: 'Sider og vejledning' })).getByRole('option', { name: new RegExp(report.title) })).toBeInTheDocument();
  fireEvent.click(option);
  expect(screen.getByTestId('search-location')).toHaveTextContent('/ressourcer?resource_id=report-1');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link')).toHaveAttribute('href', report.url);
});

test('public resources reuse canonical merged IDs and reject unsafe URLs', () => {
  const matches = resourceResults('Datatilsynet');
  expect(new Set(matches.map(item => item.id)).size).toBe(matches.length);
  expect(matches.every(item => item.action.route.startsWith('/ressourcer?resource_id='))).toBe(true);
  expect(resourceResults('')).toEqual([]);
  expect(safeResourceUrl('https://example.dk/guide')).toBe('https://example.dk/guide');
  expect(safeResourceUrl('/videnbase?query=AI')).toBe('/videnbase?query=AI');
  // eslint-disable-next-line no-script-url -- Malicious strings are asserted rejected, never opened.
  ['javascript:alert(1)', 'data:text/html,test', '//example.dk', '/\\example.dk', 'file:///tmp/source', 'https://user:password@example.dk', 'https://example.dk/\nlink'].forEach(url => expect(safeResourceUrl(url)).toBeNull());
});


test('the keyboard dialog traps Tab and returns focus to its launcher after Escape', () => {
  function ControlledPalette() {
    const [isOpen, setOpen] = React.useState(false);
    return <><button onClick={() => setOpen(true)}>Åbn søgning</button><CommandPalette isOpen={isOpen} onClose={() => setOpen(false)} /></>;
  }
  mount(<ControlledPalette />);
  const trigger = screen.getByRole('button', { name: 'Åbn søgning' });
  trigger.focus();
  fireEvent.click(trigger);
  const input = screen.getByRole('combobox');
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: 'Tab' });
  const close = screen.getByRole('button', { name: 'Luk søgning' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
