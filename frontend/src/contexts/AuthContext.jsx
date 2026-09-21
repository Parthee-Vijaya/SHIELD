import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import axios from 'axios';

const AuthContext = createContext(null);

const mode = process.env.REACT_APP_AUTH_MODE === 'entra' ? 'entra' : 'development';
const tenantId = process.env.REACT_APP_ENTRA_TENANT_ID || '';
const clientId = process.env.REACT_APP_ENTRA_CLIENT_ID || '';
const apiScope = process.env.REACT_APP_ENTRA_API_SCOPE || '';
const redirectUri = process.env.REACT_APP_ENTRA_REDIRECT_URI || window.location.origin;
const entraConfigured = Boolean(tenantId && clientId && apiScope);

const msal = mode === 'entra' && entraConfigured
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    })
  : null;

const DEVELOPMENT_USER = Object.freeze({
  oid: 'development-local-user',
  name: 'Lokal bruger',
  username: 'local@development.invalid',
  roles: [
    'Hammeren.Sagsbehandler',
    'Hammeren.Godkender',
    'Hammeren.DPO',
    'Hammeren.Admin',
  ],
  authMode: 'development',
  identityAssurance: 'development_only',
});

function accountToUser(account) {
  const claims = account?.idTokenClaims || {};
  return {
    oid: claims.oid || account?.localAccountId,
    name: account?.name || claims.name || 'Ukendt bruger',
    username: account?.username || claims.preferred_username,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    authMode: 'entra',
    identityAssurance: 'verified_entra_token',
  };
}

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [ready, setReady] = useState(mode === 'development');
  const [error, setError] = useState(
    mode === 'entra' && !entraConfigured
      ? 'Entra-login er valgt, men frontend-konfigurationen mangler.'
      : '',
  );

  useEffect(() => {
    if (!msal) return undefined;
    let active = true;
    (async () => {
      try {
        await msal.initialize();
        const redirectResult = await msal.handleRedirectPromise();
        const nextAccount = redirectResult?.account || msal.getActiveAccount() || msal.getAllAccounts()[0] || null;
        if (nextAccount) msal.setActiveAccount(nextAccount);
        if (active) setAccount(nextAccount);
      } catch (authError) {
        if (active) setError(authError.message || 'Microsoft Entra-login kunne ikke initialiseres.');
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const login = useCallback(async () => {
    if (!msal) return;
    await msal.loginRedirect({ scopes: ['openid', 'profile', apiScope] });
  }, []);

  const logout = useCallback(async () => {
    if (!msal) return;
    await msal.logoutRedirect({ account: msal.getActiveAccount() || account });
  }, [account]);

  const getAccessToken = useCallback(async () => {
    if (mode === 'development') return null;
    if (!msal || !account) throw new Error('Log ind med Microsoft Entra ID.');
    try {
      const response = await msal.acquireTokenSilent({ account, scopes: [apiScope] });
      return response.accessToken;
    } catch (tokenError) {
      if (tokenError instanceof InteractionRequiredAuthError) {
        await msal.acquireTokenRedirect({ account, scopes: [apiScope] });
      }
      throw tokenError;
    }
  }, [account]);

  const authFetch = useCallback(async (url, options = {}) => {
    const token = await getAccessToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (mode === 'development') headers.set('X-User', DEVELOPMENT_USER.name);
    return fetch(url, { ...options, headers });
  }, [getAccessToken]);

  useEffect(() => {
    const interceptor = axios.interceptors.request.use(async (config) => {
      const requestUrl = String(config.url || '');
      if (/^https?:\/\//i.test(requestUrl) && !requestUrl.startsWith(window.location.origin)) {
        return config;
      }
      if (mode === 'entra' && !account) return config;
      const token = await getAccessToken();
      config.headers = config.headers || {};
      if (token) config.headers.Authorization = `Bearer ${token}`;
      if (mode === 'development') config.headers['X-User'] = DEVELOPMENT_USER.name;
      return config;
    });
    return () => axios.interceptors.request.eject(interceptor);
  }, [account, getAccessToken]);

  const user = useMemo(
    () => (mode === 'development' ? DEVELOPMENT_USER : (account ? accountToUser(account) : null)),
    [account],
  );
  const hasRole = useCallback((...roles) => Boolean(
    user && roles.some((role) => user.roles.includes(role)),
  ), [user]);

  const value = useMemo(() => ({
    mode,
    ready,
    error,
    user,
    isAuthenticated: mode === 'development' || Boolean(account),
    isDevelopmentIdentity: mode === 'development',
    login,
    logout,
    hasRole,
    getAccessToken,
    authFetch,
  }), [account, authFetch, error, getAccessToken, hasRole, login, logout, ready, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth skal bruges under AuthProvider');
  return context;
}

export function RequireRole({ anyOf, children, fallback = null }) {
  const { ready, isAuthenticated, hasRole, login } = useAuth();
  if (!ready) return <div role="status">Kontrollerer adgang…</div>;
  if (!isAuthenticated) {
    return (
      <div role="alert">
        <p>Log ind med din kommunale konto for at fortsætte.</p>
        <button type="button" onClick={login}>Log ind med Microsoft</button>
      </div>
    );
  }
  return hasRole(...anyOf) ? children : fallback;
}
