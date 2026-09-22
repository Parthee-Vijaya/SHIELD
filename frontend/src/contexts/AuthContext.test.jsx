import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import { AuthProvider, RequireRole, useAuth } from './AuthContext';

jest.mock('@azure/msal-browser', () => ({ PublicClientApplication: jest.fn(), InteractionRequiredAuthError: class extends Error {} }));
const principal = { oid: 'development-local-user', name: 'Parthee', roles: ['Hammeren.Sagsbehandler'], auth_mode: 'development', identity_assurance: 'development_only' };
const response = (payload, ok = true, status = 200) => ({ ok, status, json: async () => payload });
let context;
function Controls() {
  context = useAuth();
  return <><span>{context.ready ? 'ready' : 'loading'}</span><span>{context.user?.name || 'no session'}</span><span>{context.availableUser?.name || 'no local identity'}</span>{context.error && <div role="alert">{context.error}</div>}<button disabled={!context.canLogin} onClick={context.login}>Start session</button><button onClick={context.logout}>End session</button><RequireRole anyOf={['Hammeren.Admin']} fallback={<p>No admin role</p>}><p>Admin access</p></RequireRole></>;
}
const mount = () => render(<AuthProvider><Controls /></AuthProvider>);
beforeEach(() => { sessionStorage.clear(); global.fetch = jest.fn().mockResolvedValue(response(principal)); });
afterEach(() => { jest.restoreAllMocks(); });

test('requires an explicit local session and uses the server identity and roles', async () => {
  mount();
  await screen.findByText('ready');
  expect(screen.getByText('no session')).toBeInTheDocument();
  expect(context.isAuthenticated).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
  expect(context.user.name).toBe('Parthee');
  expect(screen.getByText('No admin role')).toBeInTheDocument();
  expect(context.hasRole('Hammeren.Admin')).toBe(false);
  expect(context.hasRole('Hammeren.Sagsbehandler')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'End session' }));
  expect(screen.getByText('no session')).toBeInTheDocument();
  expect(sessionStorage.getItem('shield.local-session.v1')).toBeNull();
});

test('revalidates the server before restoring a session from this tab', async () => {
  sessionStorage.setItem('shield.local-session.v1', JSON.stringify({ oid: principal.oid, name: 'Parthee' }));
  mount();
  await screen.findByText('ready');
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ cache: 'no-store' }));
  expect(context.isAuthenticated).toBe(true);
});

test('fails closed when the server requires real authentication, even with a saved local marker', async () => {
  sessionStorage.setItem('shield.local-session.v1', JSON.stringify({ oid: principal.oid, name: 'Parthee' }));
  global.fetch.mockResolvedValue(response({}, false, 401));
  mount();
  expect(await screen.findByText(/Denne server kræver kommunalt login/)).toBeInTheDocument();
  expect(context.isAuthenticated).toBe(false);
  expect(screen.getByRole('button', { name: 'Start session' })).toBeDisabled();
});

test('rejects mismatched production identity and network failure without a fabricated user', async () => {
  global.fetch.mockResolvedValue(response({ ...principal, auth_mode: 'entra', identity_assurance: 'verified_entra_token' }));
  mount();
  expect(await screen.findByText(/Serverens loginopsætning matcher/)).toBeInTheDocument();
  expect(context.user).toBeNull();
  global.fetch.mockRejectedValue(new Error('Offline'));
  act(() => context.retry());
  await waitFor(() => expect(context.error).toBe('Offline'));
  expect(context.canLogin).toBe(false);
});

test('local requests do not forge an X-User header, and authenticated fetch rejects external origins', async () => {
  mount(); await screen.findByText('ready');
  await expect(context.authFetch('/api/private')).rejects.toThrow('Start en session');
  fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
  await context.authFetch('/api/private');
  const [, options] = global.fetch.mock.calls[1];
  expect(options.headers.has('X-User')).toBe(false);
  expect(options.headers.has('Authorization')).toBe(false);
  await expect(context.authFetch('//example.com/collect')).rejects.toThrow('egen adresse');
});

test('axios leaves external origins untouched and adds no client-defined identity', async () => {
  const install = jest.spyOn(axios.interceptors.request, 'use');
  mount(); await screen.findByText('ready');
  fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
  const intercept = install.mock.calls.at(-1)[0];
  const external = { url: '//external.invalid/test' };
  expect(await intercept(external)).toBe(external);
  const local = await intercept({ url: '/api/test' });
  expect(local.headers['X-User']).toBeUndefined();
});
