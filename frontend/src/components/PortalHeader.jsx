import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import styled from 'styled-components';

import BRAND from '../config/brand';
import { PRIMARY_NAVIGATION, TOOL_NAVIGATION_GROUPS } from '../config/navigation';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';

const Header = styled.header`
  position: sticky; top: 0; z-index: 800;
  border-bottom: 1px solid ${p => p.theme.colors.borderSoft};
  background: ${p => p.theme.colors.surface};
`;

const SkipLink = styled.a`
  position: fixed; top: 8px; left: 8px; z-index: 1600; padding: 10px 14px;
  background: ${p => p.theme.colors.text}; color: ${p => p.theme.colors.background};
  transform: translateY(-160%);
  &:focus { transform: translateY(0); }
`;

const HeaderInner = styled.div`
  width: min(100%, 1320px); padding-inline: 32px; min-height: 78px;
  margin: 0 auto; display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: stretch; gap: clamp(18px, 2.2vw, 34px);
  @media (max-width: 1200px) { width: 100%; grid-template-columns: minmax(0, 1fr) auto; }
  @media (max-width: 640px) { padding-inline: 20px; min-height: 72px; gap: 12px; }
  @media (max-width: 400px) { padding-inline: 14px; gap: 8px; }
`;

const BrandCluster = styled(Link)`
  display: inline-flex; align-items: center; justify-self: start; gap: 18px;
  min-width: 0; padding: 16px 0; color: ${p => p.theme.colors.text};
  text-decoration: none;
  &:hover { color: ${p => p.theme.colors.text}; }
  @media (max-width: 640px) { gap: 10px; }
`;

const MunicipalityLogo = styled.img`
  display: block; width: 122px; height: auto; flex-shrink: 0;
  @media (max-width: 640px) { width: 84px; }
  @media (max-width: 400px) { width: 72px; }
`;

const BrandIdentity = styled.span`
  display: flex; flex-direction: column; justify-content: center; gap: 5px;
  min-height: 38px; padding-left: 18px; border-left: 1px solid ${p => p.theme.colors.border};
  @media (max-width: 640px) { padding-left: 10px; min-height: 34px; gap: 4px; }
`;

const BrandName = styled.span`
  color: ${p => p.theme.colors.text};
  font: 600 1.02rem/1.1 ${p => p.theme.fonts.display}; letter-spacing: .08em;
  @media (max-width: 640px) { font-size: .86rem; letter-spacing: .05em; }
`;

const VersionLabel = styled.span`
  color: ${p => p.theme.colors.textMuted};
  font: 500 0.68rem/1.2 ${p => p.theme.fonts.mono}; white-space: nowrap;
  @media (max-width: 640px) { font-size: .62rem; }
`;

const DesktopNav = styled.nav`
  min-width: 0; display: flex; align-items: stretch; justify-content: center;
  @media (max-width: 1200px) { display: none; }
`;

const NavItem = styled(NavLink)`
  position: relative; display: inline-flex; align-items: center;
  padding: 0 clamp(12px, 1.4vw, 22px);
  color: ${p => p.theme.colors.textMuted}; font-size: .875rem; font-weight: 550; white-space: nowrap;
  &::after { content: ''; position: absolute; right: 12px; bottom: -1px; left: 12px; height: 3px; background: transparent; }
  &:hover, &.active { color: ${p => p.theme.colors.text}; }
  &.active::after { background: ${p => p.theme.colors.primary}; }
`;

const HeaderActions = styled.div`
  display: flex; align-items: center; gap: 8px; min-width: 0;
  @media (max-width: 400px) { gap: 4px; }
`;

const UtilityButton = styled.button`
  min-width: 44px; min-height: 44px; display: inline-flex; align-items: center;
  justify-content: center; gap: 8px; padding: 6px 11px;
  border: 1px solid ${p => p.theme.colors.borderSoft}; border-radius: ${p => p.theme.borderRadius};
  color: ${p => p.theme.colors.text}; background: transparent;
  font-size: .82rem; font-weight: 600;
  &:hover, &[aria-expanded='true'] { background: ${p => p.theme.colors.surfaceAlt}; }
  &:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
`;

const ProfileMenu = styled.div`
  position: static;
`;

const ProfileButton = styled(UtilityButton)`
  border-color: transparent; gap: 9px; padding: 5px 9px;
  > strong { max-width: 140px; overflow: hidden; text-overflow: ellipsis; font-weight: 600; white-space: nowrap; }
  .chevron { color: ${p => p.theme.colors.textMuted}; font-size: .7rem; }
  @media (max-width: 640px) {
    padding-inline: 6px; gap: 6px;
    > strong { max-width: 90px; }
  }
  @media (max-width: 520px) { > .avatar { display: none; } }
  @media (max-width: 400px) { > strong { max-width: 66px; } }
`;

const Avatar = styled.span`
  width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center;
  background: ${p => p.theme.colors.primarySoft};
  color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark};
  font: 650 .72rem/1 ${p => p.theme.fonts.mono};
`;

