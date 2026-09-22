import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { localSearchResults, safeSearchRoute, SEARCH_CATEGORIES } from './searchUtils';

const DEBOUNCE_MS = 250;

/** One search contract for the home page and the global keyboard launcher. */
export default function useWorkspaceSearch(query, enabled = true) {
  const { ready, isAuthenticated, authFetch, user } = useAuth();
  const needle = query.trim().slice(0, 120);
  const identity = user?.oid || user?.id || '';
  const canSearch = Boolean(enabled && ready && isAuthenticated && needle.length >= 2);
  const [state, setState] = useState({ query: '', identity: '', items: [], error: '', loading: false });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!canSearch) return undefined;
    let current = true;
    const controller = new AbortController();
    setState({ query: needle, identity, items: [], error: '', loading: true });
    const timer = setTimeout(async () => {
      try {
        const response = await authFetch(`/api/search/global?q=${encodeURIComponent(needle)}&limit=4`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Du har ikke adgang til at søge i sagerne. Log ind med en bruger med sagsadgang.' : 'Sager og dokumenter kunne ikke hentes. Sidernes genveje er stadig tilgængelige.');
        const payload = await response.json();
        if (!Array.isArray(payload.results)) throw new Error('Søgeresultatet kunne ikke læses. Prøv igen.');
        if (current) setState({ query: needle, identity, items: payload.results, error: '', loading: false });
      } catch (error) {
        if (current && error.name !== 'AbortError') setState({ query: needle, identity, items: [], error: error.message || 'Søgningen kunne ikke gennemføres.', loading: false });
      }
    }, DEBOUNCE_MS);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [needle, canSearch, identity, authFetch, retry]);

  const currentState = state.query === needle && state.identity === identity;
  const groups = useMemo(() => {
    const remote = canSearch && currentState ? state.items : [];
    const combined = [...remote, ...localSearchResults(needle)].filter(safeSearchRoute);
    return SEARCH_CATEGORIES.map(category => {
      const seen = new Set();
      const items = combined.filter(item => item.type === category.id).filter(item => {
        const key = `${item.id}:${safeSearchRoute(item)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { ...category, items };
    }).filter(group => group.items.length > 0);
  }, [canSearch, currentState, state.items, needle]);

  return {
    groups,
    items: groups.flatMap(group => group.items),
    loading: canSearch && (!currentState || state.loading),
    error: canSearch && currentState ? state.error : '',
    retry: () => setRetry(value => value + 1),
  };
}
