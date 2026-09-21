import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import CaseDocumentsPanel from './CaseDocumentsPanel';

const documents = [
  { id: 'd1', title: 'Aftale', category: 'data_processing_agreement', version: 3, uploaded_at: '2026-09-21T09:30:00Z', uploaded_by: 'Uploader', linked_by: 'Sagsbehandler', linked_at: '2026-09-22T10:00:00Z', owner: 'Aftaleejer', download_href: '/api/v3/documents/d1/versions/v3/download', original_filename: 'aftale.pdf', status: 'draft' },
  { id: 'd2', title: 'Revision', category: 'security_documentation', version: 1, uploaded_by: 'Codex', status: 'approved', metadata: { source_url: 'javascript:alert(1)' } },
];
const mount = (values = documents, onDownload = jest.fn()) => render(<ThemeProvider theme={lightTheme}><CaseDocumentsPanel documents={values} onDownload={onDownload} /></ThemeProvider>);

test('kategorier, ejer, uploader og tilknytningsaktør er særskilte oplysninger', () => {
  mount();
  const agreement = screen.getByRole('region', { name: 'Databehandleraftaler' });
  expect(within(agreement).getByText('Uploadet af').nextElementSibling).toHaveTextContent('Uploader');
  expect(within(agreement).getByText('Dokumentejer').nextElementSibling).toHaveTextContent('Aftaleejer');
  expect(within(agreement).getByText('Knyttet til sagen af').nextElementSibling).toHaveTextContent('Sagsbehandler');
  expect(screen.getByText('AI-assisteret import · model ikke registreret')).toBeInTheDocument();
  expect(screen.getByText(/En godkendt dokumentversion er ikke en godkendelse/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Åbn den oprindelige kilde →' })).not.toBeInTheDocument();
});

test('kategori og søgning kan kombineres uden at vise irrelevante dokumenter', () => {
  mount();
  fireEvent.change(screen.getByLabelText('Dokumentkategori'), { target: { value: 'security_documentation' } });
  expect(screen.getByRole('heading', { name: 'Revision' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Aftale' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Søg i dokumenter'), { target: { value: 'mangler' } });
  expect(screen.getByText('Ingen dokumenter matcher søgningen')).toBeVisible();
});

test('download knytter sig til den viste konkrete filversion', () => {
  const download = jest.fn(); mount(documents, download);
  fireEvent.click(screen.getByRole('button', { name: 'Hent denne version' }));
  expect(download).toHaveBeenCalledWith({ href: '/api/v3/documents/d1/versions/v3/download', filename: 'aftale.pdf' });
});
