import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme, darkTheme } from '../theme';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { useTutorial } from '../contexts/TutorialContext';
import SettingsPage from './SettingsPage';

jest.mock('../contexts/UserPreferencesContext', () => ({ useUserPreferences: jest.fn() }));
jest.mock('../contexts/TutorialContext', () => ({ useTutorial: jest.fn() }));
const updatePreference = jest.fn();
const restart = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  updatePreference.mockResolvedValue({ success: true });
  useUserPreferences.mockReturnValue({ preferences: { theme: 'light', notifications: { browser: true, email: false } }, loading: false, saving: false, updatePreference, resetPreferences: jest.fn(), exportPreferences: jest.fn(), importPreferences: jest.fn() });
  useTutorial.mockReturnValue({ restart, canStart: true, saving: false });
});
const mount = () => render(<ThemeProvider theme={lightTheme}><SettingsPage /></ThemeProvider>);

test('viser kun fungerende indstillingsområder og forklarer automatisk lokal lagring', () => {
  mount();
  expect(within(screen.getByRole('navigation', { name: 'Indstillingsområder' })).getAllByRole('button')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Gem ændringer' })).not.toBeInTheDocument();
  expect(screen.getByText(/Ændringer gemmes automatisk/)).toBeInTheDocument();
  expect(screen.getAllByRole('combobox')).toHaveLength(1);
  expect(screen.queryByRole('option', { name: /Auto|English/ })).not.toBeInTheDocument();
});
test('temaændring gemmes straks og introduktionsguiden kan genstartes', async () => {
  mount();
  fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'dark' } });
  expect(updatePreference).toHaveBeenCalledWith('theme', 'dark');
  expect(await screen.findByRole('status')).toHaveTextContent('Indstilling gemt');
  fireEvent.click(screen.getByRole('button', { name: 'Start introduktionsguide igen' }));
  expect(restart).toHaveBeenCalledTimes(1);
});
test('notifikationsønsker er navngivne switches og lover ikke levering', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Notifikationsønsker' }));
  expect(screen.getByText(/De aktiverer endnu ikke udsendelse/)).toBeInTheDocument();
  const toggle = screen.getByRole('switch', { name: 'E-mailnotifikationer' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(toggle);
  expect(updatePreference).toHaveBeenCalledWith('notifications.email', true);
  await screen.findByRole('status');
});
test('mislykket lagring vises ikke som gemt', async () => {
  updatePreference.mockResolvedValue({ success: false }); mount();
  fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'dark' } });
  expect(await screen.findByRole('status')).toHaveTextContent('Fejl ved gem af indstilling');
});
test('mørkt tema bruger mørke panelflader og handlinger kan ombrydes på smalle skærme', () => {
  render(<ThemeProvider theme={darkTheme}><SettingsPage /></ThemeProvider>);
  expect(screen.getByRole('navigation', { name: 'Indstillingsområder' })).toHaveStyle({ background: darkTheme.colors.surface });
  expect(screen.getByLabelText('Udseende')).toHaveStyle({ background: darkTheme.colors.surface, color: darkTheme.colors.ink });
  expect(screen.getByLabelText('Tema')).toHaveStyle({ background: darkTheme.colors.inputBackground, color: darkTheme.colors.ink });
  expect(screen.getByRole('button', { name: 'Eksporter' }).parentElement).toHaveStyle('flex-wrap: wrap');
});
