import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import LoginPage, { safeReturnPath } from './LoginPage';
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
let auth;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function mount(url = '/login') { return render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}><Routes><Route path="/login" element={<LoginPage />} /><Route path="*" element={<p>Workspace</p>} /></Routes><Location /></MemoryRouter></ThemeProvider>); }
beforeEach(() => { auth = { ready: true, error: '', availableUser: { name: 'Parthee' }, canLogin: true, isAuthenticated: false, isDevelopmentIdentity: true, login: jest.fn().mockResolvedValue(), retry: jest.fn() }; useAuth.mockImplementation(() => auth); });

test('clearly names the local session and offers no misleading password field', async () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Velkommen til SHIELD' })).toBeInTheDocument();
  expect(screen.getByText(/ikke et personligt, bekræftet kommunalt login/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/password|adgangskode/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fortsæt som Parthee' }));
  expect(auth.login).toHaveBeenCalledTimes(1);
  await screen.findByRole('button', { name: 'Fortsæt som Parthee' });
});

test('real Entra mode only offers Microsoft sign-in', () => {
  auth = { ...auth, availableUser: null, isDevelopmentIdentity: false };
  mount();
  expect(screen.getByRole('button', { name: 'Log ind med Microsoft' })).toBeInTheDocument();
  expect(screen.queryByText('Delt lokal session')).not.toBeInTheDocument();
});

test('restores the requested case after session start', () => {
  auth = { ...auth, isAuthenticated: true, user: { name: 'Parthee' } };
  mount('/login?returnTo=%2Fsager%2Fkrisp%3Ftab%3Dexports');
  expect(screen.getByTestId('location')).toHaveTextContent('/sager/krisp?tab=exports');
});

test.each(['https://evil.invalid/path', '//evil.invalid', '/\\evil.invalid', '/login?returnTo=%2Fsager', '/\nevil.invalid'])('refuses unsafe return destination %s', input => {
  expect(safeReturnPath(input)).toBe('/');
});

test('shows an actionable connection failure instead of a working-looking local login', () => {
  auth = { ...auth, canLogin: false, error: 'Serveren svarede ikke.' };
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('Serveren svarede ikke.');
  expect(screen.queryByRole('button', { name: 'Fortsæt som Parthee' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Prøv forbindelsen igen' }));
  expect(auth.retry).toHaveBeenCalled();
});
