import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import useWorkspaceSearch from './useWorkspaceSearch';
import { safeSearchRoute } from './searchUtils';

const Shell = styled.div`
  position: relative; min-width: 0; width: 100%; text-align: left;
  label { display: block; margin-bottom: 10px; font-size: .86rem; font-weight: 650; color: ${p => p.theme.colors.text}; }
  .search-input-row { display: flex; align-items: center; gap: 13px; border: 1px solid ${p => p.theme.colors.border}; background: ${p => p.theme.colors.surface}; padding: 0 18px; min-height: 60px; border-radius: ${p => p.theme.borderRadius}; box-shadow: ${p => p.theme.shadows.md}; }
  .search-input-row[data-focused=true] { border-color: ${p => p.theme.colors.primary}; outline: 2px solid ${p => p.theme.colors.primarySoft}; outline-offset: 2px; }
  .search-input-row svg { flex-shrink: 0; color: ${p => p.theme.colors.textMuted}; }
  .search-input-row input { width: 100%; min-width: 0; height: 58px; border: 0; outline: none; padding: 0; background: transparent; color: ${p => p.theme.colors.text}; font: 400 1rem ${p => p.theme.fonts.body}; }
  .search-input-row input::placeholder { color: ${p => p.theme.colors.textMuted}; }
  .search-input-row input:focus-visible { outline: none; }
  .search-clear { border: 0; background: transparent; color: ${p => p.theme.colors.textMuted}; cursor: pointer; padding: 10px; font: inherit; }
  .search-hint { margin: 10px 0 0; color: ${p => p.theme.colors.textMuted}; font-size: .77rem; line-height: 1.55; }
  .search-dropdown { position: ${p => p.$inline ? 'static' : 'absolute'}; inset: auto 0; z-index: 35; margin-top: 8px; border: 1px solid ${p => p.theme.colors.border}; background: ${p => p.theme.colors.surface}; box-shadow: ${p => p.$inline ? 'none' : p.theme.shadows.lg}; max-height: min(440px, 65vh); overflow-y: auto; overscroll-behavior: contain; border-radius: ${p => p.theme.borderRadius}; }
  .search-group + .search-group { border-top: 1px solid ${p => p.theme.colors.border}; }
  .search-group-label { display: block; padding: 14px 18px 6px; color: ${p => p.theme.colors.textMuted}; font-size: .73rem; font-weight: 650; letter-spacing: .045em; text-transform: uppercase; }
  .search-result { display: block; padding: 11px 18px; color: ${p => p.theme.colors.text}; text-decoration: none; overflow-wrap: anywhere; }
  .search-result[aria-selected=true], .search-result:hover { background: ${p => p.theme.colors.primarySoft}; }
  .search-result strong { display: block; font-size: .9rem; font-weight: 600; line-height: 1.45; }
  .search-result small { display: block; margin-top: 4px; font-size: .75rem; line-height: 1.5; color: ${p => p.theme.colors.textMuted}; }
  .search-message { padding: 12px 18px; margin: 0; color: ${p => p.theme.colors.textMuted}; font-size: .8rem; line-height: 1.55; }
  .search-message button { margin-left: 8px; border: 0; padding: 4px; background: none; color: ${p => p.theme.colors.primaryDark}; font: inherit; text-decoration: underline; cursor: pointer; }
  @media (max-width: 600px) { .search-input-row { padding: 0 12px; gap: 9px; } .search-input-row input { font-size: .93rem; } }
`;

export default function WorkspaceSearch({ autoFocus = false, inline = false, onNavigate, onEscape, label = 'Søg på tværs af SHIELD' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(inline);
  const [selection, setSelection] = useState({ key: '', index: -1 });
  const input = useRef(null);
  const shell = useRef(null);
  const uid = useId().replace(/:/g, '');
  const listId = `workspace-search-${uid}`;
  const navigate = useNavigate();
  const { groups, items, loading, error, retry } = useWorkspaceSearch(query, open);
  const signature = items.map(item => item.id).join('|');
  const selectionKey = `${query}:${signature}`;
  const active = selection.key === selectionKey ? selection.index : -1;
  const setActive = next => setSelection(previous => {
    const current = previous.key === selectionKey ? previous.index : -1;
    return { key: selectionKey, index: typeof next === 'function' ? next(current) : next };
  });

  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => { if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, listId]);

  const choose = item => {
    const path = safeSearchRoute(item);
    if (!path) return;
    setOpen(false);
    navigate(path);
    onNavigate?.();
  };
  const handleKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); onEscape?.(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, items.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(index - 1, 0)); }
    if (event.key === 'Enter' && open && items.length) { event.preventDefault(); choose(items[Math.max(0, active)]); }
  };
  let index = -1;

  return <Shell ref={shell} $inline={inline} onBlur={event => { if (!shell.current?.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={`${listId}-input`}>{label}</label>
    <div className="search-input-row" data-focused={open}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input ref={input} id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 && items[active] ? `${listId}-${active}` : undefined} aria-describedby={`${listId}-hint`} autoComplete="off" maxLength={120} placeholder="Find en sag, vurdering, dokument eller vejledning…" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={handleKey} />
      {query && <button className="search-clear" type="button" aria-label="Ryd søgning på tværs af SHIELD" onClick={() => { setQuery(''); input.current?.focus(); }}>×</button>}
    </div>
    <p id={`${listId}-hint`} className="search-hint">Søg på navn, sagsnummer eller emne. Små stavefejl er okay.</p>
    {open && <div className="search-dropdown">
      <div role="status" aria-live="polite" className="search-message">{query.trim().length < 2 ? 'Skriv mindst to tegn for at søge i sager og dokumenter. Eller vælg en genvej.' : loading ? 'Søger i sager, vurderinger og dokumenter…' : `${items.length} ${items.length === 1 ? 'resultat' : 'resultater'}${items.length ? ' · Brug piletaster og Enter, eller vælg nedenfor.' : ' · Prøv et kortere navn eller et andet emne.'}`}</div>
      {error && <div role="alert" className="search-message">{error}<button type="button" onClick={retry}>Prøv igen</button></div>}
      <div id={listId} role="listbox" aria-label="Søgeresultater" aria-busy={loading}>
        {groups.map(group => <div key={group.id} className="search-group" role="group" aria-label={group.label}>
          <span className="search-group-label" aria-hidden="true">{group.label}</span>
          {group.items.map(item => {
            index += 1;
            const itemIndex = index;
            return <a key={item.id} id={`${listId}-${itemIndex}`} className="search-result" role="option" tabIndex={-1} aria-selected={active === itemIndex} href={safeSearchRoute(item)} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(itemIndex)} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); choose(item); } }}><strong>{item.title}</strong>{item.summary && <small>{item.summary}</small>}</a>;
          })}
        </div>)}
      </div>
    </div>}
  </Shell>;
}