const ProfilePanel = styled.div`
  position: absolute; top: calc(100% + 8px); right: max(20px, calc((100vw - 1256px) / 2));
  width: min(820px, calc(100vw - 40px)); box-sizing: border-box;
  max-height: calc(100dvh - 98px); overflow-y: auto; overscroll-behavior: contain;
  padding: 22px; border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => p.theme.borderRadiusLarge}; background: ${p => p.theme.colors.surface};
  box-shadow: ${p => p.theme.shadows.lg};
  @media (max-width: 640px) { padding: 16px; }
  @media (max-width: 400px) { right: 14px; width: calc(100vw - 28px); }
`;

const ProfileHeading = styled.div`
  display: flex; align-items: center; gap: 12px; margin-bottom: 18px;
  h2 { margin: 0; font-size: 1rem; line-height: 1.35; font-weight: 600; overflow-wrap: anywhere; }
  p { margin: 4px 0 0; font-size: .76rem; line-height: 1.5; color: ${p => p.theme.colors.textMuted}; }
`;

const QuickActions = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px;
  padding-bottom: 18px; border-bottom: 1px solid ${p => p.theme.colors.borderSoft};
  button { justify-content: space-between; text-align: left; font-size: .82rem; font-weight: 550; }
  kbd { font: 500 .72rem ${p => p.theme.fonts.mono}; color: ${p => p.theme.colors.textMuted}; white-space: nowrap; }
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;

const ToolGroups = styled.div`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 18px 0;
  @media (max-width: 700px) { grid-template-columns: 1fr; gap: 12px; }
`;

const Group = styled.section`
  min-width: 0;
  h3 { margin: 6px 10px 8px; color: ${p => p.theme.colors.textMuted}; font-size: .69rem; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
`;

const ToolLink = styled(NavLink)`
  display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
  min-height: 44px; border-radius: ${p => p.theme.borderRadius}; padding: 10px;
  overflow-wrap: anywhere; color: ${p => p.theme.colors.text}; font-size: .82rem; font-weight: 560;
  small { margin-top: 4px; font-size: .73rem; font-weight: 400; line-height: 1.45; color: ${p => p.theme.colors.textMuted}; }
  &:hover, &.active { background: ${p => p.theme.colors.surfaceAlt}; color: ${p => p.theme.colors.text}; }
  &:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 2px; }
`;

const SessionActions = styled.div`
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px;
  border-top: 1px solid ${p => p.theme.colors.borderSoft}; padding-top: 16px;
  button { font-weight: 550; }
`;

const MenuButton = styled(UtilityButton)`
  display: none; font-size: 1.15rem; padding: 0; width: 44px;
  @media (max-width: 1200px) { display: inline-flex; }
`;

const MobilePanel = styled.nav`
  display: none;
  @media (max-width: 1200px) {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
    max-height: calc(100dvh - 100px); overflow-y: auto;
    padding: 12px 32px; border-top: 1px solid ${p => p.theme.colors.borderSoft};
    background: ${p => p.theme.colors.surface};
  }
  @media (max-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 12px 20px; }
  @media (max-width: 400px) { padding-inline: 14px; }
`;

