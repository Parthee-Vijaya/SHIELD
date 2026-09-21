import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from 'react-query';
import axios from 'axios';
import { lightTheme } from '../theme';
import AiActAssessmentPage from './AiActAssessmentPage';
import FriaAssessmentPage from './FriaAssessmentPage';
import AssessmentCaseSelect from '../components/workflow/AssessmentCaseSelect';

jest.mock('axios');
const mount = (Page, url = '/') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } }, logger: { log: () => {}, warn: () => {}, error: () => {} } })}><ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}><Page /></MemoryRouter></ThemeProvider></QueryClientProvider>);
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tab = name => fireEvent.click(screen.getByRole('button', { name: new RegExp(`Trin .*${name}`) }));
const cases = [{ id: 'case-uuid', case_id: 'KAL-2026-001', title: 'Kommunens AI-løsning' }];
beforeEach(() => { jest.clearAllMocks(); axios.get.mockResolvedValue({ data: { items: cases } }); });

test.each([
  [AiActAssessmentPage, ['System og rolle', 'Forbudte praksisser', 'Risikoklasse', 'Transparens'], 'Vis rolle, risiko og pligter'],
  [FriaAssessmentPage, ['Formål og berørte', 'Grundlæggende rettigheder', 'Nødvendighed', 'Kontrol og klage'], 'Vis samlet FRIA'],
])('formularen tillader fri navigation med ufuldstændige felter, bevarer data og validerer først ved afslutning', async (Page, labels, submit) => {
  mount(Page, '/?case_id=case-not-in-list');
  await screen.findByRole('option', { name: /Kommunens AI-løsning/ });
  change('Systemnavn', 'En bevaret kladde');
  expect(screen.getByLabelText('Sag')).toHaveValue('case-not-in-list');
  fireEvent.click(screen.getByRole('button', { name: 'Næste' }));
  expect(screen.getByRole('button', { name: new RegExp(`Trin .*${labels[1]}`) })).toHaveAttribute('aria-current', 'step');
  labels.forEach(tab);
  expect(axios.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: submit }));
  expect(screen.getByRole('alert')).toHaveTextContent('tegn');
  expect(screen.getByLabelText('Systemnavn')).toHaveValue('En bevaret kladde');
  expect(screen.getByLabelText('Sag')).toHaveValue('case-not-in-list');
  expect(axios.post).not.toHaveBeenCalled();
});

