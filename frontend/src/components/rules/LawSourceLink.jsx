import React from 'react';
import styled from 'styled-components';
import { FaExternalLinkAlt } from 'react-icons/fa';

/**
 * LawSourceLink — renders a citation reference to the original law text.
 *
 * Designed to take a v3 rule_engine `kilde` object directly:
 *   {
 *     lov: "Forordning 2024/1689 (EU AI Act)",
 *     artikel: "Artikel 6, stk. 2 + Bilag III",
 *     url: "https://eur-lex.europa.eu/...",
 *     sidst_verificeret: "2026-05-07"
 *   }
 *
 * Usage:
 *   <LawSourceLink kilde={decision.kilde} />
 *   <LawSourceLink kilde={decision.kilde} compact />
 */

const Wrap = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: ${(p) => p.theme.fonts.main};
  font-size: ${(p) => (p.$compact ? '0.78rem' : '0.85rem')};
  color: ${(p) => p.theme.colors.textMuted};
`;

const SourceLink = styled.a`
  color: ${(p) => p.theme.colors.primary};
  text-decoration: none;
  border-bottom: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  transition: border-color ${(p) => p.theme.animations.transitionFast};

  &:hover {
    border-bottom-color: ${(p) => p.theme.colors.primary};
  }

  svg {
    font-size: 0.75em;
  }
`;

const Verified = styled.span`
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.gray[500]};
  font-style: italic;
`;

const formatDate = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (_e) {
    return iso;
  }
};

const LawSourceLink = ({ kilde, compact = false, className }) => {
  if (!kilde) return null;

  const { lov, artikel, url, sidst_verificeret } = kilde;
  const verifiedAt = formatDate(sidst_verificeret);

  return (
    <Wrap $compact={compact} className={className}>
      <SourceLink href={url} target="_blank" rel="noopener noreferrer">
        <span>{lov}</span>
        {artikel && <strong>{artikel}</strong>}
        <FaExternalLinkAlt />
      </SourceLink>
      {!compact && verifiedAt && (
        <Verified title="Dato hvor citatet sidst blev verificeret mod kilden">
          · sidst verificeret {verifiedAt}
        </Verified>
      )}
    </Wrap>
  );
};

export default LawSourceLink;
