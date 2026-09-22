import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from 'react-query';
import { TextDecoder, TextEncoder } from 'util';
import axios from 'axios';
import { lightTheme } from '../theme';
import LawAssistantPage from './LawAssistantPage';
import ResearchPage from './ResearchPage';
import EuAiActCheckerPage from './EuAiActCheckerPage';
import KnowledgeBasePage from './KnowledgeBasePage';
import AIProjectsPage from './AIProjectsPage';
import DriftPage from './DriftPage';
import { lawSourceText } from '../utils/lawSourcePresentation';

jest.mock('axios');
const mockAuthFetch = jest.fn((...args) => global.fetch(...args));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ authFetch: mockAuthFetch }) }));
jest.mock('react-hot-toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
const mount = (Page, url = '/') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } }, logger: { log: () => {}, warn: () => {}, error: () => {} } })}><ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}><Page /></MemoryRouter></ThemeProvider></QueryClientProvider>);
const stream = events => ({ ok: true, body: { getReader: () => ({ read: jest.fn().mockResolvedValueOnce({ value: new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')), done: false }).mockResolvedValue({ done: true }) }) } });
beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks(); global.TextDecoder = TextDecoder; global.fetch = jest.fn(); mockAuthFetch.mockImplementation((...args) => global.fetch(...args));
  axios.get.mockResolvedValue({ data: { success: true, categories: [] } });
});
afterEach(() => { jest.restoreAllMocks(); });
async function askLaw(events) {
  await act(async () => {
    fetch.mockResolvedValue(stream(events)); mount(LawAssistantPage);
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Juridisk spørgsmål'), { target: { value: 'Hvad siger loven?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Søg svar' }));
  });
  await waitFor(() => expect(fetch).toHaveBeenCalled());
}
test('lovassistent viser providerfejl og gør ikke en fejlet strøm til et færdigt svar', async () => {
  await askLaw([{ event: 'retrieval', sources: [] }, { event: 'delta', text: 'Ufuldstændig tekst' }, { event: 'error', message: 'Modeltjenesten er ikke tilgængelig.' }]);
  expect(await screen.findByRole('alert')).toHaveTextContent('Modeltjenesten er ikke tilgængelig.');
  expect(screen.getByText('Svaret kunne ikke færdiggøres')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Søg svar' })).toBeEnabled();
});
test('lovassistent kræver final event før et svar er færdigt', async () => {
  await askLaw([{ event: 'delta', text: 'Afbrudt svar' }]);
  expect(await screen.findByRole('alert')).toHaveTextContent('Forbindelsen blev afbrudt, før svaret var færdigt.');
});
test('lovassistent kalder ikke et søgeresultat uden modelkørsel for et AI-svar', async () => {
  await askLaw([{ event: 'retrieval', sources: [] }, { event: 'final', answer: 'Jeg kunne ikke finde relevante love for dit spørgsmål.' }]);
  expect(await screen.findByRole('heading', { name: 'Søgeresultat' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'AI-genereret svar' })).not.toBeInTheDocument();
  expect(screen.getByText('Jeg kunne ikke finde relevante love for dit spørgsmål.')).toBeInTheDocument();
});
test('modeltekst vises som tekst og kan ikke injicere HTML i lovassistenten', async () => {
  const answer = '<img src=x onerror="window.compromised=true"> Lovtekst.';
  await askLaw([{ event: 'final', answer, model: 'gpt-5.6-sol', key_points: [], citations: [] }]);
  expect(await screen.findByText(answer)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'AI-genereret svar' })).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
test('kildesøgning sender valgte fokusområder gennem authFetch og viser faktiske kilder med forbehold', async () => {
  fetch.mockResolvedValue(stream([{ status: 'complete', result: { query: 'Konsekvensanalyse', summary: '**EU:** Kontroller originalen.', sources: [{ title: 'Officiel vejledning', url: 'https://www.datatilsynet.dk/vejledning', domain: 'datatilsynet.dk' }], warnings: ['Kildeindholdet kræver faglig kontrol.'] } }]));
  mount(ResearchPage);
  fireEvent.change(screen.getByLabelText('Emne for kildesøgning'), { target: { value: 'Konsekvensanalyse' } });
  fireEvent.click(screen.getByRole('button', { name: 'EU AI Act' }));
  fireEvent.click(screen.getByRole('button', { name: 'Datatilsynets vejledninger' }));
  fireEvent.click(screen.getByRole('button', { name: 'Søg efter kilder' }));
  await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
  const requested = new URL(mockAuthFetch.mock.calls[0][0], 'http://localhost');
  expect(requested.searchParams.getAll('focus_areas')).toEqual(['GDPR', 'Datatilsynets vejledninger']);
  expect(await screen.findByRole('link', { name: 'Officiel vejledning' })).toHaveAttribute('href', 'https://www.datatilsynet.dk/vejledning');
  expect(screen.getByLabelText('Forbehold for kildesøgningen')).toHaveTextContent('Kildeindholdet kræver faglig kontrol.');
  expect(screen.getByText('EU:').tagName).toBe('STRONG');
});
test('EU-vejviser stopper indlæsning når serveren mangler spørgsmål', async () => {
  axios.get.mockResolvedValue({ data: { ready: false, logic: null, content: null } }); mount(EuAiActCheckerPage);
  expect(await screen.findByRole('alert')).toHaveTextContent('Vejviserens spørgsmål er ikke tilgængelige');
  expect(screen.queryByText('Henter spørgsmål…')).not.toBeInTheDocument();
});
test('egne opslagsnoter gemmes kun lokalt, overlever genindlæsning og kan slettes', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => [] }); const view = mount(KnowledgeBasePage);
  await screen.findByText('Det fælles opslagsværk har endnu ingen begreber. Egne noter gemmes særskilt i denne browser.');
  fireEvent.click(screen.getByRole('button', { name: 'Tilføj egen opslagsnote' })); const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Begreb *'), { target: { value: 'Egen kontrolnote' } });
  fireEvent.change(within(dialog).getByPlaceholderText('Kort og præcis definition af termen...'), { target: { value: 'Et personligt opslagsnotat til senere faglig kontrol.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gem note i denne browser' }));
  expect(screen.getByRole('heading', { name: 'Egen kontrolnote' })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('shield.personal-knowledge-notes.v1'))).toHaveLength(1);
  expect(fetch.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true);
  view.unmount(); mount(KnowledgeBasePage);
  expect(await screen.findByRole('heading', { name: 'Egen kontrolnote' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Slet egen note: Egen kontrolnote' }));
  expect(screen.queryByRole('heading', { name: 'Egen kontrolnote' })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('shield.personal-knowledge-notes.v1'))).toEqual([]);
  await screen.findByText('Det fælles opslagsværk har endnu ingen begreber. Egne noter gemmes særskilt i denne browser.');
});
test('katalogets lokale kopi mærkes tydeligt ved utilgængelig kilde', async () => {
  axios.get.mockRejectedValue(new Error('offline')); const warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); mount(AIProjectsPage);
  expect(screen.getByText(/Viser en lokal kopi/)).toHaveTextContent('Oplysningerne kan være forældede'); await waitFor(() => expect(warn).toHaveBeenCalled());
});
test('driftsfejl må ikke vises som nul registrerede fejl', async () => {
  axios.get.mockRejectedValue(new Error('Adgang afvist')); mount(DriftPage);
  expect(await screen.findByRole('alert')).toHaveTextContent('Manglende oplysninger er ikke en bekræftelse på fejlfri drift.');
  expect(screen.getByText('Fejlloggen er ikke tilgængelig.')).toBeInTheDocument();
  expect(screen.queryByText('Ingen fejl er registreret i den hentede log.')).not.toBeInTheDocument();
});

test('en søgning åbnet via et link kan stadig ændres af brugeren', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => [] });
  mount(KnowledgeBasePage, '/viden?query=GDPR');
  const search = screen.getByLabelText('Søg i opslagsværket');
  expect(search).toHaveValue('GDPR');
  fireEvent.change(search, { target: { value: 'Sletning' } });
  await waitFor(() => expect(search).toHaveValue('Sletning'));
  await screen.findByText('Det fælles opslagsværk har endnu ingen begreber. Egne noter gemmes særskilt i denne browser.');
});
test('en opslagsnote markeres ikke som gemt hvis browserens lagring fejler', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => [] });
  mount(KnowledgeBasePage);
  await screen.findByText('Det fælles opslagsværk har endnu ingen begreber. Egne noter gemmes særskilt i denne browser.');
  fireEvent.click(screen.getByRole('button', { name: 'Tilføj egen opslagsnote' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Begreb *'), { target: { value: 'Ikke gemt note' } });
  fireEvent.change(within(dialog).getByPlaceholderText('Kort og præcis definition af termen...'), { target: { value: 'Browseren må ikke påstå at dette er gemt.' } });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gem note i denne browser' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Noten er ikke gemt');
  expect(screen.queryByRole('heading', { name: 'Ikke gemt note' })).not.toBeInTheDocument();
});

