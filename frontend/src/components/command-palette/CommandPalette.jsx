import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ALL_NAVIGATION } from '../../config/navigation';

/**
 * CommandPalette — keyboard-first launcher (⌘K / Ctrl+K).
 *
 * Lightweight, no external deps beyond framer-motion (already in deps).
 * The list of commands is centralized here so any page can navigate to
 * it via the same keyboard idiom.
 *
 * Open: ⌘K (mac) / Ctrl+K (other). Esc to close. Up/Down to navigate.
 * Enter to run.
 */

const COMMANDS = [
  ...ALL_NAVIGATION.map((item) => ({ ...item, kind: 'nav' })),
  {
    id: 'compare',
    label: 'Sammenlign vurderingsmotorer',
    hint: 'g c',
    path: '/sammenlign',
    kind: 'nav',
  },
];

const KIND_LABEL = {
  nav: 'Naviger',
  action: 'Handling',
};

// ---- Styled ---------------------------------------------------------------

const Backdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
`;

const Panel = styled(motion.div)`
  width: min(640px, 92vw);
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadiusLarge};
  box-shadow: ${(p) => p.theme.shadows.xl};
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const InputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
`;

const Prompt = styled.span`
  color: ${(p) => p.theme.colors.primary};
  font-weight: 600;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.9rem;
`;

const Input = styled.input`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 1.05rem;
  color: ${(p) => p.theme.colors.text};
  font-family: ${(p) => p.theme.fonts.main};
  &::placeholder {
    color: ${(p) => p.theme.colors.textMuted};
  }
`;

const Esc = styled.kbd`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  background: ${(p) => p.theme.colors.surfaceAlt};
  border: 1px solid ${(p) => p.theme.colors.border};
  padding: 2px 6px;
  border-radius: 4px;
  color: ${(p) => p.theme.colors.textMuted};
`;

const List = styled.ul`
  max-height: 50vh;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0.4rem 0;
`;

const Item = styled.li`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.55rem 1.1rem;
  cursor: pointer;
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.text};
  background: ${(p) => (p.$active ? p.theme.colors.surfaceAlt : 'transparent')};

  &:hover {
    background: ${(p) => p.theme.colors.surfaceAlt};
  }
`;

const ItemLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`;

const ItemKind = styled.span`
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${(p) => p.theme.colors.textMuted};
  background: ${(p) => p.theme.colors.surfaceAlt};
  padding: 2px 6px;
  border-radius: 3px;
`;

const Hint = styled.span`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  color: ${(p) => p.theme.colors.textMuted};
`;

const Empty = styled.div`
  padding: 2rem 1rem;
  text-align: center;
  color: ${(p) => p.theme.colors.textMuted};
  font-size: 0.92rem;
`;

const Footer = styled.div`
  display: flex;
  gap: 1.25rem;
  padding: 0.55rem 1.1rem;
  border-top: 1px solid ${(p) => p.theme.colors.border};
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.textMuted};
`;

const FooterKey = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;

  kbd {
    font-family: ${(p) => p.theme.fonts.mono};
    background: ${(p) => p.theme.colors.surfaceAlt};
    border: 1px solid ${(p) => p.theme.colors.border};
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 0.7rem;
  }
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

// ---- Component -----------------------------------------------------------

const CommandPalette = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIdx(0);
      // autofocus after the modal mounts
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) =>
      c.label.toLowerCase().includes(q) || (c.hint || '').includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  const runCommand = (cmd) => {
    if (!cmd) return;
    if (cmd.kind === 'nav' && cmd.path) {
      navigate(cmd.path);
    }
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(filtered[activeIdx]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Backdrop
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={onClose}
        >
          <Panel
            role="dialog"
            aria-modal="true"
            aria-label="Hurtig navigation"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <InputRow>
              <Prompt>›</Prompt>
              <Input
                ref={inputRef}
                aria-label="Søg i navigationen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Søg eller naviger…"
              />
              <Esc>Esc</Esc>
            </InputRow>

            {filtered.length === 0 ? (
              <Empty>Ingen kommandoer matcher "{query}"</Empty>
            ) : (
              <List>
                {filtered.map((cmd, idx) => (
                  <Item
                    key={cmd.id}
                    $active={idx === activeIdx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => runCommand(cmd)}
                  >
                    <ItemLabel>
                      <ItemKind>{KIND_LABEL[cmd.kind] || cmd.kind}</ItemKind>
                      {cmd.label}
                    </ItemLabel>
                    {cmd.hint && <Hint>{cmd.hint}</Hint>}
                  </Item>
                ))}
              </List>
            )}

            <Footer>
              <FooterKey>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                naviger
              </FooterKey>
              <FooterKey>
                <kbd>↵</kbd>
                vælg
              </FooterKey>
              <FooterKey>
                <kbd>Esc</kbd>
                luk
              </FooterKey>
            </Footer>
          </Panel>
        </Backdrop>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
