import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import CaseAssessmentTools from './CaseAssessmentTools';

test('eksisterende vurdering fortsættes og de supplerende spor har forklaring', () => {
  render(<ThemeProvider theme={lightTheme}><CaseAssessmentTools caseId="case-1" assessments={[{ id: 'old', version: 1, type: 'dpia_assessment' }, { id: 'new', version: 2, type: 'dpia_assessment' }]} /></ThemeProvider>);
  expect(screen.getByRole('link', { name: 'Fortsæt seneste konsekvensanalyse →' })).toHaveAttribute('href', '/vurdering?assessment_id=new&case=case-1');
  expect(screen.queryByRole('link', { name: 'Start konsekvensanalyse →' })).not.toBeInTheDocument();
  expect(screen.getByText(/At værktøjet er tilgængeligt betyder ikke/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Åbn AI Act-afklaring →' })).toHaveAttribute('href', '/ai-act-vurdering?case_id=case-1');
});