test('driftsstatus skelner en aktiveret model fra en gennemført svartest', async () => {
  axios.get.mockImplementation(url => Promise.resolve({ data: url === '/health' ? { status: 'healthy', services: { llm: 'configured' }, ai: { provider: 'codex_local', model: 'gpt-5.6-sol', connection: 'local_temporary', status: 'configured' } } : url.includes('errors?') ? { errors: [] } : {} }));
  mount(DriftPage);
  const status = await screen.findByLabelText('AI-forbindelse');
  expect(status).toHaveTextContent('GPT-5.6 Sol · midlertidig lokal AI-forbindelse');
  expect(status).toHaveTextContent('Denne status er ikke en gennemført svartest.');
  expect(status).not.toHaveTextContent(/codex/i);
});
test('lovassistenten viser kilders dokumenterede aktualitetsforbehold', async () => {
  await askLaw([{ event: 'retrieval', sources: [], retrieval: { mode: 'local_catalog', warnings: ['Lovindeksets aktualitet er ikke kontrolleret ved denne forespørgsel.'] } }, { event: 'final', answer: 'Et udkast til faglig kontrol.' }]);
  expect(await screen.findByLabelText('Forbehold for lovkilderne')).toHaveTextContent('Lovindeksets aktualitet er ikke kontrolleret ved denne forespørgsel.');
});

