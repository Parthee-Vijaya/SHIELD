import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import {
  FaHome,
  FaClipboardList,
  FaHistory,
  FaBook,
  FaGlobeEurope,
  FaBalanceScale,
  FaChevronLeft,
  FaChevronRight,
  FaExternalLinkAlt,
  FaCog,
  FaChevronDown,
  FaChevronUp,
  FaRobot,
  FaGavel,
  FaShieldAlt
} from 'react-icons/fa';
import BRAND from '../config/brand';

const NAVIGATION_ID = 'sidebar-navigation';

const SidebarContainer = styled.aside`
  width: ${props => props.collapsed ? '76px' : '256px'};
  background: ${props => props.theme.layout.sidebar.background};
  color: ${props => props.theme.layout.sidebar.text};
  border-right: 1px solid ${props => props.theme.layout.sidebar.border};
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  padding: 1.5rem 0 0;
  overflow-y: auto;
  transition: width ${props => props.theme.animations.transition};
  z-index: 1000;
  display: flex;
  flex-direction: column;
  font-family: ${props => props.theme.fonts.sans};

  /* Decorative rule along the right edge — subtle Northern Modern detail */
  background-image: linear-gradient(
    to right,
    transparent calc(100% - 1px),
    ${props => props.theme.layout.sidebar.border} calc(100% - 1px)
  );

  /* Soft scrollbar */
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.layout.sidebar.border};
    border-radius: 3px;
  }

  @media (max-width: 768px) {
    transform: translateX(${props => props.collapsed ? '-100%' : '0'});
    width: 256px;
    box-shadow: ${props => props.collapsed ? 'none' : '4px 0 24px rgba(20,24,31,0.12)'};
  }
`;

const SidebarHeader = styled.div`
  position: relative;
  padding: 0 1.25rem 1.4rem;
  margin-bottom: 1rem;

  /* Gradient hairline divider instead of plain border */
  &::after {
    content: '';
    position: absolute;
    left: 1.25rem;
    right: 1.25rem;
    bottom: 0;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      ${props => props.theme.layout.sidebar.border} 20%,
      ${props => props.theme.layout.sidebar.border} 80%,
      transparent
    );
  }
`;

const BrandContainer = styled.div`
  display: grid;
  grid-template-columns: ${props => props.$collapsed ? '1fr' : '38px minmax(0, 1fr)'};
  align-items: center;
  text-align: ${props => props.$collapsed ? 'center' : 'left'};
  gap: ${props => props.$collapsed ? '0.4rem' : '0.35rem'};
  padding: ${props => props.$collapsed ? '0.5rem 0' : '0'};
`;

const BrandMark = styled.img`
  width: ${props => props.$collapsed ? '34px' : '38px'};
  height: ${props => props.$collapsed ? '34px' : '38px'};
  border-radius: 9px;
`;

const BrandCopy = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
`;

const BrandPrimary = styled.span`
  font-family: ${props => props.theme.fonts.display};
  font-size: ${props => props.$collapsed ? '1.25rem' : '1.55rem'};
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${props => props.theme.layout.sidebar.text};
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1;

  .brand-rune {
    color: ${props => props.theme.colors.bronze};
    font-weight: 500;
    font-size: 1.05em;
    margin: 0 6px 0 8px;
    line-height: 1;
    /* Subtle glow so the rune feels intentional */
    text-shadow: 0 0 12px rgba(176, 138, 74, 0.18);
  }

  .brand-version {
    font-family: ${props => props.theme.fonts.mono};
    font-size: 0.62rem;
    font-weight: 600;
    color: ${props => props.theme.colors.bronze};
    text-transform: uppercase;
    letter-spacing: 0.14em;
    background: ${props => props.theme.colors.bronzeSoft || 'rgba(176, 138, 74, 0.12)'};
    padding: 2px 6px 1px;
    border-radius: 3px;
    margin-left: 8px;
    align-self: center;
    line-height: 1.3;
  }
`;

const BrandSecondary = styled.span`
  font-family: ${props => props.theme.fonts.sans};
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${props => props.theme.layout.sidebar.muted};
  font-weight: 500;
  margin-top: 2px;
`;

const NavList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const NavItem = styled.li`
  margin: 0;
