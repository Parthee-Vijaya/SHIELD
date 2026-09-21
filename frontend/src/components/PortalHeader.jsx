import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import styled from 'styled-components';

import BRAND from '../config/brand';
import { PRIMARY_NAVIGATION, TOOL_NAVIGATION_GROUPS } from '../config/navigation';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';

const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 800;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.mode === 'dark' ? 'rgba(29, 29, 27, 0.96)' : 'rgba(255, 254, 251, 0.97)'};
  backdrop-filter: blur(16px);
`;

const SkipLink = styled.a`
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 1600;
  padding: 10px 14px;
  background: ${p => p.theme.colors.text};
  color: ${p => p.theme.colors.background};
  transform: translateY(-160%);

  &:focus { transform: translateY(0); }
`;

const HeaderInner = styled.div`
  width: min(100% - 40px, 1360px);
  min-height: 78px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: stretch;
  gap: clamp(20px, 3vw, 52px);

  @media (max-width: 1100px) {
    width: min(100% - 28px, 1360px);
    grid-template-columns: minmax(0, 1fr) auto;
  }
`;

const BrandCluster = styled(Link)`
  width: 150px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  padding: 6px 0;
  color: ${p => p.theme.colors.text};

  &:hover { color: ${p => p.theme.colors.text}; }

  @media (max-width: 620px) { width: 140px; }
`;

const MunicipalityLogo = styled.img`
  display: block;
  width: 100%;
  height: auto;
`;

const VersionLabel = styled.span`
  color: ${p => p.theme.colors.textMuted};
  font: 500 0.68rem/1.2 ${p => p.theme.fonts.mono};
  white-space: nowrap;
`;

const DesktopNav = styled.nav`
  min-width: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;

  @media (max-width: 1100px) { display: none; }
`;

const NavItem = styled(NavLink)`
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 0 clamp(12px, 1.4vw, 22px);
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.83rem;
  font-weight: 620;
  white-space: nowrap;

  &::after {
    content: '';
    position: absolute;
    right: 12px;
    bottom: -1px;
    left: 12px;
    height: 3px;
    background: transparent;
  }

  &:hover, &.active { color: ${p => p.theme.colors.text}; }
  &.active::after { background: ${p => p.theme.colors.primary}; }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const UtilityButton = styled.button`
  min-width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.theme.colors.text};
  background: transparent;
  font-size: 0.78rem;
  font-weight: 620;

  &:hover { background: ${p => p.theme.colors.surfaceAlt}; }

  @media (max-width: 620px) {
    &.command { display: none; }
  }
`;

const Profile = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  margin-left: 4px;
`;

const Avatar = styled.span`
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  background: ${p => p.theme.colors.primarySoft};
  color: ${p => p.theme.colors.primary};
  font: 700 0.72rem/1 ${p => p.theme.fonts.mono};
`;

const ProfileText = styled.span`
  display: flex;
  flex-direction: column;
  line-height: 1.15;

  strong { font-size: 0.72rem; color: ${p => p.theme.colors.text}; }
  small { margin-top: 3px; font-size: 0.62rem; color: ${p => p.theme.colors.textMuted}; }

  @media (max-width: 760px) { display: none; }
`;

const MenuButton = styled(UtilityButton)`
  display: none;
  font-size: 1.15rem;

  @media (max-width: 1100px) { display: inline-flex; }
