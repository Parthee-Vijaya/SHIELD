import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import BRAND from '../config/brand';

const Footer = styled.footer`
  margin-top: auto;
  border-top: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
`;

const FooterInner = styled.div`
  width: min(100%, 1320px);
  padding-inline: 32px;
  min-height: 112px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr);
  align-items: center;
  gap: 32px;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.72rem;

  strong { color: ${p => p.theme.colors.text}; }

  nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 22px; }
  nav a { color: ${p => p.theme.colors.textMuted}; }
  nav a:hover { color: ${p => p.theme.colors.text}; }
  > span:last-child { text-align: right; }

  @media (max-width: 760px) {
    width: 100%;
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 24px 20px;
    nav { justify-content: flex-start; flex-wrap: wrap; }
    > span:last-child { text-align: left; }
  }
`;

const PortalFooter = () => (
  <Footer>
    <FooterInner>
      <span><strong>{BRAND.name}</strong> · {BRAND.descriptor}</span>
      <nav aria-label="Sidefod">
        <Link to="/om-loesningen">Om løsningen</Link>
        <Link to="/privacy">Persondatapolitik</Link>
        <Link to="/ressourcer">Vejledning</Link>
        <Link to="/drift">Driftsstatus</Link>
      </nav>
      <span>Kalundborg Kommune · Digitalisering & IT</span>
    </FooterInner>
  </Footer>
);

export default PortalFooter;
