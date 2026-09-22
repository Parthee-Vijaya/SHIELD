import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockAccount = { localAccountId: 'person-123', name: 'Token display name', idTokenClaims: { roles: ['Hammeren.Admin'] } };
const mockMsal = {
  initialize: jest.fn(), handleRedirectPromise: jest.fn(), getActiveAccount: jest.fn(), getAllAccounts: jest.fn(), setActiveAccount: jest.fn(),
  acquireTokenSilent: jest.fn(), acquireTokenRedirect: jest.fn(), loginRedirect: jest.fn(), logoutRedirect: jest.fn(),
};
jest.mock('@azure/msal-browser', () => ({ PublicClientApplication: jest.fn(() => mockMsal), InteractionRequiredAuthError: class extends Error {} }));
process.env.REACT_APP_AUTH_MODE = 'entra';
process.env.REACT_APP_ENTRA_TENANT_ID = 'test-tenant';
process.env.REACT_APP_ENTRA_CLIENT_ID = 'test-client';
process.env.REACT_APP_ENTRA_API_SCOPE = 'api://test/access_as_user';
const { AuthProvider, useAuth } = require('./AuthContext');
let context;
function Consumer() { context = useAuth(); return <span>{context.ready ? 'ready' : 'loading'}</span>; }
const mount = () => render(<AuthProvider><Consumer /></AuthProvider>);
const serverIdentity = { oid: 'person-123', name: 'Server name', roles: ['Hammeren.Sagsbehandler'], auth_mode: 'entra', identity_assurance: 'verified_entra_token' };
beforeEach(() => {
  jest.clearAllMocks(); sessionStorage.clear();
  mockMsal.initialize.mockResolvedValue(); mockMsal.handleRedirectPromise.mockResolvedValue(null); mockMsal.getAllAccounts.mockReturnValue([]);
  mockMsal.getActiveAccount.mockReturnValue(null); mockMsal.acquireTokenSilent.mockResolvedValue({ accessToken: 'test-access-token' });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => serverIdentity });
});

test('offers real Microsoft login without a fabricated local user', async () => {
  mount(); await screen.findByText('ready');
  expect(context.user).toBeNull(); expect(context.isAuthenticated).toBe(false); expect(context.availableUser).toBeNull();
  await context.login();
  expect(mockMsal.loginRedirect).toHaveBeenCalledWith({ scopes: ['openid', 'profile', 'api://test/access_as_user'] });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('uses the API-verified principal rather than trusting browser token roles', async () => {
  mockMsal.getActiveAccount.mockReturnValue(mockAccount);
  mount(); await screen.findByText('ready');
  expect(context.user.name).toBe('Server name');
  expect(context.hasRole('Hammeren.Admin')).toBe(false);
  expect(context.hasRole('Hammeren.Sagsbehandler')).toBe(true);
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ headers: { Authorization: 'Bearer test-access-token', Accept: 'application/json' } }));
  await context.authFetch('/api/v3/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Synthetic municipal case' }) });
  expect(global.fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer test-access-token');
  expect(global.fetch.mock.calls[1][1].headers.get('Content-Type')).toBe('application/json');
  expect(global.fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ title: 'Synthetic municipal case' }) });
  await act(async () => context.logout());
  expect(mockMsal.logoutRedirect).toHaveBeenCalledWith({ account: mockAccount });
  expect(context.isAuthenticated).toBe(false);
});

test('does not enter the workspace if the API rejects an Entra account', async () => {
  mockMsal.getActiveAccount.mockReturnValue(mockAccount);
  global.fetch.mockResolvedValue({ ok: false, status: 401 });
  mount(); await screen.findByText('ready');
  expect(context.isAuthenticated).toBe(false); expect(context.user).toBeNull(); expect(context.error).toBeTruthy();
});

test('cannot switch a configured Entra frontend to a development identity', async () => {
  mockMsal.getActiveAccount.mockReturnValue(mockAccount);
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...serverIdentity, auth_mode: 'development', identity_assurance: 'development_only' }) });
  mount(); await screen.findByText('ready');
  expect(context.isAuthenticated).toBe(false); expect(context.isDevelopmentIdentity).toBe(false);
});
