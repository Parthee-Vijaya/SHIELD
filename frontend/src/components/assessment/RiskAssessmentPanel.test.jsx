import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import RiskAssessmentPanel from './RiskAssessmentPanel';

const risk = (id, overrides = {}) => ({
  id, area: 'Sikkerhed', scenario: `Scenarie for risiko ${id}.`,
  likelihood: 3, impact: 4, inherent_risk: 'very_high',
  residual_likelihood: 2, residual_impact: 3, residual_risk: 'medium',
  measures: `Foranstaltning for ${id}.`, owner: 'Systemejer',
  implementation_status: 'requires_verification', due_date: null,
  ...overrides,
});

const mount = props => render(<ThemeProvider theme={lightTheme}><RiskAssessmentPanel {...props} /></ThemeProvider>);
const riskList = () => screen.getByRole('list', { name: 'Risici i den gemte vurdering' });
const riskButtons = () => within(riskList()).getAllByRole('button');

test('33 risici bliver til seks kompakte rækker ad gangen med alle risici tilgængelige', () => {
  const risks = Object.freeze(Array.from({ length: 33 }, (_, index) => Object.freeze(risk(`3.${index + 1}`, {
    residual_risk: index === 32 ? 'very_high' : index === 7 ? 'high' : 'medium',
  }))));
  const snapshot = JSON.stringify(risks);
  mount({ risks });
  expect(within(screen.getByLabelText('Risikooverblik')).getByText('33')).toBeInTheDocument();
  expect(screen.getByText('Viser 1–6 af 33 risici')).toBeInTheDocument();
  expect(riskButtons()).toHaveLength(6);
  expect(riskButtons()[0]).toHaveTextContent('3.33 · Sikkerhed');
  expect(riskButtons()[1]).toHaveTextContent('3.8 · Sikkerhed');
  riskButtons().forEach(button => expect(button).toHaveAttribute('aria-expanded', 'false'));
  expect(screen.getByText('Foranstaltning for 3.33.')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /3\.33 · Sikkerhed/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Forrige side med risici' })).toBeDisabled();

  const seen = new Set();
  for (let page = 1; page <= 6; page += 1) {
    expect(screen.getByText(`Side ${page} af 6`)).toBeInTheDocument();
    riskButtons().forEach(button => seen.add(button.textContent.match(/^3\.\d+/)[0]));
    if (page < 6) fireEvent.click(screen.getByRole('button', { name: 'Næste side med risici' }));
  }
  expect(seen.size).toBe(33);
  expect(riskButtons()).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Næste side med risici' })).toBeDisabled();
  expect(JSON.stringify(risks)).toBe(snapshot);
});

test('filtre kombinerer restrisiko og område, nulstiller siden og kan ryddes', () => {
  const risks = [
    risk('3.1', { residual_risk: 'very_high' }),
    risk('4.1', { area: 'Rettigheder', residual_risk: 'high' }),
    ...Array.from({ length: 6 }, (_, i) => risk(`5.${i + 1}`, { residual_risk: 'low' })),
  ];
  mount({ risks });
  fireEvent.click(screen.getByRole('button', { name: 'Næste side med risici' }));
  fireEvent.change(screen.getByLabelText('Vis efter restrisiko'), { target: { value: 'priority' } });
  expect(screen.getByText('Viser 1–2 af 2 risici · 8 i alt')).toBeInTheDocument();
  expect(riskButtons()).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Område'), { target: { value: 'Rettigheder' } });
  expect(riskButtons()).toHaveLength(1);
  expect(riskButtons()[0]).toHaveTextContent('4.1 · Rettigheder');
  fireEvent.change(screen.getByLabelText('Vis efter restrisiko'), { target: { value: 'low' } });
  expect(screen.getByText('Ingen risici matcher de valgte filtre.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vis alle risici' }));
  expect(screen.getByLabelText('Område')).toHaveValue('all');
  expect(screen.getByLabelText('Vis efter restrisiko')).toHaveValue('all');
  expect(screen.getByText('Viser 1–6 af 8 risici')).toBeInTheDocument();
});