test('lovsvar viser model og kildeforbehold uden at præsentere hardcoded confidence som sikkerhed', async () => {
  await askLaw([{ event: 'retrieval', sources: [], retrieval: { warnings: ['Kontrollér den aktuelle lovtekst.'] } }, { event: 'final', answer: 'Et foreløbigt lovsvar.', model: 'gpt-5.6-sol', confidence: 0.85 }]);
  expect(await screen.findByText('Et foreløbigt lovsvar.')).toBeInTheDocument();
  expect(screen.getByText(/GPT-5.6 Sol/)).toBeInTheDocument();
  expect(screen.getByLabelText('Forbehold for lovkilderne')).toHaveTextContent('Kontrollér den aktuelle lovtekst.');
  expect(screen.queryByText(/85%|sikkerhedsindikator/i)).not.toBeInTheDocument();
});

test('kendt billedplaceholder skjules kun i kildevisning mens lovtekst og rådata bevares', async () => {
  const placeholder = 'Billedgenerering afventer: An official Danish map.';
  const legalText = '§ 1. Denne grundlov gælder for alle dele af Danmarks Rige.';
  const source = { slug: 'grundloven', title: 'Grundloven', summary: placeholder, content: `${placeholder}\n\n${legalText}`, url: 'https://regelrytter.dk/grundloven' };
  await askLaw([{ event: 'retrieval', sources: [source] }, { event: 'final', answer: 'Kontrollér originalkilden.' }]);
  fireEvent.click(await screen.findByText('[1] Grundloven'));
  expect(screen.getByText(legalText)).toBeInTheDocument();
  expect(screen.queryByText(/An official Danish map/)).not.toBeInTheDocument();
  expect(source.content).toBe(`${placeholder}\n\n${legalText}`);
  const quoted = 'Rapporten citerer "Billedgenerering afventer: An official Danish map." som teknisk metadata.';
  expect(lawSourceText(quoted)).toBe(quoted);
});

