import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';

const Field = styled.div`position: relative; min-width: 0;`;
const Menu = styled.div`
  position: absolute; inset: calc(100% + 4px) 0 auto; z-index: 25;
  background: ${p => p.theme.colors.surface}; color: ${p => p.theme.colors.text};
  border: 1px solid ${p => p.theme.colors.border}; border-radius: 0;
  box-shadow: 0 8px 22px rgba(0,0,0,.12); overflow: hidden;
`;
const Results = styled.ul`
  && { list-style: none; margin: 0; padding: 4px; max-height: 290px; overflow-y: auto; }
`;
const Option = styled.li`
  && { margin: 0; padding: 10px 12px; border-radius: 0; cursor: pointer; font-size: .94rem;
    background: ${p => p.$active ? p.theme.colors.primarySoft : 'transparent'}; }
  strong { display: block; font-weight: 600; overflow-wrap: anywhere; }
  small { display: block; line-height: 1.5; margin-top: 3px; }
`;
const Hint = styled.div`
  padding: 10px 14px; font-size: .78rem; line-height: 1.5; color: ${p => p.theme.colors.textMuted};
  border-top: 1px solid ${p => p.theme.colors.border};
`;

/** Accessible free-text combobox. Suggestions never prevent manual entry. */
export default function CatalogAutocomplete({ id, kind, value, onChange, onSelect, systemId, ...inputProps }) {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const list = useRef(null);
  const items = data?.items || [];
  const label = kind === 'systems' ? 'Forslag til løsninger' : 'Forslag til leverandører';

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    const controller = new AbortController();
    setData(null); setActive(-1); setLoading(true); setFailed(false);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind, q: (value || '').slice(0, 255), limit: '12' });
        if (systemId && kind === 'suppliers') params.set('system_id', systemId);
        const response = await authFetch(`/api/system-catalog?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('catalog-unavailable');
        const result = await response.json();
        if (current) setData(result);
      } catch (error) {
        if (current && error.name !== 'AbortError') setFailed(true);
      } finally {
        if (current) setLoading(false);
      }
    }, 180);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [open, kind, value, systemId, authFetch]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const choose = item => {
    onSelect(item);
    setOpen(false); setActive(-1);
  };
  const keyboard = event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      if (items.length) setActive(index => event.key === 'ArrowDown'
        ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1));
    } else if (event.key === 'Enter' && open && active >= 0 && items[active]) {
      event.preventDefault(); choose(items[active]);
    } else if (event.key === 'Tab') setOpen(false);
  };
  const note = loading ? 'Søger i systemkataloget…' : failed
    ? 'Kataloget kan ikke hentes. Skriv navnet manuelt, eller prøv igen ved at åbne feltet.'
    : !data?.source ? 'Der er endnu ikke indlæst et systemkatalog. Skriv navnet manuelt.'
    : items.length ? `${data.total} ${kind === 'systems' ? 'løsninger' : 'organisationer'} fundet. Vælg et forslag, eller behold dit eget navn.`
    : 'Ingen match. Du kan bruge det navn, du har skrevet.';

  return <Field>
    <input {...inputProps} id={id} role="combobox" aria-autocomplete="list"
      aria-expanded={open} aria-controls={open ? `${id}-catalog-options` : undefined}
      aria-activedescendant={open && active >= 0 ? `${id}-catalog-option-${active}` : undefined}
      autoComplete="off" value={value} onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)} onKeyDown={keyboard}
      onChange={event => { setData(null); setActive(-1); onChange(event.target.value); setOpen(true); }} />
    {open && <Menu>
      <Results id={`${id}-catalog-options`} role="listbox" aria-label={label} ref={list}>
        {items.map((item, index) => <Option key={item.id} id={`${id}-catalog-option-${index}`}
          role="option" aria-selected={active === index} $active={active === index}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>
          <strong>{item.name}</strong>
          {kind === 'systems' ? <small>{item.parties?.slice(0, 2).map(party => `${party.role_label}: ${party.name}`).join(' · ') || 'Leverandørrelation er ikke angivet'}{item.available === false && ' · Ikke tilgængelig i kataloget'}</small>
            : <small>{item.related_to_system && 'Knyttet til den valgte løsning · '}{item.role_labels?.join(' · ')}</small>}
        </Option>)}
      </Results>
      <Hint><div role="status" aria-live="polite">{note}</div>{data?.source && <div>Lokalt importeret systemkatalog · {new Date(data.source.imported_at).toLocaleDateString('da-DK')}. Kataloget dokumenterer ikke AI-funktioner eller godkendelse.</div>}</Hint>
    </Menu>}
  </Field>;
}
