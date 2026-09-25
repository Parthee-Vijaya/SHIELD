import React, { useEffect, useLayoutEffect, useRef } from 'react';
import styled from 'styled-components';
import { ALL_NAVIGATION } from '../../config/navigation';
import WorkspaceSearch from '../workspace-search/WorkspaceSearch';

const COMMANDS = ALL_NAVIGATION;
const Backdrop = styled.div`
  position: fixed; inset: 0; z-index: 1000; background: rgba(22,26,30,.45);
  display: flex; align-items: flex-start; justify-content: center; padding: min(12vh,100px) 16px 24px;
`;
const Panel = styled.div`
  border-radius: ${p => p.theme.borderRadiusLarge};
  width: min(760px,100%); max-height: 82vh; overflow-y: auto; padding: 24px;
  border: 1px solid ${p => p.theme.colors.border}; background: ${p => p.theme.colors.surface}; box-shadow: ${p => p.theme.shadows.xl};
  .palette-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 20px; }
  .palette-header h2 { margin: 0; font-size: 1.25rem; font-weight: 600; letter-spacing: -.025em; }
  .palette-header button { padding: 7px 11px; color: ${p => p.theme.colors.textMuted}; background: transparent; border: 1px solid ${p => p.theme.colors.border}; font: inherit; font-size: .78rem; cursor: pointer; }
  .palette-footer { padding-top: 16px; color: ${p => p.theme.colors.textMuted}; font-size: .76rem; }
  @media(max-width: 600px) { padding: 18px; }
`;

// ---- Hook for global ⌘K binding ------------------------------------------

export const useCommandPaletteShortcut = (open) => {
  useEffect(() => {
    const handler = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);
};

// ---- Hook for g-prefix vim-style shortcuts -------------------------------
//
// Press `g` (alone), then within ~700ms press a second letter that matches
// a command's hint (e.g. `g v` → /vurdering, `g h` → /, `g i` → /historik).
// Aborts if the user is typing, holds a modifier, or waits too long.

const GOTO_TIMEOUT_MS = 700;

export const useGotoShortcuts = (navigate, isPaletteOpen = false) => {
  useEffect(() => {
    let pending = false;
    let timer = null;

    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const cancel = () => {
      pending = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const handler = (e) => {
      // Skip when palette is open or any modifier is held.
      if (isPaletteOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Skip when user is typing.
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        cancel();
        return;
      }

      if (!pending) {
        // First keystroke must be plain "g"
        if (e.key === 'g' || e.key === 'G') {
          pending = true;
          timer = setTimeout(cancel, GOTO_TIMEOUT_MS);
        }
        return;
      }

      // Second keystroke — try to match against COMMANDS hint
      const second = (e.key || '').toLowerCase();
      const target = COMMANDS.find((c) => {
        if (!c.hint) return false;
        const parts = c.hint.split(/\s+/);
        return parts.length === 2 && parts[0] === 'g' && parts[1] === second;
      });
      cancel();
      if (target?.path) {
        e.preventDefault();
        navigate(target.path);
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      cancel();
    };
  }, [navigate, isPaletteOpen]);
};

// Home and keyboard search share the same results, access checks and interactions.
const CommandPalette = ({ isOpen, onClose }) => {
  const panel = useRef(null);
  const trigger = useRef(null);
  // Capture the launcher before the child's passive autofocus runs.
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    trigger.current = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; trigger.current?.focus?.(); };
  }, [isOpen]);

  const handleKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('input, button, a[href], [tabindex="0"]')].filter(node => node.tabIndex >= 0 && !node.disabled);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  if (!isOpen) return null;
  return <Backdrop onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <Panel ref={panel} role="dialog" aria-modal="true" aria-labelledby="workspace-palette-title" onKeyDown={handleKey}>
      <div className="palette-header"><h2 id="workspace-palette-title">Søg i arbejdsrummet</h2><button type="button" onClick={onClose} aria-label="Luk søgning">Luk · Esc</button></div>
      <WorkspaceSearch inline autoFocus onNavigate={onClose} />
      <div className="palette-footer">↑ ↓ Vælg resultat · Enter Åbn · Esc Luk</div>
    </Panel>
  </Backdrop>;
};

export default CommandPalette;
