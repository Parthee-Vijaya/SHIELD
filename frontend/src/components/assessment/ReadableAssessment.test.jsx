import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import ReadableAssessment, { findingExplanation, readableAssessmentModel } from './ReadableAssessment';

const mount = (result, onOpenDetails = jest.fn()) => render(<ThemeProvider theme={lightTheme}><ReadableAssessment result={result} onOpenDetails={onOpenDetails} /></ThemeProvider>);

test('fravær af blokeringer og et positivt kvalitetstjek bliver ikke til godkendelse', () => {
  mount({ status: 'ready_for_review', ai_generation: { review: { checks: [{ id: 'summary', requires_review: false }] } } });
  expect(screen.getByText('Vurderingen er klar til faglig gennemgang')).toBeInTheDocument();
  expect(screen.getByText('Godkendelse fremgår ikke af denne rapportversion')).toBeInTheDocument();
  expect(screen.getByText(/Fravær af blokeringer eller et positivt kvalitetstjek er ikke en godkendelse/)).toBeInTheDocument();
  expect(screen.queryByText(/^Godkendt$/)).not.toBeInTheDocument();
});

test('historiske blokeringer bevares trods en ufuldstændig læseguide', () => {
  mount({ status: 'ready_for_review', blockers: ['Slettefrister er ikke dokumenteret.'], reading_guide: { conclusion: 'Klar', blockers: [] } });
  expect(screen.getByText('Der er forhold, som blokerer for godkendelse')).toBeInTheDocument();
  expect(screen.getByText('Slettefrister er ikke dokumenteret.')).toBeInTheDocument();
});

test('alle blokerende punkter kan foldes ud uden at ændre rapporten', () => {
  const result = { blockers: Array.from({ length: 6 }, (_, i) => `Blokerende forhold ${i + 1}`) };
  const before = JSON.stringify(result);
  mount(result);
  const region = screen.getByRole('region', { name: 'Blokerende forhold' });
  const disclosure = within(region).getByText('Vis alle 6 punkter – 3 flere').closest('details');
  expect(within(region).getByText('Blokerende forhold 6')).not.toBeVisible();
  disclosure.setAttribute('open', '');
  fireEvent(disclosure, new Event('toggle'));
  expect(within(region).getAllByRole('listitem')).toHaveLength(6);
  expect(within(region).getByText('Blokerende forhold 6')).toBeVisible();
  expect(JSON.stringify(result)).toBe(before);
});

