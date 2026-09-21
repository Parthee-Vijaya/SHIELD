import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import AssessmentHistorySection from './AssessmentHistorySection';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

test('historikken viser systemnavne og åbner den præcise gemte version med pagination', async () => {
  const authFetch = jest.fn(url => Promise.resolve({ ok: true, json: async () => ({
    count: 9,
    items: url.endsWith('offset=0') ? [{ id: 'old-version', project_name: 'Fiktivt journalsystem', version: 1, case_db_id: 'case-1', created_at: '2025-01-01', status_label: 'Kræver gennemgang' }]
      : [{ id: 'new-version', project_name: 'Andet testsystem', version: 3, created_at: '2026-09-20' }],
  }) }));
  useAuth.mockReturnValue({ authFetch, user: { oid: 'history-test' } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<ThemeProvider theme={lightTheme}><QueryClientProvider client={client}><MemoryRouter><AssessmentHistorySection /></MemoryRouter></QueryClientProvider></ThemeProvider>);
  expect(await screen.findByRole('link', { name: 'Fiktivt journalsystem' })).toHaveAttribute('href', '/vurdering?assessment_id=old-version&case=case-1');
  expect(screen.getByText(/Version 1/)).toHaveTextContent('2025');
  fireEvent.click(screen.getByRole('button', { name: 'Næste' }));
  expect(await screen.findByRole('link', { name: 'Andet testsystem' })).toHaveAttribute('href', '/vurdering?assessment_id=new-version');
  expect(screen.queryByText('Fiktivt journalsystem')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Næste' })).toBeDisabled();
  expect(authFetch).toHaveBeenCalledWith('/api/dpia/assessments?limit=8&offset=8');
  expect(authFetch.mock.calls.every(call => call.length === 1)).toBe(true);
  client.clear();
});
