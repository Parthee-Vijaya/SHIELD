import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import axios from 'axios';

const AuthContext = createContext(null);
const LOCAL_SESSION_KEY = 'shield.local-session.v1';
const requestedMode = process.env.REACT_APP_AUTH_MODE === 'entra' ? 'entra' : 'development';
const tenantId = process.env.REACT_APP_ENTRA_TENANT_ID || '';
const clientId = process.env.REACT_APP_ENTRA_CLIENT_ID || '';
const apiScope = process.env.REACT_APP_ENTRA_API_SCOPE || '';
const redirectUri = process.env.REACT_APP_ENTRA_REDIRECT_URI || window.location.origin;
const entraConfigured = Boolean(tenantId && clientId && apiScope);
const msal = requestedMode === 'entra' && entraConfigured
  ? new PublicClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, redirectUri, postLogoutRedirectUri: `${window.location.origin}/login` },
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
    })
  : null;

// This marker remembers the visitor's choice in this tab. It is not an access
// token or an API protection mechanism. The API always decides identity/roles.
function localSessionIdentity(principal) {
  return JSON.stringify({ oid: principal.oid, name: principal.name });
}
function rememberedSession(principal) {
  try { return sessionStorage.getItem(LOCAL_SESSION_KEY) === localSessionIdentity(principal); } catch { return false; }
}
function forgetSession() {
  try { sessionStorage.removeItem(LOCAL_SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

async function fetchPrincipal(token, expectedMode, signal) {
  const response = await fetch('/api/auth/me', {
    headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' },
    cache: 'no-store', signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? 'Denne server kræver kommunalt login. Lokal adgang er ikke tilgængelig.'
      : 'Forbindelsen til SHIELD kunne ikke bekræftes. Prøv igen.');
  }
  const data = await response.json();
  const assurance = expectedMode === 'development' ? 'development_only' : 'verified_entra_token';
  if (!data?.oid || !data?.name || !Array.isArray(data.roles) || data.auth_mode !== expectedMode || data.identity_assurance !== assurance) {
    throw new Error('Serverens loginopsætning matcher ikke denne udgave af SHIELD. Kontakt administratoren.');
  }
  return { ...data, authMode: data.auth_mode, identityAssurance: data.identity_assurance };
}

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [principal, setPrincipal] = useState(null);
  const [localSession, setLocalSession] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setReady(false);
    setError('');
    setPrincipal(null);
    (async () => {
      try {
        if (requestedMode === 'development') {
          const next = await fetchPrincipal(null, 'development', controller.signal);
          if (active) { setPrincipal(next); setLocalSession(rememberedSession(next)); }
        } else {
          if (!msal) throw new Error('Microsoft-login er ikke konfigureret. Kontakt administratoren.');
          await msal.initialize();
          const redirectResult = await msal.handleRedirectPromise();
          const nextAccount = redirectResult?.account || msal.getActiveAccount() || msal.getAllAccounts()[0] || null;
          if (nextAccount) {
            msal.setActiveAccount(nextAccount);
            if (active) setAccount(nextAccount);
            let accessToken;
            try {
              accessToken = (await msal.acquireTokenSilent({ account: nextAccount, scopes: [apiScope] })).accessToken;
            } catch (tokenError) {
              if (tokenError instanceof InteractionRequiredAuthError) {
                await msal.acquireTokenRedirect({ account: nextAccount, scopes: [apiScope] });
              }
              throw tokenError;
            }
            const next = await fetchPrincipal(accessToken, 'entra', controller.signal);
            if (active) setPrincipal(next);
          }
        }
      } catch (authError) {
        if (active) {
          setLocalSession(false);
          forgetSession();
          setError(authError.name === 'AbortError' ? 'Serveren svarede ikke. Prøv forbindelsen igen.' : authError.message || 'Login kunne ikke initialiseres.');
        }
      } finally {
        window.clearTimeout(timeout);
        if (active) setReady(true);
      }
    })();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [attempt]);

  const login = useCallback(async () => {
    if (requestedMode === 'development') {
      if (!principal || principal.identityAssurance !== 'development_only') throw new Error('Lokal session er ikke tilgængelig.');
      try { sessionStorage.setItem(LOCAL_SESSION_KEY, localSessionIdentity(principal)); } catch { /* Current tab still works without persistence. */ }
      setLocalSession(true);
      return;
    }
    if (!msal) throw new Error('Microsoft-login er ikke konfigureret.');
    await msal.loginRedirect({ scopes: ['openid', 'profile', apiScope] });
  }, [principal]);

  const logout = useCallback(async () => {
    forgetSession();
    setLocalSession(false);
    if (msal) {
      setPrincipal(null);
      await msal.logoutRedirect({ account: msal.getActiveAccount() || account });
    }
  }, [account]);

  const user = principal && (requestedMode === 'entra' || localSession) ? principal : null;
  const getAccessToken = useCallback(async () => {
    if (!user) throw new Error('Start en session for at fortsætte.');
    if (requestedMode === 'development') return null;
    if (!msal || !account) throw new Error('Log ind med Microsoft Entra ID.');
    try {
      return (await msal.acquireTokenSilent({ account, scopes: [apiScope] })).accessToken;
    } catch (tokenError) {
      if (tokenError instanceof InteractionRequiredAuthError) await msal.acquireTokenRedirect({ account, scopes: [apiScope] });
      throw tokenError;
    }
  }, [account, user]);

  const authFetch = useCallback(async (url, options = {}) => {
    if (new URL(url, window.location.origin).origin !== window.location.origin) {
      throw new Error('Godkendte API-kald skal bruge SHIELDs egen adresse.');
    }
    const token = await getAccessToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }, [getAccessToken]);

  useEffect(() => {
    const interceptor = axios.interceptors.request.use(async config => {
      const requestUrl = new URL(config.url || '', new URL(config.baseURL || '/', window.location.origin));
      if (requestUrl.origin !== window.location.origin) return config;
      if (!user) return config;
      const token = await getAccessToken();
      config.headers = config.headers || {};
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return () => axios.interceptors.request.eject(interceptor);
  }, [getAccessToken, user]);

  const hasRole = useCallback((...roles) => Boolean(user && roles.some(role => user.roles.includes(role))), [user]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const value = useMemo(() => ({
    mode: requestedMode, ready, error, user,
    availableUser: requestedMode === 'development' ? principal : null,
    canLogin: ready && (requestedMode === 'development' ? Boolean(principal) : Boolean(msal)),
    isAuthenticated: Boolean(user),
    isDevelopmentIdentity: principal?.identityAssurance === 'development_only',
    login, logout, retry, hasRole, getAccessToken, authFetch,
  }), [authFetch, error, getAccessToken, hasRole, login, logout, principal, ready, retry, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth skal bruges under AuthProvider');
  return context;
}

export function RequireRole({ anyOf, children, fallback = null }) {
  const { ready, isAuthenticated, hasRole, login, isDevelopmentIdentity, availableUser, canLogin } = useAuth();
  if (!ready) return <div role="status">Kontrollerer adgang…</div>;
  if (!isAuthenticated) return <div role="alert"><p>Start en session for at fortsætte.</p>{canLogin && <button type="button" onClick={login}>{isDevelopmentIdentity ? `Fortsæt som ${availableUser?.name || 'lokal bruger'}` : 'Log ind med Microsoft'}</button>}</div>;
  return hasRole(...anyOf) ? children : fallback;
}