`;

const NavLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.85rem;
  margin: 1px 0.65rem;
  border-radius: 4px;
  color: ${props => props.theme.layout.sidebar.muted};
  text-decoration: none;
  transition: background-color 0.15s ease, color 0.15s ease;
  position: relative;

  /* Active-state accent bar (bronze, S.H.I.E.L.D. brand) */
  &::before {
    content: '';
    position: absolute;
    left: -0.65rem;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 0;
    background: ${props => props.theme.colors.bronze};
    border-radius: 0 2px 2px 0;
    transition: height 0.18s ease;
  }

  &:hover {
    background: ${props => props.theme.layout.sidebar.hoverBackground};
    color: ${props => props.theme.layout.sidebar.hoverText};

    .icon { color: ${props => props.theme.colors.bronze}; opacity: 0.85; }
  }

  &.active {
    background: ${props => props.theme.layout.sidebar.activeBackground};
    color: ${props => props.theme.layout.sidebar.activeText};
    font-weight: 600;

    &::before { height: 60%; }

    .icon {
      color: ${props => props.theme.colors.bronze};
      opacity: 1;
    }
  }

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary};
    outline-offset: 2px;
  }

  .icon {
    width: 15px;
    height: 15px;
    color: inherit;
    opacity: 0.55;
    flex-shrink: 0;
    transition: opacity 0.15s ease, color 0.15s ease;
  }

  .text {
    font-family: ${props => props.theme.fonts.sans};
    font-size: 0.86rem;
    font-weight: 500;
    line-height: 1.4;
    letter-spacing: 0.005em;
  }
`;

const SectionTitle = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: ${props => props.theme.fonts.sans};
  font-size: 0.62rem;
  font-weight: 700;
  color: ${props => props.theme.colors.bronze};
  text-transform: uppercase;
  letter-spacing: 0.16em;
  padding: 0.4rem 1.5rem 0.35rem;
  margin: 1.5rem 0 0.4rem;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease;
  opacity: 0.85;

  &:hover {
    color: ${props => props.theme.colors.primary};
    opacity: 1;
  }

  &:first-child {
    margin-top: 0.5rem;
  }

  .chevron {
    font-size: 0.55rem;
    transition: transform 0.2s ease;
    opacity: 0.55;
  }
`;

const CollapsibleSection = styled.div`
  max-height: ${props => props.$isOpen ? '1000px' : '0'};
  overflow: hidden;
  transition: max-height 0.3s ease-in-out;
  opacity: ${props => props.$isOpen ? '1' : '0'};
`;

const ToggleButton = styled.button`
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  background: transparent;
  color: ${props => props.theme.layout.sidebar.muted};
  border: 1px solid transparent;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.65rem;
  transition: all 0.2s ease;
  z-index: 1001;
  opacity: 0.5;

  &:hover {
    background: ${props => props.theme.layout.sidebar.hoverBackground};
    border-color: ${props => props.theme.layout.sidebar.border};
    color: ${props => props.theme.colors.bronze};
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary};
    outline-offset: 2px;
    opacity: 1;
  }

  @media (max-width: 768px) {
    opacity: 0.8;
  }
`;

const NavContent = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const SidebarFooter = styled.div`
  padding: 1rem 1.5rem 1.2rem;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  position: relative;

  /* Top hairline matching the header style */
  &::before {
    content: '';
    position: absolute;
    left: 1.25rem;
    right: 1.25rem;
    top: 0;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      ${props => props.theme.layout.sidebar.border} 20%,
      ${props => props.theme.layout.sidebar.border} 80%,
      transparent
    );
  }
`;

const FooterRune = styled.div`
  font-family: ${props => props.theme.fonts.display};
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${props => props.theme.colors.bronze};
  display: flex;
  align-items: center;
  gap: 0.4rem;

  .footer-rune-mark {
    font-size: 1rem;
    line-height: 1;
  }
`;

const FooterNote = styled.div`
  font-family: ${props => props.theme.fonts.sans};
  font-size: 0.68rem;
  line-height: 1.5;
  color: ${props => props.theme.colors.inkFaded};
  letter-spacing: 0.02em;
