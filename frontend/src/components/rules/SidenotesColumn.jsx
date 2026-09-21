import React from 'react';
import styled from 'styled-components';

/**
 * SidenotesColumn — Northern Modern marginalia column.
 *
 * Renders an ordered list of lov-citater (legal citations) numbered with
 * superscript ¹²³ markers. Each sidenote contains:
 *   - the citat (italic Plex Serif pull-quote)
 *   - source attribution + EUR-Lex / retsinformation link
 *   - last verified date in monospace
 *
 * Designed to sit in a sticky right column next to a document of rules.
 * The footnote IDs (#sn1, #sn2, ...) are clickable from inline `.fn` refs
 * in the body text.
 *
 * Props:
 *   notes: Array<{ id, citat, lov, artikel, url, sidst_verificeret }>
 *   eyebrow?: string — column header label (default: "Lov-kilder · marginalia")
 *   sticky?: boolean — make the column sticky on scroll (default: true)
 */

const Aside = styled.aside`
  border-left: 1px solid ${(p) => p.theme.colors.line};
  padding: 0 0 2.5rem 2.25rem;
  font-family: ${(p) => p.theme.fonts.sans};
  align-self: start;
  ${(p) =>
    p.$sticky &&
    `
    position: sticky;
    top: 96px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
  `}

  @media (max-width: 980px) {
    border-left: none;
    border-top: 1px solid ${(p) => p.theme.colors.line};
    padding: 2rem 0 0;
    margin-top: 2rem;
    position: static;
    max-height: none;
  }

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb {
    background: ${(p) => p.theme.colors.line};
    border-radius: 2px;
  }
`;

const Eyebrow = styled.div`
  font-size: 0.69rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-bottom: 1.1rem;
  font-weight: 600;
`;

const Note = styled.div`
  margin-bottom: 1.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};

  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
`;

const Num = styled.div`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 0.875rem;
  color: ${(p) => p.theme.colors.primary};
  font-weight: 700;
  margin-bottom: 0.4rem;
  line-height: 1;
`;

const Citat = styled.p`
  font-family: ${(p) => p.theme.fonts.serif};
  font-size: 0.9rem;
  font-style: italic;
  color: ${(p) => p.theme.colors.ink};
  margin: 0 0 0.625rem;
  line-height: 1.6;
  border-left: 2px solid ${(p) => p.theme.colors.primarySoft};
  padding-left: 0.75rem;
`;

const Source = styled.div`
  font-size: 0.75rem;
  color: ${(p) => p.theme.colors.inkSoft};
  margin-bottom: 0.4rem;
  line-height: 1.45;

  a {
    color: ${(p) => p.theme.colors.primary};
    text-decoration: none;
    font-weight: 500;

    &:hover { text-decoration: underline; }
  }
`;

const Meta = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  color: ${(p) => p.theme.colors.inkSoft};
  letter-spacing: 0.04em;
`;

// Unicode superscript map for ¹²³⁴⁵⁶⁷⁸⁹⁰
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
export const toSuperscript = (n) => {
  if (n < 10) return SUPERSCRIPT[n];
  return String(n)
    .split('')
    .map((ch) => SUPERSCRIPT[parseInt(ch, 10)])
    .join('');
};

const formatVerifiedDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const SidenotesColumn = ({
  notes = [],
  eyebrow = 'Kilder og dokumentation',
  sticky = true,
}) => {
  if (!notes.length) return null;

  return (
    <Aside $sticky={sticky} aria-label="Kilder til vurderingen">
      <Eyebrow>{eyebrow}</Eyebrow>
      {notes.map((note, idx) => {
        const num = idx + 1;
        return (
          <Note key={note.id || num} id={`sn${num}`}>
            <Num>{toSuperscript(num)}</Num>
            {note.citat && <Citat>“{note.citat}”</Citat>}
            {(note.lov || note.artikel || note.url) && (
              <Source>
                {[note.lov, note.artikel].filter(Boolean).join(' · ')}
                {note.url && (
                  <>
                    {(note.lov || note.artikel) && ' · '}
                    <a href={note.url} target="_blank" rel="noreferrer noopener">
                      Åbn originalkilde ↗
                    </a>
                  </>
                )}
              </Source>
            )}
            {note.sidst_verificeret && (
              <Meta>Verificeret ved vurderingen · {formatVerifiedDate(note.sidst_verificeret)}</Meta>
            )}
          </Note>
        );
      })}
    </Aside>
  );
};

export default SidenotesColumn;