test('juridiske termer forklares som konkrete afklaringsopgaver uden at erstatte fundet', () => {
  const legal = 'Behandlingsgrundlag efter GDPR artikel 6 er ikke afklaret.';
  const transfer = 'Adgang til data uden for EU/EØS skal afklares.';
  mount({ blockers: [legal, transfer] });
  expect(screen.getByRole('heading', { name: 'Hvad giver kommunen ret til at bruge oplysningerne?' })).toBeInTheDocument();
  expect(screen.getByText(legal)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Hvor kan oplysningerne blive tilgået?' })).toBeInTheDocument();
  expect(screen.getByText(transfer)).toBeInTheDocument();
  expect(screen.getByText(/Det skal gennemgås med de juridisk ansvarlige/)).toBeInTheDocument();
});

test('manglende oplysninger og spørgsmål holdes adskilt og dubleres ikke', () => {
  const view = readableAssessmentModel({ blockers: ['Hjemmel mangler.'], missing_information: ['Hjemmel mangler.', 'Slettefrist mangler.'], open_questions: ['Slettefrist mangler.', 'Hvem følger op?'], reading_guide: { missing_information: ['Slettefrist mangler.'] } });
  expect(view.blockers).toEqual(['Hjemmel mangler.']);
  expect(view.missing).toEqual(['Slettefrist mangler.']);
  expect(view.questions).toEqual(['Hvem følger op?']);
});

test('oversatte rettighedsprocedurer dubleres ikke fra den gemte rapport', () => {
  const view = readableAssessmentModel({ blockers: ['Rettighedsprocedurer mangler for: information, access.'], reading_guide: { blockers: ['Rettighedsprocedurer mangler for: oplysningspligt, indsigt.'] } });
  expect(view.blockers).toEqual(['Rettighedsprocedurer mangler for: oplysningspligt, indsigt.']);
});

test('prioriterer høj risiko og ukendt niveau og viser forslag som forslag', () => {
  const result = { risks: [
    { id: 'low', area: 'Lav risiko', residual_risk: 'low', scenario: 'Mindre fejl.' },
    { id: 'unknown', area: 'Ukendt risiko', scenario: 'Uafklaret adgang.' },
    { id: 'medium', area: 'Mellem risiko', residual_risk: 'medium', scenario: 'Forsinket sletning.' },
    { id: 'high', area: 'Høj risiko', residual_risk: 'high', scenario: 'Uvedkommende får adgang.', rationale: 'Materialet kan afsløre helbredsoplysninger.', measures: ['Begræns adgangen.', 'Afprøv rettighederne.'] },
  ] };
  const onOpenDetails = jest.fn();
  mount(result, onOpenDetails);
  const risks = within(screen.getByRole('list', { name: 'Prioriterede risici' })).getAllByRole('listitem');
  expect(risks[0]).toHaveTextContent('Høj risiko');
  expect(risks[1]).toHaveTextContent('Ukendt risiko');
  expect(risks[2]).toHaveTextContent('Mellem risiko');
  expect(risks[0]).toHaveTextContent('Materialet kan afsløre helbredsoplysninger.');
  expect(risks[0]).toHaveTextContent('Begræns adgangen.');
  expect(risks[0]).toHaveTextContent('Forslag – gennemførelse og effekt er ikke dokumenteret');
  fireEvent.click(screen.getByRole('button', { name: 'Se alle risici og forslag (4) →' }));
  expect(onOpenDetails).toHaveBeenCalledWith('risks');
});

test('supplerende uscorede risici fremgår sammen med det samlede antal', () => {
  mount({ risks: [{ id: 'risk1', residual_risk: 'high' }], additional_risks: [{ scenario: 'Manglende kvalitetskontrol.' }] });
  expect(screen.getByText('1 supplerende risiko er beskrevet uden en særskilt beregnet score')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Se alle risici og forslag (2) →' })).toBeInTheDocument();
});

test('en tidligere JEV-kontrol dækker ikke ændret tekst og tæller ikke som aktuel', () => {
  mount({ editorial_revision: { stale_check_ids: ['summary'] }, ai_generation: { review: { checks: [{ id: 'summary', requires_review: true }, { id: 'section:legal', requires_review: true }] } } });
  expect(screen.getByRole('complementary', { name: 'Rapporten er fagligt redigeret' })).toHaveTextContent('En tidligere JEV-kontrol dækker ikke de ændrede formuleringer.');
  expect(screen.getByText('1 punkt kræver opfølgning efter JEV-kontrol')).toBeInTheDocument();
  expect(screen.queryByText('2 punkter kræver opfølgning efter JEV-kontrol')).not.toBeInTheDocument();
});

test('en aggregeret JEV-kontrol tæller ikke som aktuel, når et tilknyttet afsnit er ændret', () => {
  mount({ editorial_revision: { stale_check_ids: ['section:1.1'] }, ai_generation: { review: { checks: [
    { id: 'legal-check', section_ids: ['section:1.1', 'section:1.2'], requires_review: true },
    { id: 'risk-check', section_ids: ['risk:3.1'], requires_review: true },
  ] } } });
  expect(screen.getByText('1 punkt kræver opfølgning efter JEV-kontrol')).toBeInTheDocument();
  expect(screen.queryByText('2 punkter kræver opfølgning efter JEV-kontrol')).not.toBeInTheDocument();
});

test('bevarer beslutningens vilkår og forbehold om identitet', () => {
  mount({ reading_guide: { approval: { status: 'approved_with_conditions', label: 'Godkendt med vilkår – se beslutningen', items: [{ id: 'a1', decided_by: 'Sagsejer', reason: 'Kun en afgrænset pilot.', is_identity_verified: false, conditions: ['Slettekontrol før opstart.'] }] } } });
  expect(screen.getByText('Godkendt med vilkår – se beslutningen')).toBeInTheDocument();
  expect(screen.getByText('Slettekontrol før opstart.')).toBeInTheDocument();
  expect(screen.getByText('Beslutningstagerens identitet er ikke verificeret.')).toBeInTheDocument();
});

test('anbefalinger vises adskilt og deres forudsætninger er tilgængelige', () => {
  mount({ reading_guide: { recommendation_origin: 'rule_based', recommendations: [{ id: 'local', title: 'Undersøg lokal behandling', proposal: 'Afprøv en lokal model.', prerequisites: 'Afklar driftsansvar og kvalitet.', verification: 'Dokumentér netværkstrafik.' }] } });
  const advice = screen.getByRole('region', { name: 'Anbefalinger adskilt fra vurderingen' });
  expect(advice).toHaveTextContent('Forslagene er ikke del af rapportens tidligere JEV-kontrol.');
  expect(advice).toHaveTextContent('De ændrer ikke vurderingen eller godkendelsen');
  expect(within(advice).getByText('Afklar driftsansvar og kvalitet.')).toBeInTheDocument();
});

test('lange faglige tekster forkortes visuelt og bevares fuldt under læs hele punktet', () => {
  const summary = `Indledende forklaring. ${'Dokumentationen skal følges op. '.repeat(30)}Sidste væsentlige forbehold.`;
  mount({ executive_summary: summary });
  const region = screen.getByRole('region', { name: 'Vurderingens hovedbudskab' });
  expect(within(region).getByText('Læs hele punktet')).toBeInTheDocument();
  expect(region).toHaveTextContent('Sidste væsentlige forbehold.');
});

test('modelformidling viser GPT uden værktøjstag for kendte metadata', () => {
  mount({ executive_summary: 'Udkast udarbejdet i Codex med gpt-5.6-sol; JEV-kontrol via AI Gateway.', ai_generation: { model: 'gpt-5.6-sol' } });
  expect(screen.getByText('Udarbejdet med GPT-5.6 Sol. Kontrolleret med JEV.')).toBeInTheDocument();
  expect(screen.queryByText(/Codex/)).not.toBeInTheDocument();
});

test('historiske kildeforbehold vises, selv når de ikke findes blandt manglende oplysninger', () => {
  const limitation = 'Dokumentversion 7f30bded-33c3-4e48-a9bc-2c521791abc0: Det scannede bilag kunne ikke indlæses fuldt.';
  mount({ missing_information: [], ai_generation: { model: 'gpt-5.6-sol', limitations: [
    'Udkast udarbejdet i Codex med gpt-5.6-sol; JEV-kontrol via AI Gateway.',
    'Codex-forbrug er ikke tilgængeligt i denne import.',
    'Model og kørsels-ID er angivet ved import fra Codex.',
    limitation,
    limitation,
    'Den juridiske vurdering bygger kun på de indsendte aftaler.',
  ] } });
  const region = screen.getByRole('region', { name: 'Forbehold for grundlaget' });
  expect(within(region).getByRole('heading', { name: 'Forbehold for grundlaget (2)' })).toBeInTheDocument();
  expect(within(region).getByText('Det scannede bilag kunne ikke indlæses fuldt.')).toBeVisible();
  expect(within(region).getByText('Den juridiske vurdering bygger kun på de indsendte aftaler.')).toBeVisible();
  expect(screen.queryByText(/Codex/)).not.toBeInTheDocument();
});

test('alle kildeforbehold er tilgængelige uden at fjerne ukendte noter', () => {
  const limitations = ['Første bilag er ufuldstændigt.', 'Andet bilag mangler underskrift.', 'Tredje bilag er en ældre version.', 'Fjerde bilag har en ukendt begrænsning.'];
  mount({ ai_generation: { limitations } });
  const region = screen.getByRole('region', { name: 'Forbehold for grundlaget' });
  const disclosure = within(region).getByText('Vis alle 4 punkter – 1 flere').closest('details');
  expect(within(region).getByText(limitations[3])).not.toBeVisible();
  disclosure.setAttribute('open', '');
  fireEvent(disclosure, new Event('toggle'));
  expect(within(region).getByText(limitations[3])).toBeVisible();
});


test('forklarer en samlet kontrolmangel og rettigheder frem for et tilfældigt underemne', () => {
  expect(findingExplanation('Følgende oplyste kontroller mangler implementeringsevidens: databehandleraftale og sletning.').title).toBe('Virker sikkerhedsforanstaltningerne i praksis?');
  expect(findingExplanation('Rettighedsprocedurer mangler for: indsigt, sletning, oplysningspligt.').title).toBe('Hvordan hjælpes borgerne med deres rettigheder?');
});

test('samler samme dokumentforbehold uden tekniske id’er og bevarer rapportdata', () => {
  const result = { ai_generation: { limitations: [
    'Dokumentversion a84d50e1-98ca-4f28-8dc3-3b9dfa5e126c: Kun tekstlaget indgår.',
    'Dokumentversion 769abe97-194c-4d37-b35b-7c7f31efb0d5: Kun tekstlaget indgår.',
  ] } };
  const before = JSON.stringify(result);
  expect(readableAssessmentModel(result).limitations).toEqual(['Kun tekstlaget indgår.']);
  expect(JSON.stringify(result)).toBe(before);
});
