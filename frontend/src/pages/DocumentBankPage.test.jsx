import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from 'styled-components';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { lightTheme } from '../theme';
import DocumentBankPage from './DocumentBankPage';

jest.mock('axios');
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

function mount(documents = [], route = '/dokumentbank') {
  axios.get.mockResolvedValue({ data: { documents } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[route]}><DocumentBankPage /></MemoryRouter></ThemeProvider></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ hasRole: () => false });
});

test('historisk gyldig-til og review vises på de angivne kalenderdage uden at gemme ændringer', async () => {
  const version = { id: 'version-1', version_number: 1, status: 'draft', valid_to: '2026-09-20T23:59:59+00:00', review_at: '2026-12-31T00:00:00' };
  mount([{ id: 'document-1', title: 'Fiktiv databehandleraftale', category: 'data_processing_agreement', versions: [version] }]);
  expect(await screen.findByRole('heading', { name: 'Fiktiv databehandleraftale' })).toBeInTheDocument();
  expect(screen.getByText('20. sep. 2026')).toBeInTheDocument();
  expect(screen.getByText('31. dec. 2026')).toBeInTheDocument();
  expect(screen.queryByText('21. sep. 2026')).not.toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
  expect(version.valid_to).toBe('2026-09-20T23:59:59+00:00');
});

test('nye dokumentdatoer gemmes med eksplicit UTC og inklusive slutdato', async () => {
  axios.post.mockResolvedValue({ data: {} });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Registrér dokument' }));
  for (const [label, value] of [
    ['Titel', 'Fiktiv databehandleraftale'],
    ['Dokumentejer', 'Fiktiv ejer'],
    ['Beskrivelse og evidensværdi', 'Syntetisk aftale til datotest.'],
    ['Gyldig fra', '2026-09-20'],
    ['Gyldig til', '2026-09-20'],
    ['Review senest', '2026-12-31'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.change(screen.getByLabelText('Dokumentfil'), { target: { files: [new File(['syntetisk'], 'dato-test.txt', { type: 'text/plain' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload dokument' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  const [url, payload] = axios.post.mock.calls[0];
  expect(url).toBe('/api/v3/documents');
  expect(JSON.parse(payload.get('metadata'))).toMatchObject({
    valid_from: '2026-09-20T00:00:00Z',
    valid_to: '2026-09-20T23:59:59Z',
    review_at: '2026-12-31T00:00:00Z',
  });
});

test('et søgeresultat viser det valgte dokument og kan vende tilbage til hele dokumentbanken', async () => {
  mount([
    { id: 'wanted', title: 'Valgt aftale', category: 'data_processing_agreement', versions: [] },
    { id: 'other', title: 'En anden kilde', category: 'security_documentation', versions: [] },
  ], '/dokumentbank?document_id=wanted');
  expect(await screen.findByRole('heading', { name: 'Valgt aftale' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'En anden kilde' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vis alle dokumenter' }));
  expect(await screen.findByRole('heading', { name: 'En anden kilde' })).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();
});