const PortalHeader = ({ onOpenCommandPalette }) => {
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const profileRef = useRef(null);
  const profileButtonRef = useRef(null);
  const firstActionRef = useRef(null);
  const focusFirstActionRef = useRef(false);
  const mobileButtonRef = useRef(null);
  const mobilePanelRef = useRef(null);
  const { preferences, updatePreference } = useUserPreferences();
  const { user, isAuthenticated, isDevelopmentIdentity, login, logout } = useAuth();
  const { restart, canStart, saving } = useTutorial();
  const isDark = preferences?.theme === 'dark';
  const name = user?.name?.trim() || 'Din profil';
  const firstName = name.split(/\s+/)[0];
  const initials = user?.name ? name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() : 'KB';
  const sessionLabel = isAuthenticated ? (isDevelopmentIdentity ? 'Lokal session' : 'Logget ind') : 'Ikke logget ind';
  const sessionAction = isAuthenticated ? (isDevelopmentIdentity ? 'Afslut session' : 'Log ud') : 'Log ind';

  const closeProfile = (restoreFocus = false) => {
    setProfileOpen(false);
    if (restoreFocus) profileButtonRef.current?.focus();
  };

  useEffect(() => { setMobileOpen(false); setProfileOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (profileOpen && focusFirstActionRef.current) {
      firstActionRef.current?.focus();
      focusFirstActionRef.current = false;
    }
  }, [profileOpen]);
  useEffect(() => {
    const dismiss = event => {
      if (event.type === 'keydown' && event.key === 'Escape') {
        if (profileOpen) { setProfileOpen(false); profileButtonRef.current?.focus(); }
        if (mobileOpen) { setMobileOpen(false); mobileButtonRef.current?.focus(); }
      } else if (event.type === 'keydown' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (profileOpen) { setProfileOpen(false); profileButtonRef.current?.focus(); }
      } else if (event.type === 'pointerdown') {
        if (profileOpen && !profileRef.current?.contains(event.target)) setProfileOpen(false);
        if (mobileOpen && !mobileButtonRef.current?.contains(event.target) && !mobilePanelRef.current?.contains(event.target)) setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); };
  }, [profileOpen, mobileOpen]);

  return (
    <Header>
      <SkipLink href="#main-content">Gå til hovedindhold</SkipLink>
      <HeaderInner>
        <BrandCluster to="/" aria-label={`${BRAND.organisation} – ${BRAND.shortName} ${BRAND.version} – gå til startsiden`}>
          <MunicipalityLogo src={BRAND.organisationLogoPath} width="176" height="58" alt="" />
          <BrandIdentity><BrandName>{BRAND.shortName}</BrandName><VersionLabel title={`Løsningens version: ${BRAND.version}`}>{BRAND.version}</VersionLabel></BrandIdentity>
        </BrandCluster>
        <DesktopNav aria-label="Primær navigation">
          {PRIMARY_NAVIGATION.map(item => <NavItem key={item.id} to={item.path} end={item.path === '/'}>{item.label}</NavItem>)}
        </DesktopNav>
        <HeaderActions>
          <ProfileMenu ref={profileRef} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setProfileOpen(false); }}>
            <ProfileButton
              ref={profileButtonRef} type="button" aria-expanded={profileOpen} aria-controls="portal-profile-menu"
              aria-label={`${profileOpen ? 'Luk' : 'Åbn'} profilmenu for ${name}`}
              onClick={() => { setProfileOpen(open => !open); setMobileOpen(false); }}
              onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); focusFirstActionRef.current = true; setMobileOpen(false); if (profileOpen) { firstActionRef.current?.focus(); focusFirstActionRef.current = false; } else setProfileOpen(true); } }}
            >
              <Avatar className="avatar" aria-hidden="true">{initials}</Avatar><strong>{firstName}</strong><span className="chevron" aria-hidden="true">{profileOpen ? '▴' : '▾'}</span>
            </ProfileButton>
            {profileOpen && <ProfilePanel id="portal-profile-menu" role="region" aria-label="Profil og værktøjer">
              <ProfileHeading><Avatar aria-hidden="true">{initials}</Avatar><div><h2>{name}</h2><p>{sessionLabel}{isAuthenticated && !isDevelopmentIdentity ? ` · ${BRAND.organisation}` : ''}</p></div></ProfileHeading>
              <QuickActions>
                <UtilityButton ref={firstActionRef} type="button" onClick={() => { closeProfile(true); onOpenCommandPalette?.(); }} aria-label="Åbn hurtig navigation"><span>Søg i SHIELD</span><kbd aria-hidden="true">⌘ K</kbd></UtilityButton>
                <UtilityButton type="button" onClick={() => updatePreference('theme', isDark ? 'light' : 'dark')} aria-label={isDark ? 'Skift til lyst tema' : 'Skift til mørkt tema'}><span>{isDark ? 'Skift til lyst tema' : 'Skift til mørkt tema'}</span><span aria-hidden="true">{isDark ? '☀' : '◐'}</span></UtilityButton>
              </QuickActions>
              <ToolGroups>{TOOL_NAVIGATION_GROUPS.map(group => <Group key={group.id} aria-label={group.label}><h3>{group.label}</h3>{group.items.map(item => <ToolLink key={item.id} to={item.path} onClick={() => closeProfile()}><span>{item.label}</span><small>{item.description}</small></ToolLink>)}</Group>)}</ToolGroups>
              <SessionActions>
                {canStart && <UtilityButton type="button" disabled={saving} onClick={() => { closeProfile(true); restart(); }}>{saving ? 'Åbner guide…' : 'Start introduktionsguide'}</UtilityButton>}
                <UtilityButton type="button" onClick={() => { closeProfile(true); (isAuthenticated ? logout : login)(); }}>{sessionAction}<span aria-hidden="true">↗</span></UtilityButton>
              </SessionActions>
            </ProfilePanel>}
          </ProfileMenu>
          <MenuButton ref={mobileButtonRef} type="button" onClick={() => { setMobileOpen(open => !open); setProfileOpen(false); }} aria-expanded={mobileOpen} aria-controls="portal-mobile-navigation" aria-label={mobileOpen ? 'Luk navigation' : 'Åbn navigation'}>{mobileOpen ? '×' : '☰'}</MenuButton>
        </HeaderActions>
      </HeaderInner>
      {mobileOpen && <MobilePanel ref={mobilePanelRef} id="portal-mobile-navigation" aria-label="Mobilnavigation">{PRIMARY_NAVIGATION.map(item => <ToolLink key={item.id} to={item.path} end={item.path === '/'}>{item.label}</ToolLink>)}</MobilePanel>}
    </Header>
  );
};

export default PortalHeader;
