import React from 'react';
import styled from 'styled-components';
import { pageLayout, pageTitleStyle, sectionTitleStyle, controlStyle } from '../../theme/layout';

/** Shared SHIELD page layout and typography. See theme/layout.js and DESIGN.md. */

export const PageShell = styled.div`
  ${pageLayout}
`;

export const PageHeaderWrap = styled.header`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.borderSoft};
  margin-bottom: 2rem;
`;

export const Eyebrow = styled.span`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.primary};
`;

export const PageTitle = styled.h1`
  ${pageTitleStyle}
`;

export const Lede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  line-height: 1.55;
  margin: 0;
  max-width: 720px;
  color: ${(p) => p.theme.colors.textMuted};
  font-style: normal;
`;

const HeaderActionsBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 4px;
`;

/**
 * <PageHeader eyebrow="…" title="…" lede="…" actions={<>…</>} />
 * Lede + actions er valgfri.
 */
export const PageHeader = ({ eyebrow, title, lede, actions, children }) => (
  <PageHeaderWrap>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    {title && <PageTitle>{title}</PageTitle>}
    {lede && <Lede>{lede}</Lede>}
    {actions && <HeaderActionsBar>{actions}</HeaderActionsBar>}
    {children}
  </PageHeaderWrap>
);

// ---- Reusable atoms for consistent chrome ------------------------------

export const SectionTitle = styled.h2`
  ${sectionTitleStyle}
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem 0;
  color: ${(p) => p.theme.colors.text};
`;

export const SectionSubtitle = styled.h3`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: ${(p) => p.theme.colors.text};
`;

/** Outline pill — bruges til filter-knapper/category-chips */
export const OutlinePill = styled.button`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 6px 14px;
  border-radius: 0;
  border: 1px solid
    ${(p) => (p.$active ? p.theme.colors.primary : p.theme.colors.border)};
  background: ${(p) =>
    p.$active ? p.theme.colors.primarySoft : 'transparent'};
  color: ${(p) =>
    p.$active ? p.theme.colors.primary : p.theme.colors.textMuted};
  cursor: pointer;
  transition: ${(p) => p.theme.animations.transitionFast};
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
    color: ${(p) => p.theme.colors.primary};
  }

  svg {
    font-size: 0.72rem;
  }
`;

/** Editorial "kort" — minimal shadow, hairline border, ren off-white surface */
export const EditorialCard = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1.5rem;
  transition: ${(p) => p.theme.animations.transition};

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
    box-shadow: ${(p) => p.theme.shadows.md};
  }
`;

/** Primary action — S.H.I.E.L.D. rød fyldt */
export const PrimaryButton = styled.button`
  ${controlStyle}
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  padding: 10px 20px;
  border-radius: 0;
  border: 1px solid ${(p) => p.theme.colors.primary};
  background: ${(p) => p.theme.colors.primary};
  color: ${(p) => p.theme.colors.white};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: ${(p) => p.theme.animations.transitionFast};

  &:hover:not(:disabled) {
    background: ${(p) => p.theme.colors.primaryDark};
    border-color: ${(p) => p.theme.colors.primaryDark};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

/** Ghost / secondary action — outline */
export const GhostButton = styled(PrimaryButton)`
  background: transparent;
  color: ${(p) => p.theme.colors.primary};

  &:hover:not(:disabled) {
    background: ${(p) => p.theme.colors.primarySoft};
    color: ${(p) => p.theme.colors.primary};
  }
`;

/** Editorial søge/input — tynd ramme på off-white baggrund */
export const SearchField = styled.div`
  position: relative;
  flex: 1;
  min-width: min(280px, 100%);

  svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: ${(p) => p.theme.colors.textMuted};
    font-size: 0.85rem;
  }

  input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    border-radius: ${(p) => p.theme.borderRadius};
    border: 1px solid ${(p) => p.theme.colors.border};
    background: ${(p) => p.theme.colors.surface};
    color: ${(p) => p.theme.colors.text};
    font-family: ${(p) => p.theme.fonts.body};
    font-size: 0.95rem;
    transition: ${(p) => p.theme.animations.transitionFast};

    &:focus {
      outline: none;
      border-color: ${(p) => p.theme.colors.primary};
      box-shadow: ${(p) => p.theme.shadows.focus};
    }

    &::placeholder {
      color: ${(p) => p.theme.colors.textFaded};
      font-style: normal;
    }
  }
`;
