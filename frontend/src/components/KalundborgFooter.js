import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { FaMapMarkerAlt, FaEnvelope } from 'react-icons/fa';

const FooterContainer = styled.footer`
  background: linear-gradient(135deg, #C94416 0%, #b23912 100%);
  color: #ffffff;
  padding: 3rem 2rem 2rem;
  margin-top: auto;
  transition: ${props => props.theme.animations.transition};
`;

const FooterContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3rem;

  @media (max-width: 968px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 2rem;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 2.5rem;
  }
`;

const FooterColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ColumnHeading = styled.h3`
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 0.5rem;
  letter-spacing: 0.02em;
`;

const LogoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    width: 40px;
    height: 40px;
    fill: #ffffff;
  }
`;

const LogoText = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.2;

  span:first-child {
    font-size: 1.25rem;
    font-weight: 700;
    color: #ffffff;
  }

  span:last-child {
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
  }
`;

const AddressSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const AddressItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;

  svg {
    margin-top: 0.15rem;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.75);
  }
`;

const ContactLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #ffffff;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: ${props => props.theme.animations.transitionFast};
  padding: 0.5rem 0;
  margin-top: 0.5rem;

  &:hover {
    color: rgba(255, 255, 255, 0.85);
    text-decoration: underline;
  }

  svg {
    color: rgba(255, 255, 255, 0.85);
  }
`;

const FooterLinksList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FooterLinkItem = styled.li`
  margin: 0;
`;

const FooterLink = styled(Link)`
  display: inline-block;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.9rem;
  text-decoration: none;
  transition: ${props => props.theme.animations.transitionFast};
  padding: 0.35rem 0;

  &:hover {
    color: #ffffff;
    text-decoration: underline;
    transform: translateX(2px);
  }
`;

const ExternalFooterLink = styled.a`
  display: inline-block;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.9rem;
  text-decoration: none;
  transition: ${props => props.theme.animations.transitionFast};
  padding: 0.35rem 0;

  &:hover {
    color: #ffffff;
    text-decoration: underline;
    transform: translateX(2px);
  }
`;

const AboutText = styled.p`
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.6;
  margin-bottom: 1rem;
`;

const VersionInfo = styled.div`
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
  margin-top: 0.5rem;
`;

const PoweredBy = styled.div`
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 0.75rem;
  font-style: italic;
`;

const FooterBottom = styled.div`
  max-width: 1200px;
  margin: 2.5rem auto 0;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;

  @media (max-width: 640px) {
    flex-direction: column;
    text-align: center;
  }
`;

const Copyright = styled.p`
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
  margin: 0;
`;

const FooterBottomLinks = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    justify-content: center;
  }
`;

const FooterBottomLink = styled(Link)`
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  transition: ${props => props.theme.animations.transitionFast};

  &:hover {
    color: #ffffff;
    text-decoration: underline;
  }
`;

// Simple Kalundborg Kommune logo icon (SVG)
const KalundborgIcon = () => (
  <svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <circle cx="25" cy="25" r="22" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M25 10 L25 40 M15 20 L25 10 L35 20" stroke="currentColor" strokeWidth="2" fill="none"/>
    <text x="25" y="35" fontSize="14" fill="currentColor" textAnchor="middle" fontWeight="bold">K</text>
  </svg>
);

const KalundborgFooter = () => {
  const currentYear = new Date().getFullYear();

  return (
    <FooterContainer>
      <FooterContent>
        {/* Left Column - Logo & Contact */}
        <FooterColumn>
          <LogoSection>
            <Logo>
              <KalundborgIcon />
              <LogoText>
                <span>Kalundborg</span>
                <span>Kommune</span>
              </LogoText>
            </Logo>

            <AddressSection>
              <AddressItem>
                <FaMapMarkerAlt size={16} />
                <span>Holbækvej 141B<br />4400 Kalundborg</span>
              </AddressItem>

              <ContactLink href="https://www.kalundborg.dk/kontakt" target="_blank" rel="noopener noreferrer">
                <FaEnvelope size={14} />
                Kontakt Kalundborg Kommune
              </ContactLink>
            </AddressSection>
          </LogoSection>
        </FooterColumn>

        {/* Middle Column - Links */}
        <FooterColumn>
          <ColumnHeading>Links</ColumnHeading>
          <FooterLinksList>
            <FooterLinkItem>
              <ExternalFooterLink
                href="https://www.kalundborg.dk/datasikkerhed"
                target="_blank"
                rel="noopener noreferrer"
              >
                Datasikkerhed
              </ExternalFooterLink>
            </FooterLinkItem>
            <FooterLinkItem>
              <ExternalFooterLink
                href="https://www.kalundborg.dk/cookies"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cookies
              </ExternalFooterLink>
            </FooterLinkItem>
            <FooterLinkItem>
              <ExternalFooterLink
                href="https://www.kalundborg.dk/tilgaengelighedserklaering"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tilgængelighedserklæring
              </ExternalFooterLink>
            </FooterLinkItem>
            <FooterLinkItem>
              <FooterLink to="/privacy">
                Privacy policy
              </FooterLink>
            </FooterLinkItem>
            <FooterLinkItem>
              <FooterLink to="/indstillinger">
                Indstillinger
              </FooterLink>
            </FooterLinkItem>
          </FooterLinksList>
        </FooterColumn>

        {/* Right Column - About Platform */}
        <FooterColumn>
          <ColumnHeading>Om platformen</ColumnHeading>
          <AboutText>
            AI Compliance Platform til vurdering af EU AI Act, GDPR og dansk lovgivning.
            Værktøj til at sikre ansvarlig og lovlig brug af kunstig intelligens.
          </AboutText>
          <VersionInfo>
            Version 1.0.0 Beta
          </VersionInfo>
          <PoweredBy>
            Leveret af S.H.I.E.L.D.
          </PoweredBy>
        </FooterColumn>
      </FooterContent>

      <FooterBottom>
        <Copyright>
          © {currentYear} Kalundborg Kommune. Alle rettigheder forbeholdt.
        </Copyright>
        <FooterBottomLinks>
          <FooterBottomLink to="/dashboard">
            Dashboard
          </FooterBottomLink>
          <FooterBottomLink to="/videnbase">
            Videnbase
          </FooterBottomLink>
          <FooterBottomLink to="/ressourcer">
            Ressourcer
          </FooterBottomLink>
        </FooterBottomLinks>
      </FooterBottom>
    </FooterContainer>
  );
};

export default KalundborgFooter;