`;

const More = styled.details`
  position: relative;

  summary {
    min-width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    border: 1px solid ${p => p.theme.colors.border};
    color: ${p => p.theme.colors.text};
    font-size: 0.78rem;
    font-weight: 620;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker { display: none; }
  summary:hover { background: ${p => p.theme.colors.surfaceAlt}; }

  @media (max-width: 1100px) { display: none; }
`;

const MorePanel = styled.div`
  position: fixed;
  top: 78px;
  right: max(20px, calc((100vw - 1360px) / 2));
  width: min(900px, calc(100vw - 40px));
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  box-sizing: border-box;
  max-height: calc(100dvh - 90px);
  overflow-y: auto;
  padding: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  box-shadow: ${p => p.theme.shadows.lg};
`;

const ToolLink = styled(NavLink)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 42px;
  padding: 10px 11px;
  overflow-wrap: anywhere;
  small { margin-top: 4px; font-size: 0.73rem; font-weight: 400; line-height: 1.45; color: ${p => p.theme.colors.textMuted}; }
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.82rem;
  font-weight: 560;

  &:hover, &.active {
    background: ${p => p.theme.colors.surfaceAlt};
    color: ${p => p.theme.colors.text};
  }
`;

const GuideButton = styled.button`
  display: block; width: 100%; min-height: 42px; padding: 8px 11px;
  border-top: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.theme.colors.text}; text-align: left;
  font-size: 0.82rem; font-weight: 620;
  &:hover { background: ${p => p.theme.colors.surfaceAlt}; }
`;

const MobilePanel = styled.nav`
  display: none;

  @media (max-width: 1100px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    max-height: calc(100vh - 78px);
    overflow-y: auto;
    padding: 12px max(14px, calc((100vw - 1360px) / 2));
    border-top: 1px solid ${p => p.theme.colors.border};
    background: ${p => p.theme.colors.surface};
  }

  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

const MobileGroup = styled.div`
  padding: 8px;

  h2 {
    margin: 6px 11px 8px;
    color: ${p => p.theme.colors.primary};
    font: 650 0.65rem/1.2 ${p => p.theme.fonts.mono};
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
`;

const PortalHeader = ({ onOpenCommandPalette }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef(null);
  const mobileButtonRef = useRef(null);
  const { preferences, updatePreference } = useUserPreferences();
  const { user, isAuthenticated, isDevelopmentIdentity, login, logout } = useAuth();
  const { restart, canStart, saving } = useTutorial();
  const isDark = preferences?.theme === 'dark';

  useEffect(() => { setMobileOpen(false); if (moreRef.current) moreRef.current.open = false; }, [location.pathname, location.search]);
  useEffect(() => {
    const dismiss = event => {
      const menu = moreRef.current;
      if (event.type === 'keydown' && event.key === 'Escape') {
        if (menu?.open) { menu.open = false; menu.querySelector('summary')?.focus(); }
        if (mobileButtonRef.current?.getAttribute("aria-expanded") === "true") mobileButtonRef.current.focus();
        setMobileOpen(false);
      } else if (event.type === 'pointerdown' && menu?.open && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); };
  }, []);

  return (
    <Header>
      <SkipLink href="#main-content">Gå til hovedindhold</SkipLink>
      <HeaderInner>
        <BrandCluster to="/" aria-label={`Kalundborg Kommune – ${BRAND.version} – gå til startsiden`}>
          <MunicipalityLogo
            src={BRAND.organisationLogoPath}
            width="176"
            height="58"
            alt=""
          />
          <VersionLabel title={`Løsningens version: ${BRAND.version}`}>{BRAND.version}</VersionLabel>
        </BrandCluster>

        <DesktopNav aria-label="Primær navigation">
          {PRIMARY_NAVIGATION.map(item => (
            <NavItem key={item.id} to={item.path} end={item.path === '/'}>{item.label}</NavItem>
          ))}
        </DesktopNav>

        <HeaderActions>
          <UtilityButton className="command" type="button" onClick={onOpenCommandPalette} aria-label="Åbn hurtig navigation">
            <span>⌘</span><span>K</span>
          </UtilityButton>
          <UtilityButton type="button" onClick={() => updatePreference('theme', isDark ? 'light' : 'dark')} aria-label={isDark ? 'Skift til lyst tema' : 'Skift til mørkt tema'}>
            {isDark ? '☀' : '◐'}
          </UtilityButton>
          <More ref={moreRef}>
            <summary>Flere</summary>
            <MorePanel>
              {TOOL_NAVIGATION_GROUPS.map(group => <MobileGroup as="section" key={group.id} aria-label={group.label}><h2>{group.label}</h2>{group.items.map(item => <ToolLink key={item.id} to={item.path} onClick={() => { if (moreRef.current) moreRef.current.open = false; setMobileOpen(false); }}><span>{item.label}</span><small>{item.description}</small></ToolLink>)}</MobileGroup>)}
              {canStart && <GuideButton style={{gridColumn:"1 / -1"}} type="button" disabled={saving} onClick={event => { const menu = event.currentTarget.closest('details'); menu?.removeAttribute('open'); menu?.querySelector('summary')?.focus(); restart(); }}>Start introduktionsguide</GuideButton>}
            </MorePanel>
          </More>
          <Profile aria-label={`Logget ind som ${user?.name || 'ingen bruger'}`}>
            <Avatar>{user?.name ? user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() : 'KB'}</Avatar>
            <ProfileText>
              <strong>{user?.name || 'Kommunal portal'}</strong>
              <small>{isDevelopmentIdentity ? 'Digitalisering & IT' : 'Kalundborg Kommune'}</small>
            </ProfileText>
          </Profile>
          {!isDevelopmentIdentity && (
            <UtilityButton type="button" onClick={isAuthenticated ? logout : login}>
              {isAuthenticated ? 'Log ud' : 'Log ind'}
            </UtilityButton>
          )}
          <MenuButton ref={mobileButtonRef} type="button" onClick={() => setMobileOpen(open => !open)} aria-expanded={mobileOpen} aria-controls="portal-mobile-navigation" aria-label={mobileOpen ? 'Luk navigation' : 'Åbn navigation'}>
            {mobileOpen ? '×' : '☰'}
          </MenuButton>
        </HeaderActions>
      </HeaderInner>

      {mobileOpen ? (
        <MobilePanel id="portal-mobile-navigation" aria-label="Mobilnavigation">
          <MobileGroup>
            <h2>Arbejdsgang</h2>
            {PRIMARY_NAVIGATION.map(item => <ToolLink key={item.id} to={item.path} end={item.path === '/'}>{item.label}</ToolLink>)}
          </MobileGroup>
          {TOOL_NAVIGATION_GROUPS.map(group => <MobileGroup as="section" key={group.id} aria-label={group.label}>
            <h2>{group.label}</h2>
            {group.items.map(item => <ToolLink key={item.id} to={item.path} onClick={() => { if (moreRef.current) moreRef.current.open = false; setMobileOpen(false); }}><span>{item.label}</span><small>{item.description}</small></ToolLink>)}
          </MobileGroup>)}
          {canStart && <GuideButton type="button" disabled={saving} onClick={() => { setMobileOpen(false); restart(); }}>Start introduktionsguide</GuideButton>}
        </MobilePanel>
      ) : null}
    </Header>
  );
};

export default PortalHeader;