test('én udfoldet risiko bevarer scenarie, scorer, kontroller, ansvar, kilder og JEV-markeringer', () => {
  const scenario = 'Et konkret muligt risikoscenarie med langt mere tekst end oversigtsrækken viser. Hele teksten skal bevares, inklusive denne afsluttende sætning om de registreredes rettigheder.';
  const sources = jest.fn(() => 'Formål fra sagen · Databehandleraftale version 2');
  mount({
    risks: [risk('3.1', {
      scenario, consequences: 'Medarbejdere kan miste kontrollen over egne oplysninger.',
      rationale: 'Scoren bygger på følsomhed og konkret eksponering.',
      likelihood: 4, measures: ['Begræns adgang.', 'Dokumentér slettetesten.'],
      controls: ['access_control', 'retention_deletion'], owner: 'Informationssikkerhed',
      due_date: '2026-12-01', source_ids: ['input:purpose', 'document:v2'], residual_risk: 'high',
    }), risk('4.1', { area: 'Rettigheder' })],
    reviewChecks: [
      { id: 'risk:3.1', label: 'Dokumentation mangler', section_ids: ['risk:3.1'], requires_review: true, probability: 0.97 },
      { id: 'source-check', label: 'Kildegrundlag kontrolleret', section_ids: ['risk:3.1'], requires_review: false },
      { id: 'unrelated', label: 'Et andet afsnit', section_ids: ['section:2.1'], requires_review: true },
    ],
    sourceReferences: sources,
  });
  expect(screen.getByText('JEV: 1 kontrolpunkt kræver opfølgning.')).toBeInTheDocument();
  expect(screen.queryByText(scenario)).not.toBeInTheDocument();
  const first = screen.getByRole('button', { name: /3\.1 · Sikkerhed/ });
  fireEvent.click(first);
  expect(first).toHaveAttribute('aria-expanded', 'true');
  const detail = screen.getByRole('region', { name: /3\.1 · Sikkerhed/ });
  expect(within(detail).getByText(scenario)).toBeInTheDocument();
  ['Medarbejdere kan miste kontrollen over egne oplysninger.', 'Scoren bygger på følsomhed og konkret eksponering.', 'Begræns adgang.', 'Dokumentér slettetesten.', 'Adgangsstyring', 'Opbevaring og sletning', 'Informationssikkerhed', 'Implementering skal verificeres', '2026-12-01', 'Dokumentation mangler', 'Kildegrundlag kontrolleret', 'Formål fra sagen · Databehandleraftale version 2'].forEach(value => expect(within(detail).getByText(value)).toBeInTheDocument());
  expect(within(detail).getByText('Sandsynlighed efter')).toBeInTheDocument();
  expect(screen.getByText('4 → 2')).toBeInTheDocument();
  expect(sources).toHaveBeenCalledWith(['input:purpose', 'document:v2']);
  expect(screen.queryByText(/0\.97|97 %|97%/)).not.toBeInTheDocument();
  expect(screen.queryByText('Et andet afsnit')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /4\.1 · Rettigheder/ }));
  expect(first).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: /3\.1 · Sikkerhed/ })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: /4\.1 · Rettigheder/ })).toBeInTheDocument();
});

test('historiske risici uden scorer eller metadata får neutrale standardtekster', () => {
  mount({ risks: { scenario: 'Historisk scenarie uden nyere felter.', measures: 'En eksisterende foranstaltning.' }, reviewChecks: null });
  expect(screen.getByText(/1 risiko mangler angivet restrisiko/)).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Ikke angivet (1)' })).toBeInTheDocument();
  expect(screen.getAllByText('— → —')).toHaveLength(2);
  expect(screen.getByText('Begrundelsen mangler i denne version.')).toBeInTheDocument();
  expect(screen.getByText('Konsekvenser for de registrerede er ikke beskrevet.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Vis efter restrisiko'), { target: { value: 'unknown' } });
  fireEvent.click(screen.getByRole('button', { name: /Risiko 1 · Øvrige risici/ }));
  const detail = screen.getByRole('region', { name: /Risiko 1 · Øvrige risici/ });
  expect(within(detail).getByText('En eksisterende foranstaltning.')).toBeInTheDocument();
  expect(within(detail).getByText('Ikke dokumenteret')).toBeInTheDocument();
  expect(within(detail).getByText('Ikke fastlagt')).toBeInTheDocument();
  expect(within(detail).getByText('Ikke angivet')).toBeInTheDocument();
  expect(within(detail).getByText(/Det er derfor ikke beskrevet, hvorfor risikoen er relevant/)).toBeInTheDocument();
  expect(within(detail).getByText(/De berørte personer og mulige følger skal afklares/)).toBeInTheDocument();
  expect(within(riskList()).queryByText('Lav')).not.toBeInTheDocument();
});

