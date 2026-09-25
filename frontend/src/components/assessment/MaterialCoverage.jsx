import React, { useId } from 'react';
import styled from 'styled-components';

const Panel = styled.section`
  min-width: 0; margin: 24px 0; color: ${p => p.theme.colors.text};
  overflow-wrap: anywhere;
  h3 { margin: 0 0 8px; font-size: 1.15rem; }
  p { margin: 0; color: ${p => p.theme.colors.textMuted}; font-size: .84rem; line-height: 1.6; }
`;
const List = styled.ul`
  margin: 16px 0 12px; padding: 0; list-style: none;
  border-top: 1px solid ${p => p.theme.colors.border};
  > li { display: grid; grid-template-columns: 22px minmax(0,1fr) auto; align-items: start; gap: 10px; padding: 13px 0; margin: 0; border-bottom: 1px solid ${p => p.theme.colors.border}; }
  strong { display: block; font-size: .88rem; font-weight: 620; }
  small { display: block; color: ${p => p.theme.colors.textMuted}; line-height: 1.5; font-size: .78rem; }
  @media(max-width: 520px) { > li { grid-template-columns: 20px minmax(0,1fr); } button { grid-column: 2; justify-self: start; } }
`;
const Mark = styled.span`
  display: inline-flex; align-items: center; justify-content: center; margin-top: 2px;
  width: 18px; height: 18px; border: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.$present ? p.theme.colors.success : p.theme.colors.textMuted};
  font-size: .78rem; line-height: 1;
`;
const Action = styled.button`
  max-width: 100%; border: 1px solid ${p => p.theme.colors.border}; padding: 7px 10px;
  background: transparent; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark};
  font: inherit; font-size: .78rem; cursor: pointer; overflow-wrap: anywhere;
  &:hover { background: ${p => p.theme.colors.primarySoft}; }
  &:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
`;

const CATEGORIES = [
  ['needs_description', 'Kommunens behovsbeskrivelse'],
  ['data_processing_agreement', 'Databehandleraftale'],
  ['supplier_documentation', 'Leverandørmateriale'],
  ['security_documentation', 'Sikkerhedsdokumentation'],
];
const filesLabel = count => `${count} ${count === 1 ? 'fil' : 'filer'}`;

/** Presence of supplied case material is not a legal or professional approval. */
export default function MaterialCoverage({ sources = [], onSelectCategory }) {
  const headingId = useId();
  const items = Array.isArray(sources) ? sources.filter(source => source && typeof source === 'object') : [];
  const counts = new Map();
  const seen = new Set();
  items.forEach(source => {
    const identity = source.version_id || source.id;
    if (identity && seen.has(identity)) return;
    if (identity) seen.add(identity);
    counts.set(source.category, (counts.get(source.category) || 0) + 1);
  });
  const otherCount = counts.get('other') || 0;
  return <Panel aria-labelledby={headingId}>
    <h3 id={headingId}>Dokumentgrundlag</h3>
    <p>Se, hvad der er vedlagt sagen, og hvad der skal afklares.</p>
    <List aria-label="Materialetyper på denne sag">
      {CATEGORIES.map(([category, label]) => {
        const count = counts.get(category) || 0;
        return <li key={category}>
          <Mark $present={count > 0} aria-hidden="true">{count ? '✓' : '–'}</Mark>
          <div><strong>{label}</strong><small>{count ? `${filesLabel(count)} vedlagt` : 'Ikke vedlagt · behovet skal afklares'}</small></div>
          {onSelectCategory && <Action type="button" onClick={() => onSelectCategory(category)} aria-label={`Tilføj ${label.toLocaleLowerCase('da')}`}>Tilføj materiale</Action>}
        </li>;
      })}
      <li>
        <Mark aria-hidden="true">?</Mark>
        <div><strong>Kommunens behandlingsbeskrivelse</strong><small>Afklares i sagen: formål, registrerede og behandling af oplysninger.{otherCount > 0 ? ` ${filesLabel(otherCount)} er kategoriseret som øvrigt materiale; indholdet skal gennemgås.` : ''}</small></div>
        {onSelectCategory && <Action type="button" onClick={() => onSelectCategory('other')} aria-label="Tilføj materiale om kommunens behandling">Tilføj beskrivelse</Action>}
      </li>
    </List>
    <p>Vedlagt materiale er ikke det samme som fagligt godkendt dokumentation. Manglende materiale er et afklaringspunkt og afgør ikke i sig selv, om behandlingen er lovlig.</p>
  </Panel>;
}
