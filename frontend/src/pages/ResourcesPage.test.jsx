import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import ResourcesPage from './ResourcesPage';
import KnowledgeBasePage from './KnowledgeBasePage';
import reports from '../data/rapporterFallback.json';
import resourceLibrary from '../data/resourceLibrary';
import ToolWorkspace from '../components/ToolWorkspace';

const mount = (Page, path = '/') => render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[path]}><Page /></MemoryRouter></ThemeProvider>);
beforeEach(() => { localStorage.clear(); global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }); });

test('rapportfilter viser flyttede rapporter med udgiver, årstal og originale links', () => {
  mount(ResourcesPage);
  expect(screen.getAllByRole('link')).toHaveLength(resourceLibrary.length);
  fireEvent.click(screen.getByRole('button', { name: 'Rapport', exact: true }));
  const report = reports.find(item => item.id === 5);
  const card = screen.getByRole('link', { name: new RegExp(report.titel) });
  expect(card).toHaveAttribute('href', report.link);
  expect(within(card).getByText('Digitaliseringsstyrelsen · 2024 · Signaturprojekter')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /GDPR — Databeskyttelsesforordningen/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Søg i vejledninger og publikationer' }), { target: { value: 'Digitaliseringsstyrelsen' } });
  expect(screen.getByRole('link', { name: new RegExp(report.titel) })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Søg i vejledninger og publikationer' }), { target: { value: '2020' } });
  expect(screen.getByRole('link', { name: /Analyse af kunstig intelligens i et sikkerhedsperspektiv/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ryd alle' }));
  expect(screen.getAllByRole('link')).toHaveLength(resourceLibrary.length);
});

test('rapporter uden registreret sprog kan stadig filtreres uden at opfinde et sprog', () => {
  mount(ResourcesPage);
  fireEvent.click(screen.getByRole('button', { name: 'Rapporter og publikationer', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Ikke angivet', exact: true }));
  expect(screen.getAllByRole('link')).toHaveLength(reports.length);
  fireEvent.change(screen.getByRole('textbox', { name: 'Søg i vejledninger og publikationer' }), { target: { value: 'xyz-ingen-match' } });
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('Ingen ressourcer matcher dine filtre. Prøv at rydde dem.')).toBeInTheDocument();
});

test('begrebsvisningen har ikke længere et selvstændigt rapportkatalog', async () => {
  mount(KnowledgeBasePage);
  await screen.findByText('Det fælles opslagsværk har endnu ingen begreber. Egne noter gemmes særskilt i denne browser.');
  expect(screen.queryByText('Relevante Rapporter & Publikationer')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Evaluering af Signaturprojekterne/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tilføj egen opslagsnote' })).toBeInTheDocument();
});

test('faneskift bevarer brugerens redigerede søgning og kategori selv om preview-parameteren fjernes', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => [
    { id: 1, term: 'GDPR og sletning', category: 'legal', definition: 'Juridisk forklaring', tags: [], references: [] },
    { id: 2, term: 'Logning og sletning', category: 'technical', definition: 'Teknisk forklaring', tags: [], references: [] },
  ] });
  render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={['/videnbase?query=GDPR&preview=old']}><Routes><Route element={<ToolWorkspace title="Viden og vejledning" views={[
    { path: '/videnbase', label: 'Begreber', element: <KnowledgeBasePage /> },
    { path: '/ressourcer', label: 'Vejledninger og publikationer', element: <ResourcesPage /> },
  ]} />}><Route path="/videnbase" /><Route path="/ressourcer" /></Route></Routes></MemoryRouter></ThemeProvider>);
  await screen.findByRole('heading', { name: 'GDPR og sletning' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Søg i opslagsværket' }), { target: { value: 'sletning' } });
  fireEvent.click(screen.getByRole('button', { name: 'Juridiske Termer', exact: true }));
  fireEvent.click(screen.getByRole('link', { name: 'Vejledninger og publikationer', exact: true }));
  expect(screen.queryByRole('textbox', { name: 'Søg i opslagsværket' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Begreber', exact: true }));
  expect(screen.getByRole('textbox', { name: 'Søg i opslagsværket' })).toHaveValue('sletning');
  expect(screen.getByRole('button', { name: 'Juridiske Termer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { name: 'GDPR og sletning' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Logning og sletning' })).not.toBeInTheDocument();
});


test('et søgeresultat åbner kun den valgte kilde og kan vise hele kataloget igen', () => {
  const report = resourceLibrary.find(item => item.id === 'report-1');
  mount(ResourcesPage, '/ressourcer?resource_id=report-1');
  expect(screen.getByRole('status')).toHaveTextContent('Kilde fra søgeresultatet');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: new RegExp(report.title) })).toHaveAttribute('href', report.url);
  fireEvent.click(screen.getByRole('button', { name: 'Vis alle vejledninger og rapporter' }));
  expect(screen.getAllByRole('link')).toHaveLength(resourceLibrary.length);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('et nyt resource_id rydder gamle filtre, mens øvrig sagskontekst bevares', () => {
  function View() {
    const navigate = useNavigate();
    const location = useLocation();
    return <><ResourcesPage /><button onClick={() => navigate('/ressourcer?resource_id=ai-act&case=municipal-case')}>Åbn næste kilde</button><span data-testid="resource-location">{location.search}</span></>;
  }
  mount(View, '/ressourcer?resource_id=report-1&case=municipal-case');
  fireEvent.change(screen.getByRole('textbox', { name: 'Søg i vejledninger og publikationer' }), { target: { value: 'ingen match' } });
  fireEvent.click(screen.getByRole('button', { name: 'Åbn næste kilde' }));
  expect(screen.getByRole('textbox', { name: 'Søg i vejledninger og publikationer' })).toHaveValue('');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj');
  fireEvent.click(screen.getByRole('button', { name: 'Vis alle vejledninger og rapporter' }));
  expect(screen.getByTestId('resource-location')).toHaveTextContent('?case=municipal-case');
});

test('ukendt resource_id forklares uden at vælge en forkert kilde', () => {
  mount(ResourcesPage, '/ressourcer?resource_id=ukendt-kilde');
  expect(screen.getByRole('status')).toHaveTextContent('Kilden findes ikke i kataloget');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vis alle vejledninger og rapporter' }));
  expect(screen.getAllByRole('link')).toHaveLength(resourceLibrary.length);
});
