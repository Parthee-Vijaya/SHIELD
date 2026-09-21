import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from 'react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import TechnicalRunsPanel from './TechnicalRunsPanel';

jest.mock('axios');
const source = { id: 'document:1', title: 'Databehandleraftale', text: 'Den gemte aftale kræver dokumenteret sletning.', source_url: 'https://krisp.ai/Krisp-DPA.pdf', kind: 'document', version: 2, checksum: 'a'.repeat(64) };
const output = { id: 'summary', label: 'Resumé og afgrænsning', kind: 'summary', fields: { Resumé: 'Sagen afventer dokumentation for sletning.' }, source_ids: [source.id] };
const review = { model: 'typesafe-ai/jev', rubric_version: 'review-v4', threshold: 0.5, threshold_note: 'Største signal fra delkontrollerne vises.', criteria: ['Påstande skal understøttes af kilder.'], criteria_note: 'Beskrivelse fra den versionsbestemte kode.', reasoning_note: 'JEV har ikke gemt en skriftlig begrundelse.', usage: [{ inputTokens: 321, outputTokens: 12 }], checks: [
  { id: 'scope', label: 'Resuméets kildeunderstøttelse', probability: 0.54, requires_review: true, output_item_ids: ['summary'], source_ids: [source.id], section_ids: ['summary'] },
  { id: 'risk:4.7', label: 'Risiko 4.7', probability: 0.12, requires_review: false, output_item_ids: ['risk:4.7'], source_ids: [], section_ids: ['risk:4.7'] },
] };
const run = { id: 'dpia:a2', assessment_id: 'a2', version: 2, kind: 'dpia_ai', created_at: '2026-09-21T10:00:00Z', generation_created_at: '2026-09-21T09:59:00Z', model: 'gpt-5.6-sol', provider: 'codex-local', prompt_version: 'draft-v3', provenance: { model_attestation: 'operator_reported', run_id: 'run-1' }, input_snapshot: { purpose: 'Interne projektmøder', model_training: null }, output_items: [output], sources: [source], review, usage: { drafting: null, evaluation: review.usage }, stages: [{ id: 'draft', title: 'Udarbejdelse', description: 'AI skriver ud fra det gemte grundlag.' }], recording_notes: ['Den præcise prompt er ikke gemt.'] };

function Location() { const location = useLocation(); return <output aria-label="Adresse">{location.search}</output>; }
function mount(runs = [run], url = '/sager/c1?tab=technical-runs', response) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0, refetchOnWindowFocus: false } } });
  axios.get.mockImplementation(response || (() => Promise.resolve({ data: { case_id: 'c1', runs } })));
  return render(<QueryClientProvider client={client}><ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}><TechnicalRunsPanel caseId="c1" /><Location /></MemoryRouter></ThemeProvider></QueryClientProvider>);
}
async function expand(label, scope = screen) {
  const summary = (await scope.findByText(label)).closest('summary');
  fireEvent.click(summary);
  await waitFor(() => expect(summary.parentElement).toHaveAttribute('open'));
  return within(summary.parentElement);
}
beforeEach(() => jest.clearAllMocks());

test('viser faktisk model, problemsignal og foldet kontrolgrundlag uden nye modelkald', async () => {
  mount();
  expect(await screen.findByText('gpt-5.6-sol')).toBeInTheDocument();
  expect(screen.getByLabelText('Vis kontrolpunkter')).toHaveValue('attention');
  expect(screen.queryByText('Risiko 4.7')).not.toBeInTheDocument();
  const check = await expand('Resuméets kildeunderstøttelse');
  expect(await check.findByText('0,54')).toBeInTheDocument();
  expect(check.getByText('Problemsignal')).toBeInTheDocument();
  const content = await expand('Resumé og afgrænsning', check);
  expect(await content.findByText('Sagen afventer dokumentation for sletning.')).toBeInTheDocument();
  const evidence = await expand('Grundlag for kontrollen (1 kilder)', check);
  const document = await expand('Databehandleraftale', evidence);
  expect(await document.findByText(source.text)).toBeInTheDocument();
  expect(document.getByRole('link')).toHaveAttribute('href', source.source_url);
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(axios.get).toHaveBeenCalledWith('/api/v3/cases/c1/technical-runs');
  expect(axios.post).not.toHaveBeenCalled();
});

test('viser ikke manglende Codex-forbrug som nul og summerer JEV-poster kun én gang', async () => {
  mount();
  await screen.findByText('gpt-5.6-sol');
  const usage = await expand('Registreret forbrug');
  expect(await usage.findByText('321')).toBeInTheDocument();
  expect(usage.getAllByText('321')).toHaveLength(1);
  expect(usage.getByText('Ikke registreret')).toBeInTheDocument();
  expect(usage.queryByText('0')).not.toBeInTheDocument();
  const provenance = await expand('Modeloplysninger og kørsels-ID');
  expect(await provenance.findByText(/oplyst af operatøren ved import/)).toBeInTheDocument();
});