`;

const Sidebar = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState({
    'viden': true,
    'indstillinger': false
  });
  const sidebarRef = useRef(null);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia('(max-width: 768px)').matches;
  });

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (event) => setIsMobileView(event.matches);

    setIsMobileView(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const sidebarNode = sidebarRef.current;
    if (!sidebarNode) {
      return undefined;
    }

    const shouldTrapFocus = !collapsed && isMobileView;
    if (!shouldTrapFocus) {
      return undefined;
    }

    const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea';
    const focusableElements = Array.from(sidebarNode.querySelectorAll(focusableSelectors))
      .filter((element) => !element.hasAttribute('aria-hidden') && element.offsetParent !== null);

    if (!focusableElements.length) {
      return undefined;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onToggle();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const handleFocusIn = (event) => {
      if (!sidebarNode.contains(event.target)) {
        firstElement.focus();
      }
    };

    firstElement.focus();

    sidebarNode.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      sidebarNode.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [collapsed, isMobileView, onToggle]);

  const menuItems = [
    {
      section: null,
      sectionKey: null,
      items: [
        { path: '/', icon: FaHome, text: 'Forside' },
        { path: '/vurdering', icon: FaClipboardList, text: 'Konsekvensanalyse' },
        { path: '/juridisk-screening', icon: FaShieldAlt, text: 'Juridisk screening' },
        { path: '/sager', icon: FaBalanceScale, text: 'Sager' },
        { path: '/historik', icon: FaHistory, text: 'Historik' }
      ]
    },
    {
      section: 'Viden & Research',
      sectionKey: 'viden',
      items: [
        { path: '/videnbase', icon: FaBook, text: 'Videnbase' },
        { path: '/ai-losninger', icon: FaRobot, text: 'AI Løsninger' },
        { path: '/research', icon: FaGlobeEurope, text: 'Juridisk Research' },
        { path: '/lov-assistent', icon: FaGavel, text: 'Lov Assistent' },
        { path: '/eu-checker', icon: FaBalanceScale, text: 'EU AI Act Checker' },
        { path: '/ressourcer', icon: FaExternalLinkAlt, text: 'Relevante Links' }
      ]
    },
    {
      section: 'Indstillinger',
      sectionKey: 'indstillinger',
      items: [
        { path: '/drift', icon: FaCog, text: 'Drift' },
        { path: '/lov-overvaagning', icon: FaGavel, text: 'Lov-overvågning' },
        { path: '/indstillinger', icon: FaCog, text: 'Indstillinger' }
      ]
    }
  ];

  const toggleLabel = collapsed ? 'Åbn navigation' : 'Luk navigation';

  return (
    <SidebarContainer
      ref={sidebarRef}
      collapsed={collapsed}
      role="navigation"
      aria-label="Primær navigation"
      aria-hidden={collapsed && isMobileView ? 'true' : 'false'}
    >
      <SidebarHeader>
        <ToggleButton
          type="button"
          onClick={onToggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          aria-controls={NAVIGATION_ID}
        >
          {collapsed ? <FaChevronRight /> : <FaChevronLeft />}
        </ToggleButton>
        <BrandContainer $collapsed={collapsed}>
          <BrandMark src={BRAND.logoPath} alt="" $collapsed={collapsed} />
          {!collapsed && <BrandCopy>
            <BrandPrimary $collapsed={collapsed}>{BRAND.name}<span className="brand-version">{BRAND.version}</span></BrandPrimary>
            <BrandSecondary>{BRAND.descriptor}</BrandSecondary>
          </BrandCopy>}
        </BrandContainer>
      </SidebarHeader>

      <NavContent id={NAVIGATION_ID}>
        <nav>
          {menuItems.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {!collapsed && section.section && section.sectionKey ? (
                <>
                  <SectionTitle onClick={() => toggleSection(section.sectionKey)}>
                    <span>{section.section}</span>
                    {expandedSections[section.sectionKey] ? (
                      <FaChevronUp className="chevron" />
                    ) : (
                      <FaChevronDown className="chevron" />
                    )}
                  </SectionTitle>
                  <CollapsibleSection $isOpen={expandedSections[section.sectionKey]}>
                    <NavList>
                      {section.items.map((item, itemIndex) => (
                        <NavItem key={itemIndex}>
                          <NavLink
                            to={item.path}
                            className={location.pathname === item.path ? 'active' : ''}
                            title={collapsed ? item.text : ''}
                            onClick={isMobileView && !collapsed ? onToggle : undefined}
                          >
                            <item.icon className="icon" />
                            {!collapsed && <span className="text">{item.text}</span>}
                          </NavLink>
                        </NavItem>
                      ))}
                    </NavList>
                  </CollapsibleSection>
                </>
              ) : (
                <NavList>
                  {section.items.map((item, itemIndex) => (
                    <NavItem key={itemIndex}>
                      <NavLink
                        to={item.path}
                        className={location.pathname === item.path ? 'active' : ''}
                        title={collapsed ? item.text : ''}
                        onClick={isMobileView && !collapsed ? onToggle : undefined}
                      >
                        <item.icon className="icon" />
                        {!collapsed && <span className="text">{item.text}</span>}
                      </NavLink>
                    </NavItem>
                  ))}
                </NavList>
              )}
            </div>
          ))}
        </nav>
      </NavContent>

      {!collapsed && (
        <SidebarFooter>
          <FooterRune>
            <span className="footer-rune-mark" aria-hidden="true">H</span>
            {BRAND.name} · {BRAND.version}
          </FooterRune>
          <FooterNote>Kun til internt brug — Digitalisering &amp; IT</FooterNote>
          <Link
            to="/privacy"
            onClick={isMobileView && !collapsed ? onToggle : undefined}
            style={{
              fontFamily: 'inherit',
              fontSize: '0.66rem',
              color: 'inherit',
              textDecoration: 'none',
              opacity: 0.7,
              letterSpacing: '0.04em',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
          >
            Persondatapolitik →
          </Link>
        </SidebarFooter>
      )}
    </SidebarContainer>
  );
};

export default Sidebar;
