import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import TutorialDialog, { TUTORIAL_STEPS, TutorialNotice } from '../components/tutorial/TutorialDialog';

const TutorialContext = createContext({ isOpen: false, loading: false, saving: false, canStart: false, error: '', restart: () => {} });
const STEP_IDS = TUTORIAL_STEPS.map(step => step.id);
const VALID_STATUSES = ['not_started', 'in_progress', 'completed', 'dismissed'];

function parseState(payload) {
  if (!payload || payload.tutorial_version !== 1 || !VALID_STATUSES.includes(payload.status)) throw new Error('Guidens status kunne ikke læses.');
  return { ...payload, step_id: STEP_IDS.includes(payload.step_id) ? payload.step_id : 'welcome' };
}

function contextFromLocation(location) {
  const params = new URLSearchParams(location.search);
  const match = location.pathname.match(/^\/sager\/([^/]+)$/);
  return {
    caseId: match?.[1] || params.get('case') || params.get('case_id') || params.get('case_db_id') || params.get('guide_case') || '',
    assessmentId: params.get('assessment_id') || params.get('assessment') || params.get('guide_assessment') || '',
    example: params.get('examples') === '1' || params.get('guide_example') === '1',
  };
}

export function tutorialDestination(stepId, context) {
  const casePath = context.caseId ? `/sager/${encodeURIComponent(context.caseId)}` : '/sager';
  const assessmentPath = context.assessmentId
    ? `/vurdering?assessment_id=${encodeURIComponent(context.assessmentId)}&case=${encodeURIComponent(context.caseId || '')}`
    : `/vurdering${context.caseId ? `?case=${encodeURIComponent(context.caseId)}` : ''}`;
  const retainContext = path => {
    const params = new URLSearchParams();
    if (context.caseId) params.set('guide_case', context.caseId);
    if (context.assessmentId) params.set('guide_assessment', context.assessmentId);
    if (context.example) params.set('guide_example', '1');
    return params.toString() ? `${path}${path.includes('?') ? '&' : '?'}${params}` : path;
  };
  if (stepId === 'cases') return { path: retainContext(context.example ? '/sager?examples=1' : '/sager'), target: '[data-tour="new-case"]' };
  if (stepId === 'documents') return context.caseId
    ? { path: retainContext(`${casePath}?tab=documents`), target: '[data-tour="case-documents"]' }
    : { path: '/dokumentbank', target: '[data-tour="document-bank"]' };
  if (stepId === 'assessment') return { path: assessmentPath, target: context.assessmentId ? '[data-tour="ai-report"]' : '[data-tour="assessment-form"]' };
  if (stepId === 'review') return { path: context.caseId ? retainContext(`${casePath}?tab=assessments`) : casePath, target: context.caseId ? '[data-tour="case-assessments"]' : '[data-tour="cases-list"]' };
  if (stepId === 'export') return context.assessmentId
    ? { path: assessmentPath, target: '[data-tour="assessment-downloads"]' }
    : { path: context.caseId ? `${casePath}?tab=exports` : casePath, target: context.caseId ? '[data-tour="case-exports"]' : '[data-tour="cases-list"]' };
  return { path: null, target: null };
}