test('oversigten skelner begrundelse og konsekvens fra forslag uden at ændre restrisikoen', () => {
  const risks = Object.freeze([Object.freeze(risk('4.1', {
    rationale: 'Lyd sendes til en ekstern tjeneste med ukendt opbevaringstid.',
    consequences: 'Medarbejderes udsagn kan blive tilgængelige for uvedkommende.',
    measures: 'Afprøv en lokal model til transskription og dokumentér automatisk sletning af lyd.',
    residual_risk: 'high', residual_likelihood: 3, residual_impact: 4,
  }))]);
  const snapshot = JSON.stringify(risks);
  mount({ risks });
  const glance = screen.getByLabelText('Kort overblik for 4.1');
  expect(within(glance).getByText('Hvorfor er det en risiko?')).toBeInTheDocument();
  expect(within(glance).getByText(risks[0].rationale)).toBeInTheDocument();
  expect(within(glance).getByText('Hvem rammes – og hvordan?')).toBeInTheDocument();
  expect(within(glance).getByText(risks[0].consequences)).toBeInTheDocument();
  expect(within(glance).getByText(risks[0].measures)).toBeInTheDocument();
  expect(within(glance).getByText('Forslag – ikke dokumenteret implementeret')).toBeInTheDocument();
  expect(screen.getByText(/Forslag ændrer ikke automatisk scorer eller godkendelse/)).toBeInTheDocument();
  const metrics = screen.getByLabelText('Risikoscorer for 4.1');
  expect(within(metrics).getByText('3 → 3')).toBeInTheDocument();
  expect(within(metrics).getByText('4 → 4')).toBeInTheDocument();
  expect(within(metrics).getByText('Høj')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /4\.1 · Sikkerhed/ }));
  const detail = screen.getByRole('region', { name: /4\.1 · Sikkerhed/ });
  expect(within(detail).getByRole('heading', { name: 'Forslag til risikobegrænsning' })).toBeInTheDocument();
  expect(within(detail).getByText('Forslag – ikke dokumenteret implementeret')).toBeInTheDocument();
  expect(within(detail).getByText(/Forslagene er ikke en godkendelse/)).toBeInTheDocument();
  expect(JSON.stringify(risks)).toBe(snapshot);
});

test('lange risikotekster har korte uddrag og den fulde struktur kan læses i detaljerne', () => {
  const rationale = `Usikkerheden vedrører adgang til lydoptagelser. ${'Det præcise adgangsomfang skal afklares. '.repeat(7)}\n\n- Afklar hvilke roller der kan læse lyd.\n- Undersøg om adgangen bliver logget.`;
  const consequences = 'Ansatte kan få delt fortrolige udsagn med uvedkommende. '.repeat(8);
  const measures = '- Afprøv lokal transskription.\n- Indfør en slettefrist og test sletningen.';
  mount({ risks: [risk('4.2', { rationale, consequences, measures })] });
  const glance = screen.getByLabelText('Kort overblik for 4.2');
  expect(within(glance).getByText(/^Usikkerheden vedrører adgang/).textContent.length).toBeLessThanOrEqual(150);
  expect(within(glance).getByText(/^Ansatte kan få delt/).textContent.length).toBeLessThanOrEqual(150);
  expect(within(glance).queryByText('Afklar hvilke roller der kan læse lyd.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /4\.2 · Sikkerhed/ }));
  const detail = screen.getByRole('region', { name: /4\.2 · Sikkerhed/ });
  expect(within(detail).getByText('Afklar hvilke roller der kan læse lyd.').closest('li')).toBeInTheDocument();
  expect(within(detail).getByText('Undersøg om adgangen bliver logget.').closest('li')).toBeInTheDocument();
  expect(within(detail).getByText('Afprøv lokal transskription.').closest('li')).toBeInTheDocument();
  expect(within(detail).getByText('Indfør en slettefrist og test sletningen.').closest('li')).toBeInTheDocument();
});

test('manglende scenarie og foranstaltninger bliver synlige som huller frem for opfundne forslag', () => {
  mount({ risks: [{ id: '4.3', area: 'Sletning' }] });
  expect(screen.getByText('Hvad kan gå galt: Risikoscenariet mangler i denne version.')).toBeInTheDocument();
  expect(screen.getByText('Der mangler konkrete forslag til at begrænse risikoen.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /4\.3 · Sletning/ }));
  const detail = screen.getByRole('region', { name: /4\.3 · Sletning/ });
  expect(within(detail).getByText('Risikoscenariet er ikke beskrevet i denne version.')).toBeInTheDocument();
  expect(within(detail).getByText('Der mangler konkrete forslag til at begrænse risikoen.')).toBeInTheDocument();
  expect(within(detail).queryByText(/lokal model/i)).not.toBeInTheDocument();
});

test('en tom risikovurdering har en tydelig tomtilstand uden tomme filtre', () => {
  mount({ risks: null });
  expect(screen.getByRole('heading', { name: 'Risikovurdering' })).toBeInTheDocument();
  expect(screen.getByText('Ingen særskilte risici er gemt i denne version.')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});
