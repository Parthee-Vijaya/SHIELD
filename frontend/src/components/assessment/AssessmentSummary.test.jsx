import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import AssessmentSummary, { AssessmentRecommendations } from './AssessmentSummary';
import StructuredReportText, { reportBlocks } from './StructuredReportText';

const mount = element => render(<ThemeProvider theme={lightTheme}><MemoryRouter>{element}</MemoryRouter></ThemeProvider>);

test('blokerende forhold bliver ikke godkendt af et positivt JEV-tjek', () => {
  const result = { status: 'blocked', blockers: ['Hosting er uafklaret.'], missing_information: ['Hosting er uafklaret.', 'Sletning skal dokumenteres.'], executive_summary: 'Den gemte sammenfatning.', ai_generation: { review: { checks: [{ requires_review: false }] } } };
  mount(<AssessmentSummary result={result} caseDbId="case-1" />);
  const summary = screen.getByRole('region', { name: 'Vurderingsresumé' });
  expect(within(summary).getByText('Kan ikke godkendes på det foreliggende grundlag')).toBeInTheDocument();
  expect(within(summary).getByText('Godkendelse fremgår ikke af denne rapportversion')).toBeInTheDocument();
  expect(within(summary).getAllByText('Hosting er uafklaret.')).toHaveLength(1);
  expect(screen.getByRole('link', { name: /Se beslutninger/ })).toHaveAttribute('href', '/sager/case-1?tab=approvals');
});

test('klar til gennemgang er ikke automatisk godkendt', () => {
  mount(<AssessmentSummary result={{ status: 'ready_for_review', blockers: [] }} />);
  expect(screen.getByText('Klar til faglig gennemgang – ikke automatisk godkendt')).toBeInTheDocument();
});

test('viser registrerede beslutningers vilkår og ubekræftet identitet', () => {
  mount(<AssessmentSummary result={{ reading_guide: {
    conclusion: 'Kræver handling før faglig godkendelse', blockers: [],
    approval: { label: 'Godkendt med vilkår – se beslutningen', items: [{ id: 'a1', decided_by: 'Testgodkender', reason: 'Kun en afgrænset pilot.', conditions: ['Slettekontrol før opstart.'], is_identity_verified: false }] },
  } }} />);
  expect(screen.getByText('Godkendt med vilkår – se beslutningen')).toBeInTheDocument();
  expect(screen.getByText('Slettekontrol før opstart.')).toBeInTheDocument();
  expect(screen.getByText(/identitet er ikke verificeret/)).toBeInTheDocument();
});

test('anbefalinger har egne forslag, forudsætninger og efterprøvning uden vurderingsstatus', () => {
  mount(<AssessmentRecommendations result={{ reading_guide: {
    recommendation_origin: 'rule_based', recommendations: [{ id: 'local', title: 'Undersøg lokal model', proposal: 'Afprøv lokal transskription.', rationale: 'Begræns mulig videregivelse.', prerequisites: 'Afklar kvalitet og driftsansvar.', verification: 'Test trafik og sletning.', source_ids: [] }],
  } }} />);
  const advice = screen.getByRole('region', { name: 'Anbefalinger – adskilt fra vurderingen' });
  expect(within(advice).getByText('Anbefaling · ikke besluttet')).toBeInTheDocument();
  expect(within(advice).getByText(/ikke en del af den historiske AI-tekst eller dens JEV-kontrol/)).toBeInTheDocument();
  expect(within(advice).getByText('Forudsætninger og begrænsninger')).toBeInTheDocument();
  expect(within(advice).getByText('Test trafik og sletning.')).toBeInTheDocument();
  expect(within(advice).queryByText('Godkendt')).not.toBeInTheDocument();
});

test('struktur formatterer tekst sikkert og bevarer alle sætninger', () => {
  mount(<StructuredReportText text={'Konklusion:\nGemte fakta.\n- Første punkt\n- Andet punkt\n<script>alert(1)</script>'} />);
  expect(screen.getByRole('heading', { name: 'Konklusion' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  const long = 'Dette er en lang sætning, der skal bevares fuldt og uændret i rapporten. '.repeat(9).trim();
  expect(reportBlocks(long).map(block => block.text).join(' ')).toBe(long);
});

test('en tidligere JEV-kontrol fremstilles ikke som aktuel efter revision', () => {
  mount(<AssessmentRecommendations result={{ recommendations: [{ id: 'local', title: 'Lokal model', proposal: 'Undersøg lokal behandling.', source_ids: [] }], editorial_revision: { stale_check_ids: ['recommendation:local'] } }} />);
  expect(screen.getByText(/Kræver nyt kvalitetstjek/)).toBeInTheDocument();
});
