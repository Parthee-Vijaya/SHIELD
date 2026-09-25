import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

export const TUTORIAL_STEPS = [
  { id: 'welcome', title: 'Fra sag til dokumenteret vurdering', text: 'Denne korte guide viser, hvordan I vurderer AI-løsninger og IT-løsninger med AI, samler leverandørmateriale og arbejder med konsekvensanalyse og risici. Du kan følge en eksisterende eksempelsag eller se den almindelige arbejdsgang.', note: 'Guiden ændrer kun din guidefremdrift. Den opretter ikke sager og starter ikke AI-kørsler.' },
  { id: 'cases', title: 'Saml arbejdet i en sag', text: 'Start med Ny AI-løsning. Angiv løsningens navn og leverandør, beskriv kommunens påtænkte anvendelse og vælg en ansvarlig. Her samles vurderinger, dokumentation, foranstaltninger og godkendelser.', note: 'Eksempelsager bruger fiktive oplysninger og kan hjælpe dig med at lære arbejdsgangen.' },
  { id: 'documents', title: 'Tilknyt dokumenteret grundlag', text: 'Saml præsentationer, databehandleraftale og offentlige leverandørlinks under AI-løsningens Leverandørmateriale. Under Dokumentation på sagen kan du genfinde materialet og de kilder, vurderingen bygger på.', note: 'En leverandøraftale dokumenterer ikke i sig selv kommunens hjemmel eller godkendelse. Manglende oplysninger skal stå åbne.' },
  { id: 'assessment', title: 'Udarbejd konsekvensanalysen', text: 'Gennemgå AI-forslagene og deres kilder, før oplysninger overføres til konsekvensanalysen. Afklar kommunens hjemmel, personoplysninger og sikkerhedsforanstaltninger. AI kan hjælpe med udkastet, og JEV markerer udsagn, der kræver kontrol.', note: 'JEV peger på mulige fejl og mangler. En fagperson skal stadig kontrollere faktum, hjemmel, risici og foranstaltninger. Guiden trykker aldrig på AI-knappen.' },
  { id: 'review', title: 'Gennemgå og bevar historikken', text: 'Åbn sagens Vurderinger for at læse en gemt version. Kontrollér åbne spørgsmål og JEV-markeringer, dokumentér foranstaltninger og inddrag de rette fagpersoner. En ny AI-kørsel gemmer en ny version.', note: 'Gemte versioner og faglige godkendelser er forskellige ting. Godkendelsen skal gives særskilt på et dokumenteret grundlag.' },
  { id: 'export', title: 'Hent samme version som Word og Excel', text: 'Fra den gemte vurdering henter du konsekvensanalysen i Word og risikovurderingen i Excel. Begge filer bygger på den samme vurderingsversion og kan genfindes gennem sagen.', note: 'Word og Excel følger Datatilsynets skabelonstruktur. Et udkast og dets åbne spørgsmål skal gennemgås før anvendelse.' },
  { id: 'finish', title: 'Du er klar til at gå i gang', text: 'Arbejdsgangen er AI-løsning → leverandørmateriale → kildegennemgang → vurdering og jura → download. Start med en eksempelsag, hvis du vil prøve at finde dokumenterne og læse en vurdering.', note: 'Du kan altid åbne guiden igen fra profilmenuen øverst til højre eller i Indstillinger.' },
];

const Layer = styled.div`
  position: fixed; inset: 0; z-index: 6000;
  color: ${p => p.theme.colors.text};
`;
const Panel = styled.section`
  position: fixed;
  right: ${p => p.$centered ? '50%' : p.$left ? 'auto' : '24px'};
  left: ${p => !p.$centered && p.$left ? '24px' : 'auto'};
  bottom: ${p => p.$centered ? '50%' : '24px'};
  transform: ${p => p.$centered ? 'translate(50%, 50%)' : 'none'};
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  padding: 26px;
  border: 1px solid ${p => p.theme.colors.border};
  border-top: 4px solid ${p => p.theme.colors.primary};
  border-radius: 4px;
  background: ${p => p.theme.colors.surface};
  box-shadow: ${p => p.theme.shadows.lg};
  h2 { margin: 14px 0; font-size: 1.55rem; line-height: 1.2; letter-spacing: -0.025em; outline: none; }
  p { margin: 12px 0; font-size: 0.92rem; line-height: 1.65; }
  @media (max-width: 600px) {
    padding: 20px; right: 16px; left: auto; bottom: 16px; transform: none;
    max-height: calc(100dvh - 32px);
    h2 { font-size: 1.35rem; }
  }
  @media (prefers-reduced-motion: reduce) { &, * { scroll-behavior: auto !important; transition: none !important; } }
`;
const TopRow = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  color: ${p => p.theme.colors.textMuted}; font: 600 0.72rem/1.3 ${p => p.theme.fonts.mono};
`;
const Control = styled.button`
  min-height: 42px; padding: 9px 14px; border: 1px solid ${p => p.theme.colors.border};
  border-radius: 3px; color: ${p => p.$primary ? '#fff' : p.theme.colors.text};
  background: ${p => p.$primary ? p.theme.colors.primary : p.theme.colors.surface};
  font-size: 0.84rem; font-weight: 650;
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;
const Note = styled.p`
  padding: 12px 14px; border-left: 3px solid ${p => p.theme.colors.primary};
  background: ${p => p.theme.colors.surfaceAlt}; font-size: 0.81rem !important;
`;
const Controls = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px;
  justify-content: space-between;
  > div { display: flex; gap: 8px; flex-wrap: wrap; }
`;
const Progress = styled.div`
  display: flex; gap: 5px; margin-top: 14px;
  span { height: 3px; flex: 1; background: ${p => p.theme.colors.border}; }
  span[data-done="true"] { background: ${p => p.theme.colors.primary}; }
