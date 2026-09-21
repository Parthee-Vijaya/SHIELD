import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { DRAFT_STORAGE_KEY, INITIAL_ASSESSMENT } from '../features/dpia/assessmentModel';
import DpiaAssessmentPage from './DpiaAssessmentPage';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

beforeEach(() => {
  window.localStorage.clear();
  useAuth.mockReturnValue({ authFetch: jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ configured: false }) })) });
});

function mount(values = {}, step = 0) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ values: { ...INITIAL_ASSESSMENT, ...values }, step }));
  return render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={['/vurdering']}><DpiaAssessmentPage /></MemoryRouter></ThemeProvider>);
}

const draft = () => JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY)).values;

test('trin 1 har officielle fagområder, versionsvalg og kalenderfelter', async () => {
  mount();
  const department = screen.getByRole('combobox', { name: 'Fagområde' });
  expect(within(department).getByRole('group', { name: 'Faglige enheder' })).toBeInTheDocument();
  expect(within(department).getByRole('group', { name: 'Institutioner' })).toBeInTheDocument();
  expect(within(department).getByRole('group', { name: 'Stabsfunktioner' })).toBeInTheDocument();
  expect(within(department).getAllByRole('option')).toHaveLength(23);
  fireEvent.change(department, { target: { value: 'Tandplejen' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Behandlingens version eller fase' }), { target: { value: '1.0' } });
  const start = screen.getByLabelText('Forventet startdato');
  const end = screen.getByLabelText('Forventet slutdato');
  expect(start).toHaveAttribute('type', 'date');
  expect(end).toHaveAttribute('type', 'date');
  fireEvent.change(start, { target: { value: '2026-10-01' } });
  fireEvent.change(end, { target: { value: '2027-01-31' } });
  expect(end).toHaveAttribute('min', '2026-10-01');
  await waitFor(() => expect(draft()).toMatchObject({ department: 'Tandplejen', processing_version: '1.0', planned_start_date: '2026-10-01', planned_end_date: '2027-01-31' }));
});

test('gamle fritekstværdier vises under Andet, og ansvarlig bliver ikke omfortolket', async () => {
  mount({ owner: 'Min gamle afdeling', department: 'Tværgående projektteam', processing_version: 'Pilot august 2026' });
  expect(screen.getByLabelText('Faglig ansvarlig')).toHaveValue('Min gamle afdeling');
  expect(screen.getByLabelText('Angiv andet fagområde')).toHaveValue('Tværgående projektteam');
  expect(screen.getByLabelText('Angiv anden version eller fase')).toHaveValue('Pilot august 2026');
  fireEvent.change(screen.getByRole('combobox', { name: 'Fagområde' }), { target: { value: 'Organisationsstaben' } });
  expect(screen.queryByLabelText('Angiv andet fagområde')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Fagområde' }), { target: { value: '__custom_choice__' } });
  expect(screen.getByLabelText('Angiv andet fagområde')).toHaveValue('Tværgående projektteam');
  await waitFor(() => expect(draft().owner).toBe('Min gamle afdeling'));
});

test('manuel versionsindtastning afbrydes ikke, når begyndelsen matcher en preset', async () => {
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Behandlingens version eller fase' }), { target: { value: '__custom_choice__' } });
  const input = screen.getByLabelText('Angiv anden version eller fase');
  fireEvent.change(input, { target: { value: '1.0' } });
  expect(input).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '1.0-beta' } });
  await waitFor(() => expect(draft().processing_version).toBe('1.0-beta'));
});

test('gammel datofritekst bevares som noter ved valg af nye datoer', async () => {
  mount({ planned_start_date: 'Efter godkendelse', planned_end_date: 'Piloten slutter efter fire måneder' });
  expect(screen.getByLabelText('Forventet startdato')).toHaveValue('');
  expect(screen.getByLabelText('Forventet slutdato')).toHaveValue('');
  expect(screen.getByLabelText('Bemærkning til starttidspunkt (valgfrit)')).toHaveValue('Efter godkendelse');
  expect(screen.getByLabelText('Ophørsvilkår (valgfrit)')).toHaveValue('Piloten slutter efter fire måneder');
  fireEvent.change(screen.getByLabelText('Forventet startdato'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Forventet slutdato'), { target: { value: '2027-02-01' } });
  await waitFor(() => expect(draft()).toMatchObject({ planned_start_note: 'Efter godkendelse', planned_end_condition: 'Piloten slutter efter fire måneder', planned_start_date: '2026-10-01', planned_end_date: '2027-02-01' }));
});

test('personoplysningernes radiogrupper bevarer entydige navne og uafhængige svar', async () => {
  mount({}, 1);
  const sensitive = screen.getByRole('group', { name: 'Behandles følsomme oplysninger efter GDPR artikel 9?' });
  const criminal = screen.getByRole('group', { name: 'Behandles oplysninger om strafbare forhold?' });
  fireEvent.click(within(sensitive).getByRole('radio', { name: 'Ja' }));
  fireEvent.click(within(criminal).getByRole('radio', { name: 'Nej' }));
  expect(within(sensitive).getByRole('radio', { name: 'Ja' })).toBeChecked();
  expect(within(criminal).getByRole('radio', { name: 'Nej' })).toBeChecked();
  expect(screen.getByLabelText('Undtagelsesgrundlag efter GDPR artikel 9, stk. 2')).toBeInTheDocument();
  await waitFor(() => expect(draft()).toMatchObject({ special_categories: true, criminal_data: false }));
});
