import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import CatalogAutocomplete from './CatalogAutocomplete';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const entry = { id: 'system-a', source_id: 'source-a', name: 'Ældre Økonomi', available: true, parties: [{ id: 'party-a', name: 'Århus Software', role: 'rights_holder', role_label: 'Rettighedshaver' }] };
const source = { name: 'Katalog.xlsx', imported_at: '2026-09-22T10:00:00Z', system_count: 3, type: 'local_import' };
const reply = items => ({ ok: true, json: async () => ({ items, total: items.length, source }) });
let authFetch;

function Fixture({ onSubmit = jest.fn(), kind = 'systems', systemId }) {
  const [value, setValue] = useState('');
  return <ThemeProvider theme={lightTheme}><form onSubmit={onSubmit}>
    <label htmlFor="catalog-name">Navn</label>
    <CatalogAutocomplete id="catalog-name" kind={kind} systemId={systemId} value={value} onChange={setValue} onSelect={item => setValue(item.name)} />
    <button type="submit">Gem</button>
  </form></ThemeProvider>;
}

beforeEach(() => {
  authFetch = jest.fn(async () => reply([entry]));
  useAuth.mockReturnValue({ authFetch });
});

test('supports keyboard selection, identifies the true relation and does not submit the form', async () => {
  const submit = jest.fn();
  render(<Fixture onSubmit={submit} />);
  expect(authFetch).not.toHaveBeenCalled();
  const input = screen.getByRole('combobox', { name: 'Navn' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Ældre' } });
  const option = await screen.findByRole('option', { name: /Ældre Økonomi/ });
  expect(option).toHaveTextContent('Rettighedshaver: Århus Software');
  expect(authFetch.mock.calls[0][0]).toContain('q=%C3%86ldre');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input).toHaveAttribute('aria-activedescendant', option.id);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue(entry.name);
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(submit).not.toHaveBeenCalled();
});

test('retains manual values when no suggestions exist or the service is unavailable', async () => {
  authFetch.mockResolvedValueOnce(reply([])).mockRejectedValueOnce(new Error('offline'));
  render(<Fixture />);
  const input = screen.getByRole('combobox', { name: 'Navn' });
  fireEvent.change(input, { target: { value: 'Ny løsning' } });
  expect(await screen.findByText('Ingen match. Du kan bruge det navn, du har skrevet.')).toBeInTheDocument();
  expect(input).toHaveValue('Ny løsning');
  fireEvent.change(input, { target: { value: 'Anden løsning' } });
  expect(await screen.findByText(/Kataloget kan ikke hentes/)).toBeInTheDocument();
  expect(input).toHaveValue('Anden løsning');
  expect(screen.getByRole('button', { name: 'Gem' })).toBeEnabled();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('ignores stale responses after a newer search and cancels pending work', async () => {
  let finishFirst;
  authFetch.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; })).mockResolvedValueOnce(reply([{ ...entry, id: 'new', name: 'Nyeste match' }]));
  render(<Fixture />);
  const input = screen.getByRole('combobox', { name: 'Navn' });
  fireEvent.change(input, { target: { value: 'Gammel' } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
  fireEvent.change(input, { target: { value: 'Nyeste' } });
  expect(await screen.findByRole('option', { name: /Nyeste match/ })).toBeInTheDocument();
  await act(async () => { finishFirst(reply([entry])); });
  expect(screen.queryByRole('option', { name: /Ældre Økonomi/ })).not.toBeInTheDocument();
  expect(authFetch.mock.calls[0][1].signal.aborted).toBe(true);
});

test('passes the selected system when looking up a supplier without treating rights holders as verified suppliers', async () => {
  authFetch.mockResolvedValue(reply([{ id: 'party', name: 'Århus Software', role_labels: ['Rettighedshaver'], related_to_system: true }]));
  render(<Fixture kind="suppliers" systemId="system-a" />);
  fireEvent.focus(screen.getByRole('combobox'));
  const option = await screen.findByRole('option');
  expect(authFetch.mock.calls[0][0]).toContain('system_id=system-a');
  expect(option).toHaveTextContent('Knyttet til den valgte løsning · Rettighedshaver');
});
