import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { FaShieldAlt, FaTimes } from 'react-icons/fa';
import { useTutorial } from '../contexts/TutorialContext';

const STORAGE_KEY = 'shield_privacy_acknowledged_v1';
const LEGACY_STORAGE_KEYS = ['tyr_privacy_acknowledged_v1'];

const Banner = styled.div`
  position: fixed;
  bottom: 16px;
  right: 16px;
  max-width: 460px;
  background: ${(p) => p.theme.colors.card || '#fff'};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-left: 4px solid ${(p) => p.theme.colors.bronze};
  border-radius: 8px;
  padding: 1rem 1.25rem;
  box-shadow: 0 8px 32px rgba(20, 24, 31, 0.12);
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.88rem;
  color: ${(p) => p.theme.colors.ink};
  line-height: 1.55;
  z-index: 4000;

  @media (max-width: 720px) {
    left: 16px;
    right: 16px;
    bottom: 12px;
    max-width: none;
  }
`;

const BannerHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: -0.01em;

  .icon {
    color: ${(p) => p.theme.colors.bronze};
    transform: translateY(2px);
  }
`;

const BannerActions = styled.div`
  margin-top: 0.85rem;
  display: flex;
  gap: 0.65rem;
  align-items: center;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  background: ${(p) => p.theme.colors.primary};
  color: #fff;
  border: none;
  padding: 0.5rem 0.95rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;

  &:hover { background: ${(p) => p.theme.colors.primaryDark || p.theme.colors.primary}; }
`;

const SecondaryLink = styled.a`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.primary};
  text-decoration: none;

  &:hover { text-decoration: underline; }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: ${(p) => p.theme.colors.inkFaded};
  cursor: pointer;
  padding: 4px;
  font-size: 0.8rem;

  &:hover { color: ${(p) => p.theme.colors.ink}; }
`;

const PrivacyNotice = () => {
  const { isOpen: tutorialOpen, loading: tutorialLoading } = useTutorial();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const ack = window.localStorage.getItem(STORAGE_KEY)
        || LEGACY_STORAGE_KEYS.some((key) => window.localStorage.getItem(key));
      if (!ack) setVisible(true);
    } catch {
      // localStorage unavailable — still show banner; just won't persist dismiss
      setVisible(true);
    }
  }, []);

  const acknowledge = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible || tutorialOpen || tutorialLoading) return null;

  return (
    <Banner role="region" aria-label="Persondata-vejledning">
      <CloseButton onClick={acknowledge} aria-label="Luk meddelelse">
        <FaTimes />
      </CloseButton>
      <BannerHeader>
        <FaShieldAlt className="icon" aria-hidden="true" />
        S.H.I.E.L.D. og persondata
      </BannerHeader>
      <div>
        Indtast <b>ikke</b> borger-data (navn, CPR, mail, telefonnummer) i fritekst eller
        upload — S.H.I.E.L.D. vurderer systemer og behandlinger, ikke konkrete personers sager.
        Du har ansvar for ikke at gemme konkrete personoplysninger i platformen.
      </div>
      <BannerActions>
        <PrimaryButton type="button" onClick={acknowledge}>
          Forstået
        </PrimaryButton>
        <SecondaryLink
          href="/privacy"
          onClick={(e) => {
            // Open in new tab so the user doesn't lose context
            e.preventDefault();
            window.open('/privacy', '_blank', 'noopener,noreferrer');
          }}
        >
          Læs persondatapolitik →
        </SecondaryLink>
      </BannerActions>
    </Banner>
  );
};

export default PrivacyNotice;