test('håndterer Gateway-forbrug i flere drafting-poster uden at medregne evaluation igen', async () => {
  mount([{ ...run, usage: { drafting: [{ inputTokens: 100, outputTokens: 10 }, { inputTokens: 20, outputTokens: 5 }], evaluation: [{ inputTokens: 999 }] } }]);
  await screen.findByText('gpt-5.6-sol');
  const usage = await expand('Registreret forbrug');
  expect(await usage.findByText('120')).toBeInTheDocument();
  expect(usage.getByText('15')).toBeInTheDocument();
  expect(usage.queryByText('999')).not.toBeInTheDocument();
});

test('vælger præcis historisk version fra link og bevarer sagens øvrige parametre', async () => {
  const baseline = { ...run, id: 'dpia:a1', assessment_id: 'a1', version: 1, kind: 'dpia_rules', model: null, review: null, output_items: [], sources: [], usage: null };
  mount([run, baseline], '/sager/c1?tab=technical-runs&assessment_id=a1&guide_case=c1');
  expect(await screen.findByText('Ingen JEV-kontrol registreret')).toBeInTheDocument();
  expect(screen.getByLabelText('Vælg kørsel eller rapportversion')).toHaveValue('dpia:a1');
  fireEvent.change(screen.getByLabelText('Vælg kørsel eller rapportversion'), { target: { value: 'dpia:a2' } });
  expect(screen.getByLabelText('Adresse')).toHaveTextContent('assessment_id=a2&guide_case=c1&run_id=dpia%3Aa2');
  expect(screen.getByText('gpt-5.6-sol')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Åbn denne rapportversion/ })).toHaveAttribute('href', '/vurdering?assessment_id=a2&case=c1');
});

test('vælger seneste rapport ved normal indgang, selv om sagen også har en materialeanalyse', async () => {
  mount([run, { ...run, id: 'material:m1', assessment_id: null, version: null, kind: 'material_analysis', model: 'material-model' }]);
  expect(await screen.findByText('gpt-5.6-sol')).toBeInTheDocument();
  expect(screen.getByLabelText('Vælg kørsel eller rapportversion')).toHaveValue('dpia:a2');
  expect(screen.queryByText('material-model')).not.toBeInTheDocument();
});

test('viser den faktisk kontrollerede historiske tekst efter manuel revision', async () => {
  const historic = { ...output, fields: { Resumé: 'Tidligere tekst som JEV kontrollerede.' } };
  mount([{ ...run, kind: 'dpia_revision', editorial_revision: { note: 'Resuméet er præciseret.' }, review: { ...review, reviewed_output_items: [historic], reviewed_assessment_id: 'a1', checks: [{ ...review.checks[0], stale: true }] } }]);
  await screen.findByText('Fagligt redigeret version – ingen ny AI-kørsel');
  const check = await expand('Resuméets kildeunderstøttelse');
  expect(await check.findByText('Tidligere problemsignal')).toBeInTheDocument();
  const content = await expand('Resumé og afgrænsning', check);
  expect(await content.findByText('Tidligere tekst som JEV kontrollerede.')).toBeInTheDocument();
  expect(content.queryByText('Sagen afventer dokumentation for sletning.')).not.toBeInTheDocument();
});

test('søger og paginerer kontrolpunkter og nulstiller side ved filtrering', async () => {
  const checks = Array.from({ length: 19 }, (_, index) => ({ id: `check-${index}`, label: `Kontrol nummer ${index + 1}`, probability: .1, requires_review: false, source_ids: [], output_item_ids: [] }));
  mount([{ ...run, review: { ...review, checks } }]);
  await screen.findByText('Kontrol nummer 1');
  expect(screen.queryByText('Kontrol nummer 9')).not.toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Sider i JEV-kontrolpunkter' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Næste' }));
  expect(screen.getByText('Kontrol nummer 9')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Søg i JEV-kontrolpunkter'), { target: { value: 'nummer 19' } });
  expect(screen.getByText('Kontrol nummer 19')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Sider i JEV-kontrolpunkter' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Vis kontrolpunkter'), { target: { value: 'attention' } });
  expect(screen.getByText(/Ingen kontrolpunkter matcher valget/)).toBeInTheDocument();
});

test('gengiver kildetekst som tekst og opretter ikke usikre kildelinks', async () => {
  mount([{ ...run, sources: [{ ...source, title: 'Ugyldig kilde', source_url: 'javascript:alert(1)', text: '<img src=x onerror=alert(1)>' }] }]);
  await screen.findByText('gpt-5.6-sol');
  const document = await expand('Ugyldig kilde');
  expect(await document.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(document.queryByRole('link')).not.toBeInTheDocument();
  expect(document.queryByRole('img')).not.toBeInTheDocument();
});

test('viser loading, fejl og fungerende genforsøg uden mutationer', async () => {
  let rejectRequest;
  mount([], undefined, () => new Promise((resolve, reject) => { rejectRequest = reject; }));
  expect(screen.getByText('Henter registrerede kørsler…').parentElement).toHaveAttribute('role', 'status');
  rejectRequest(new Error('Server unavailable'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Kørselsoplysningerne kunne ikke hentes');
  axios.get.mockResolvedValue({ data: { runs: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Prøv igen' }));
  expect(await screen.findByText('Ingen registrerede kørsler endnu')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});