export function TutorialProvider({ children }) {
  const { user, ready, isAuthenticated, authFetch } = useAuth();
  const userKey = user?.oid || user?.id || user?.username || '';
  const canStart = Boolean(ready && isAuthenticated && userKey);
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const userRef = useRef(userKey);
  userRef.current = userKey;
  const locationRef = useRef(location);
  locationRef.current = location;
  const requestsRef = useRef(new Set());
  const busyRef = useRef(false);
  const retryRef = useRef(null);
  const contentRef = useRef(null);
  const [saved, setSaved] = useState(null);
  const [openFor, setOpenFor] = useState(null);
  const [loading, setLoading] = useState(canStart);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tourContext, setTourContext] = useState({});
  const state = saved?.owner === userKey ? saved.value : null;
  const isOpen = canStart && openFor === userKey && Boolean(state);

  const request = useCallback(async (options = {}) => {
    const controller = new AbortController();
    requestsRef.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await authFetch('/api/user/tutorial', { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error('Din guidefremdrift kunne ikke gemmes eller hentes.');
      return parseState(payload);
    } finally {
      window.clearTimeout(timeout);
      requestsRef.current.delete(controller);
    }
  }, [authFetch]);

  useEffect(() => {
    let active = true;
    requestsRef.current.forEach(controller => controller.abort());
    busyRef.current = false;
    retryRef.current = null;
    setSaved(null);
    setOpenFor(null);
    setSaving(false);
    setError('');
    setLoading(canStart);
    if (!canStart) return undefined;
    const owner = userKey;
    request().then(value => {
      if (!active || userRef.current !== owner) return;
      const context = contextFromLocation(locationRef.current);
      setSaved({ owner, value });
      setTourContext(context);
      if (['not_started', 'in_progress'].includes(value.status)) {
        setOpenFor(owner);
        if (value.status === 'in_progress') {
          const destination = tutorialDestination(value.step_id, context);
          if (destination.path) navigateRef.current(destination.path, { replace: true });
        }
      }
    }).catch(() => {
      if (active && userRef.current === owner) setError('Guidens gemte fremdrift kunne ikke hentes. Du kan åbne guiden igen fra Flere.');
    }).finally(() => {
      if (active && userRef.current === owner) setLoading(false);
    });
    return () => {
      active = false;
      requestsRef.current.forEach(controller => controller.abort());
    };
  }, [canStart, userKey, request]);

  const persist = useCallback(async (nextState, onSuccess) => {
    if (!canStart || busyRef.current) return;
    const owner = userKey;
    busyRef.current = true;
    setSaving(true);
    setError('');
    retryRef.current = () => persist(nextState, onSuccess);
    try {
      const value = await request({ method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ tutorial_version: 1, ...nextState }) });
      if (userRef.current !== owner) return;
      setSaved({ owner, value });
      retryRef.current = null;
      onSuccess?.(value);
    } catch (_) {
      if (userRef.current === owner) setError('Din fremdrift kunne ikke gemmes. Prøv igen, eller luk guiden uden at gemme.');
    } finally {
      if (userRef.current === owner) {
        busyRef.current = false;
        setSaving(false);
      }
    }
  }, [canStart, userKey, request]);

  const showStep = (stepId, context = tourContext) => {
    persist({ status: 'in_progress', step_id: stepId }, () => {
      setOpenFor(userKey);
      const destination = tutorialDestination(stepId, context);
      if (destination.path) navigate(destination.path);
    });
  };

  const restart = () => {
    if (!canStart) return;
    const context = contextFromLocation(location);
    setTourContext(context);
    persist({ status: 'not_started', step_id: 'welcome' }, () => setOpenFor(userKey));
  };

  const chooseExample = async () => {
    if (busyRef.current) return;
    const owner = userKey;
    setSaving(true);
    busyRef.current = true;
    setError('');
    retryRef.current = null;
    let handedOff = false;
    const controller = new AbortController();
    requestsRef.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await authFetch('/api/v3/cases', { signal: controller.signal });
      const payload = await response.json();
      if (userRef.current !== owner || controller.signal.aborted) return;
      const example = response.ok && Array.isArray(payload.items) && payload.items.find(item => typeof item?.id === 'string' && typeof item?.case_id === 'string' && item.case_id.startsWith('EKSEMPEL-'));
      if (!example) throw new Error('Der er ingen eksempelsag tilgængelig. Brug Start guide for at se den almindelige arbejdsgang.');
      const workspaceResponse = await authFetch(`/api/v3/cases/${encodeURIComponent(example.id)}/workspace`, { signal: controller.signal });
      const workspace = await workspaceResponse.json();
      if (!workspaceResponse.ok) throw new Error('Eksempelsagen kunne ikke åbnes. Prøv den almindelige guide.');
      if (userRef.current !== owner) return;
      const assessments = workspace.assessments?.dpia;
      const latest = Array.isArray(assessments) ? [...assessments].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0] : null;
      const context = { caseId: example.id, assessmentId: typeof latest?.id === 'string' ? latest.id : '', title: example.title, example: true };
      setTourContext(context);
      busyRef.current = false;
      setSaving(false);
      handedOff = true;
      showStep('cases', context);
    } catch (problem) {
      if (userRef.current === owner) setError(problem.name === 'AbortError' ? 'Eksempelsagen tog for lang tid at hente. Prøv den almindelige guide.' : problem.message);
    } finally {
      window.clearTimeout(timeout);
      requestsRef.current.delete(controller);
      if (userRef.current === owner && !handedOff) {
        busyRef.current = false;
        setSaving(false);
      }
    }
  };

  const dismiss = () => persist({ status: 'dismissed', step_id: state?.step_id || 'welcome' }, () => setOpenFor(null));
  const finish = () => persist({ status: 'completed', step_id: 'finish' }, () => setOpenFor(null));
  const index = Math.max(0, STEP_IDS.indexOf(state?.step_id));
  const destination = tutorialDestination(state?.step_id, tourContext);
  const contextValue = { isOpen, loading, saving, canStart, error, restart };

  return (
    <TutorialContext.Provider value={contextValue}>
      <div ref={contentRef} data-tutorial-background="true">
        {!isOpen && error && canStart && <TutorialNotice role="alert"><p>{error}</p><button type="button" disabled={saving} onClick={restart}>Åbn guide</button><button type="button" onClick={() => setError('')}>Luk besked</button></TutorialNotice>}
        {children}
      </div>
      {isOpen && <TutorialDialog
        step={TUTORIAL_STEPS[index]}
        stepIndex={index}
        invitation={state.status === 'not_started'}
        saving={saving}
        error={error}
        targetSelector={destination.target}
        routeKey={`${location.pathname}${location.search}`}
        contentRef={contentRef}
        exampleTitle={tourContext.example ? tourContext.title : ''}
        onNext={() => index === STEP_IDS.length - 1 ? finish() : showStep(STEP_IDS[index + 1])}
        onPrevious={() => showStep(STEP_IDS[index - 1])}
        onDismiss={dismiss}
        onRetry={() => retryRef.current?.()}
        canRetry={Boolean(retryRef.current)}
        onCloseLocally={() => { setOpenFor(null); setError(''); }}
        onExample={chooseExample}
      />}
    </TutorialContext.Provider>
  );
}

export const useTutorial = () => useContext(TutorialContext);