`;
const ErrorNote = styled.div`
  margin-top: 14px; padding: 12px; background: ${p => p.theme.colors.dangerSoft};
  color: ${p => p.theme.colors.danger}; font-size: 0.84rem; line-height: 1.5;
`;

export const TutorialNotice = styled.div`
  padding: 14px 20px; border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.warningSoft}; color: ${p => p.theme.colors.text};
  font-size: 0.84rem;
  p { display: inline; margin-right: 16px; }
  button { padding: 7px 12px; margin-right: 8px; border: 1px solid ${p => p.theme.colors.border}; color: inherit; }
`;

export default function TutorialDialog({ step, stepIndex, saving, error, targetSelector, routeKey, contentRef, exampleTitle, onNext, onPrevious, onDismiss, onRetry, canRetry, onCloseLocally, onExample }) {
  const panelRef = useRef(null);
  const headingRef = useRef(null);
  const callbacks = useRef({ onDismiss, saving });
  callbacks.current = { onDismiss, saving };
  const [target, setTarget] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const maskId = useId().replace(/:/g, '');

  // Release the modal lock and restore focus in the same commit that closes it.
  useLayoutEffect(() => {
    const previousFocus = document.activeElement;
    const content = contentRef.current;
    const oldOverflow = document.body.style.overflow;
    if (content) { content.setAttribute('inert', ''); content.setAttribute('aria-hidden', 'true'); }
    document.body.style.overflow = 'hidden';
    headingRef.current?.focus();
    const focusables = () => Array.from(panelRef.current?.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]') || []);
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!callbacks.current.saving) callbacks.current.onDismiss(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); event.stopPropagation(); }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); headingRef.current?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const trapFocus = event => { if (!panelRef.current?.contains(event.target)) headingRef.current?.focus(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', trapFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', trapFocus);
      if (content) { content.removeAttribute('inert'); content.removeAttribute('aria-hidden'); }
      document.body.style.overflow = oldOverflow;
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus();
      if (document.activeElement === document.body || panelRef.current?.contains(document.activeElement)) document.getElementById('main-content')?.focus();
    };
  }, [contentRef]);

  useEffect(() => { headingRef.current?.focus(); }, [step.id]);

  useEffect(() => {
    setTarget(null);
    if (!targetSelector) { setWaiting(false); return undefined; }
    setWaiting(true);
    let scrolled = false;
    const measure = () => {
      const element = contentRef.current?.querySelector(targetSelector);
      if (!element) return;
      if (!scrolled) { element.scrollIntoView?.({ block: 'center', behavior: 'instant' }); scrolled = true; }
      const rect = element.getBoundingClientRect();
      setTarget(rect.width && rect.height ? { x: Math.max(4, rect.left - 5), y: Math.max(4, rect.top - 5), width: Math.min(window.innerWidth - 8, rect.width + 10), height: Math.min(window.innerHeight - 8, rect.height + 10) } : null);
      setWaiting(false);
    };
    const observer = new MutationObserver(measure);
    if (contentRef.current) observer.observe(contentRef.current, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => setWaiting(false), 5000);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    measure();
    return () => { observer.disconnect(); window.clearTimeout(timeout); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [targetSelector, routeKey, contentRef]);

  return createPortal(
    <Layer data-tutorial-dialog="true">
      <svg width="100%" height="100%" aria-hidden="true" style={{ position: 'fixed', inset: 0 }}>
        <defs><mask id={maskId}><rect width="100%" height="100%" fill="white" />{target && <rect {...target} rx="4" fill="black" />}</mask></defs>
        <rect width="100%" height="100%" fill="rgba(20,24,31,.56)" mask={`url(#${maskId})`} />
        {target && <rect {...target} rx="4" fill="none" stroke="white" strokeWidth="2" />}
      </svg>
      <Panel ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-description" $centered={step.id === 'welcome' || step.id === 'finish'} $left={Boolean(target && target.x > window.innerWidth * 0.55)}>
        <TopRow><span>Guide · trin {stepIndex + 1} af {TUTORIAL_STEPS.length}</span><Control type="button" onClick={onDismiss} disabled={saving} aria-label="Luk guide">×</Control></TopRow>
        <Progress aria-hidden="true">{TUTORIAL_STEPS.map((item, index) => <span key={item.id} data-done={index <= stepIndex} />)}</Progress>
        <h2 id="tutorial-title" ref={headingRef} tabIndex="-1">{step.title}</h2>
        <p id="tutorial-description">{step.text}</p>
        {exampleTitle && <p><strong>Eksemplet:</strong> {exampleTitle}</p>}
        <Note>{step.note}</Note>
        {waiting && <p role="status">Åbner det relevante område…</p>}
        {saving && <p role="status">Gemmer guidefremdrift…</p>}
        {error && <ErrorNote role="alert">{error}</ErrorNote>}
        {error && <Controls><div>{canRetry && <Control type="button" onClick={onRetry} disabled={saving}>Prøv igen</Control>}<Control type="button" onClick={onCloseLocally}>Luk uden at gemme</Control></div></Controls>}
        <Controls>
          <div>{stepIndex > 0 ? <Control type="button" onClick={onPrevious} disabled={saving || waiting}>Tilbage</Control> : <Control type="button" onClick={onDismiss} disabled={saving}>Spring over</Control>}</div>
          <Control type="button" $primary onClick={onNext} disabled={saving || waiting}>{step.id === 'finish' ? 'Afslut guide' : step.id === 'welcome' ? 'Start guide' : 'Næste'}</Control>
        </Controls>
        {step.id === 'welcome' && <Controls><Control type="button" onClick={onExample} disabled={saving}>Se et eksempel</Control></Controls>}
      </Panel>
    </Layer>, document.body,
  );
}
