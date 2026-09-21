import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

const Trigger = styled.button`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  margin: -3px 0 0 5px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 50%;
  background: ${p => p.theme.colors.surface};
  color: ${p => p.theme.colors.primary};
  font: 650 0.82rem ${p => p.theme.fonts.body};
  line-height: 1;
  cursor: help;
  vertical-align: middle;
  &:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
  @media (pointer: coarse) { width: 40px; height: 40px; }
`;
const Tooltip = styled.div`
  position: fixed;
  z-index: 12000;
  box-sizing: border-box;
  width: min(330px, calc(100vw - 24px));
  max-width: calc(100vw - 24px);
  overflow: auto;
  overflow-wrap: anywhere;
  padding: 14px 16px;
  background: ${p => p.theme.colors.ink};
  color: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.line};
  box-shadow: ${p => p.theme.shadows.md};
  font: 400 0.85rem/1.6 ${p => p.theme.fonts.body};
  text-align: left;
  white-space: normal;
  &[hidden] { display: none; }
`;

/** id is the description ID: inputs may reference it in aria-describedby. */
export default function FieldHelp({ label, children, id }) {
  const generatedId = useId();
  const descriptionId = id || `field-help-${generatedId}`;
  const trigger = useRef(null);
  const tooltip = useRef(null);
  const leaveTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 'calc(100vh - 24px)' });
  const stayOpen = () => { window.clearTimeout(leaveTimer.current); setOpen(true); };
  const leave = () => { if (!pinned && document.activeElement !== trigger.current) leaveTimer.current = window.setTimeout(() => setOpen(false), 150); };
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const popup = tooltip.current?.getBoundingClientRect();
      if (!anchor || !popup) return;
      const width = Math.max(24, document.documentElement.clientWidth || window.innerWidth);
      const height = Math.max(24, window.innerHeight);
      const below = height - anchor.bottom - 20;
      const above = anchor.top - 20;
      const placeAbove = below < Math.min(popup.height, 160) && above > below;
      const maxHeight = Math.max(40, (placeAbove ? above : below));
      setPosition({
        left: Math.max(12, Math.min(anchor.left, width - popup.width - 12)),
        top: Math.max(12, placeAbove ? anchor.top - Math.min(popup.height, maxHeight) - 8 : Math.min(anchor.bottom + 8, height - Math.min(popup.height, maxHeight) - 12)),
        maxHeight,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, children]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && (trigger.current?.contains(event.target) || tooltip.current?.contains(event.target))) return;
      setOpen(false); setPinned(false);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); };
  }, [open]);

  return <>
    <Trigger ref={trigger} type="button" aria-label={`Hjælp til ${label}`} aria-describedby={descriptionId} aria-controls={descriptionId} aria-expanded={open}
      onMouseEnter={stayOpen} onMouseLeave={leave}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setPinned(false); }}
      onClick={() => { setOpen(!pinned); setPinned(!pinned); }}>?</Trigger>
    {createPortal(<Tooltip ref={tooltip} id={descriptionId} role="tooltip" hidden={!open} style={position} onMouseEnter={stayOpen} onMouseLeave={leave}>{children}</Tooltip>, document.body)}
  </>;
}