test('research viser faktisk model og adskiller AI-henvisninger fra tekstuddrag uden sikkerhedsprocenter', async () => {
  const source = { title: 'Officiel kilde', url: 'https://www.datatilsynet.dk/', domain: 'datatilsynet.dk' };
  fetch.mockResolvedValue(stream([{ status: 'complete', result: { query: 'Konsekvensanalyse', model: 'gpt-5.6-sol', llm_answer: 'Et AI-udkast til kontrol.', llm_answer_confidence: 0.88, sources: [source], llm_answer_citations: [1, 2, 3].map(id => ({ title: `Henvisning ${id}`, url: source.url, relevance: 'Emnet behandles i kilden.', confidence: 0.7 })), citations: [1, 2].map(id => ({ text: `Tekstuddrag ${id}`, source, confidence: 0.9 })) } }]));
  mount(ResearchPage);
  fireEvent.change(screen.getByLabelText('Emne for kildesøgning'), { target: { value: 'Konsekvensanalyse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Søg efter kilder' }));
  expect(await screen.findByText(/Udarbejdet med GPT-5.6 Sol/)).toBeInTheDocument();
  expect(screen.queryByText(/88%|70%|90%|sikkerhedsindikator|% sikkerhed/i)).not.toBeInTheDocument();
  const stats = screen.getByText('Henvisninger i AI-svaret').parentElement;
  expect(within(stats).getByText('3')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Tekstuddrag fra kilder (2)' })).toBeInTheDocument();
});

 test('kildesøgning må ikke præsentere en afbrudt strøm som et resultat', async () => {
  fetch.mockResolvedValue(stream([{ status: 'searching', message: 'Kontrollerer kilder', progress: 25 }]));
  mount(ResearchPage);
  fireEvent.change(screen.getByLabelText('Emne for kildesøgning'), { target: { value: 'GDPR søgning' } });
  fireEvent.click(screen.getByRole('button', { name: 'Søg efter kilder' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('før resultatet var færdigt');
  expect(screen.getByRole('button', { name: 'Søg efter kilder' })).toBeEnabled();
});

test.each([[ResearchPage, 'Emne for kildesøgning', 'Søg efter kilder', 'Stop søgning'], [LawAssistantPage, 'Juridisk spørgsmål', 'Søg svar', 'Stop svar']])('aktive forespørgsler kan stoppes og afbrydes ved sideskift', async (Page, field, submit, stop) => {
  fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))));
  const view = mount(Page);
  fireEvent.change(screen.getByLabelText(field), { target: { value: 'GDPR søgning' } });
  fireEvent.click(screen.getByRole('button', { name: submit }));
  await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(1));
  const signal = mockAuthFetch.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole('button', { name: stop }));
  expect(signal.aborted).toBe(true);
  expect(await screen.findByRole('alert')).toHaveTextContent(/stoppede|stoppet/);
  fireEvent.click(screen.getByRole('button', { name: submit }));
  await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(2));
  const nextSignal = mockAuthFetch.mock.calls[1][1].signal;
  view.unmount();
  expect(nextSignal.aborted).toBe(true);
});

test('lovassistent sender sin JSON-forespørgsel gennem den autoriserede fetch', async () => {
  await askLaw([{ event: 'final', answer: 'Syntetisk svar' }]);
  expect(mockAuthFetch).toHaveBeenCalledWith('/api/law/ask/stream', expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'Hvad siger loven?', category: null, mode: 'auto' }), headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' } }));
});