test('AI Act sender valgt eksisterende sag og de bevarede svar først ved samlet vurdering', async () => {
  axios.post.mockResolvedValue({ data: { classification: 'low', summary: 'Gemte oplysninger er vurderet.', obligations: [] } });
  mount(AiActAssessmentPage);
  await screen.findByRole('option', { name: /Kommunens AI-løsning/ });
  change('Sag', 'case-uuid'); change('Systemnavn', 'AI til borgervejledning');
  change('Tilsigtet formål', 'Løsningen hjælper medarbejdere med at skrive udkast til borgervejledning.');
  change('Anvendelseskontekst', 'Løsningen anvendes internt i kommunens borgerservice med manuel kontrol.');
  fireEvent.click(screen.getByRole('checkbox', { name: /Idriftsætter/ }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Er løsningen et AI-system efter forordningens definition?' })).getByRole('radio', { name: 'Ja' }));
  tab('Risikoklasse');
  fireEvent.click(screen.getByRole('checkbox', { name: /Væsentlige offentlige ydelser/ }));
  tab('System og rolle'); expect(screen.getByLabelText('Sag')).toHaveValue('case-uuid');
  tab('Transparens'); expect(axios.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Vis rolle, risiko og pligter' }));
  expect(await screen.findByText('Gemte oplysninger er vurderet.')).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith('/api/ai-act/assess', expect.objectContaining({ case_id: 'case-uuid', declared_roles: ['deployer'], annex_iii_use_cases: ['essential_public_services_or_benefits'] }));
});

test('FRIA afslutning finder manglende rettighedstrin efter udfyldt kontekst', async () => {
  mount(FriaAssessmentPage, '/?case_id=case-uuid');
  await screen.findByRole('option', { name: /Kommunens AI-løsning/ });
  change('Systemnavn', 'Beslutningsstøtte');
  ['Formål og forventet fordel', 'Konkret anvendelseskontekst', 'Periode og hyppighed', 'Særlige sårbarheder og afhængighedsforhold'].forEach(label => change(label, 'Et konkret beskrevet forhold med tilstrækkeligt grundlag til vurderingen.'));
  change('Ansvarlig for beslutningen', 'Fagchef');
  fireEvent.click(screen.getByRole('checkbox', { name: /Borgere generelt/ }));
  tab('Kontrol og klage'); fireEvent.click(screen.getByRole('button', { name: 'Vis samlet FRIA' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Vælg mindst én relevant grundlæggende rettighed');
  expect(screen.getByRole('button', { name: /Trin .*Grundlæggende rettigheder/ })).toHaveAttribute('aria-current', 'step');
  expect(axios.post).not.toHaveBeenCalled();
});

function Picker() { const [value, setValue] = useState('EXTERNAL-123'); return <><AssessmentCaseSelect id="case" value={value} onChange={setValue} /><span>{value}</span></>; }
test('sagsreference udenfor listen bevares og manuel reference virker ved netværksfejl', async () => {
  axios.get.mockRejectedValue(new Error('Offline')); mount(Picker);
  expect(await screen.findByRole('status')).toHaveTextContent('Sagslisten kunne ikke hentes');
  expect(screen.getByLabelText('Sag')).toHaveValue('EXTERNAL-123');
  change('Sag', '__manual__'); change('Eksisterende sagsreference', 'GENTOFTE-2026-002');
  await waitFor(() => expect(screen.getByText('GENTOFTE-2026-002')).toBeInTheDocument());
  expect(axios.post).not.toHaveBeenCalled();
});

test('FRIA bevarer slutkontrol af risikoreduktion og verificeringsbevis før et positivt gemmeforløb', async () => {
  axios.post.mockResolvedValue({ data: { summary: 'FRIA med ansvar og kontrol er gemt.', blockers: [] } });
  mount(FriaAssessmentPage, '/?case_id=case-uuid');
  await screen.findByRole('option', { name: /Kommunens AI-løsning/ });
  const detail = 'Et konkret beskrevet forhold med tilstrækkeligt grundlag til den faglige vurdering.';
  change('Systemnavn', 'AI beslutningsstøtte');
  ['Formål og forventet fordel', 'Konkret anvendelseskontekst', 'Periode og hyppighed', 'Særlige sårbarheder og afhængighedsforhold'].forEach(label => change(label, detail));
  change('Ansvarlig for beslutningen', 'Fagchef');
  fireEvent.click(screen.getByRole('checkbox', { name: /Borgere generelt/ }));
  tab('Grundlæggende rettigheder');
  fireEvent.click(screen.getByRole('checkbox', { name: /Menneskelig værdighed/ }));
  change('Hvordan kan rettigheden blive påvirket?', detail);
  change('Konkrete skadescenarier', 'Borgeren bliver fejlbehandlet.');
  change('Iboende alvor', '3'); change('Forventet resterende alvor', '1');
  tab('Nødvendighed');
  ['Legitimt og konkret mål', 'Præcis hjemmel eller mandat', 'Hvorfor er løsningen egnet til at nå målet?', 'Mindre indgribende alternativer', 'Data- og funktionsminimering', 'Forventet offentlig fordel', 'Forventet omkostning for grundlæggende rettigheder', 'Samlet afvejning og begrundelse for den valgte løsning'].forEach(label => change(label, detail));
  tab('Kontrol og klage');
  ['Ansvarlig rolle og mandat', 'Kompetencer og uddannelse', 'Review-, tilsidesættelses- og stopprocedure', 'Kontrol mod automation bias', 'Kontaktpunkt', 'Svarmål', 'Tilgængelighed og støtte til berørte grupper', 'Målinger', 'Hændelses- og eskalationsproces', 'Ændringer der udløser nyt review', 'Ansvarlig funktion'].forEach(label => change(label, detail));
  change('Næste review', '2027-01-15');
  fireEvent.click(screen.getByRole('button', { name: 'Vis samlet FRIA' }));
  expect(screen.getByRole('alert')).toHaveTextContent('En angivet risikoreduktion kræver mindst én konkret foranstaltning');
  expect(axios.post).not.toHaveBeenCalled();
  change('Foranstaltning 1', 'Manuel kontrol'); change('Ansvarlig', 'Fagchef'); change('Beskrivelse', detail);
  change('Status', 'implemented_verified');
  fireEvent.click(screen.getByRole('button', { name: 'Vis samlet FRIA' }));
  expect(screen.getByRole('alert')).toHaveTextContent('dokumentér verificering');
  expect(axios.post).not.toHaveBeenCalled();
  change('Evidens', 'Kontrolproceduren er afprøvet og dokumenteret i det godkendte referat.');
  fireEvent.click(screen.getByRole('button', { name: 'Vis samlet FRIA' }));
  expect(await screen.findByText('FRIA med ansvar og kontrol er gemt.')).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith('/api/fria/assess', expect.objectContaining({ case_id: 'case-uuid' }));
});
