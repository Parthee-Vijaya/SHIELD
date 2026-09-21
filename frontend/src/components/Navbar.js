import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { FaSearch, FaSun, FaMoon, FaExclamationTriangle, FaSync as FaSyncIcon } from 'react-icons/fa';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import BRAND from '../config/brand';

const TYPE_LABELS = {
  knowledge_base: 'Videnbase',
  ai_case: 'AI-sag',
  documentation: 'Dokumentation',
};

const TYPE_BADGE_STYLES = {
  knowledge_base: { background: 'rgba(30, 64, 175, 0.12)', color: '#1e3a8a' },
  ai_case: { background: 'rgba(6, 95, 70, 0.12)', color: '#047857' },
  documentation: { background: 'rgba(91, 33, 182, 0.12)', color: '#6d28d9' },
};

const CATEGORY_LABELS = {
  legal: 'Juridisk',
  ai: 'AI',
  compliance: 'Compliance',
  operations: 'Drift',
  technical: 'Teknisk',
  video: 'Video',
};

const truncateSummary = (text, length = 160) => {
  if (!text) {
    return '';
  }
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
};

const LISTBOX_ID = 'global-search-results';

const NavbarContainer = styled.nav`
  background: ${props => props.theme.layout.nav.background};
  padding: 1rem 2rem;
  border-bottom: 1px solid ${props => props.theme.layout.nav.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  color: ${props => props.theme.layout.nav.text};
  transition: ${props => props.theme.animations.transition};
`;

const NavLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const NavBrand = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: ${props => props.theme.layout.nav.text};
`;

const Logo = styled.img`
  width: 38px;
  height: 38px;
  border-radius: 9px;
  transition: ${props => props.theme.animations.transition};

  @media (max-width: 768px) {
    width: 34px;
    height: 34px;
  }
`;

const BrandText = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.1;

  span:first-child {
    font-size: 1.05rem;
    font-weight: 700;
    color: ${props => props.theme.layout.nav.text};
  }

  span:last-child {
    font-size: 0.75rem;
    font-weight: 500;
    color: ${props => props.theme.colors.textMuted};
    letter-spacing: 0.02em;
  }
`;

const NavCenter = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  justify-content: center;
  max-width: 420px;
  margin: 0 2rem;
`;

const SearchContainer = styled.div`
  position: relative;
  width: 100%;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.55rem 1rem 0.55rem 2.5rem;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 10px;
  background: ${props => props.theme.colors.inputBackground};
  font-size: 0.9rem;
  color: ${props => props.theme.colors.text};
  transition: ${props => props.theme.animations.transitionFast};

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
    box-shadow: ${props => props.theme.shadows.focus};
  }

  &::placeholder {
    color: ${props => props.theme.colors.textMuted};
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${props => props.theme.colors.textMuted};
  pointer-events: none;
`;

const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  color: ${props => props.theme.colors.textMuted};
`;

const ThemeToggleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: ${props => props.theme.colors.surfaceAlt};
  color: ${props => props.theme.colors.text};
  border: 1px solid ${props => props.theme.colors.border};
  transition: ${props => props.theme.animations.transitionFast};

  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => props.theme.shadows.sm};
  }
`;

const ResultsDropdown = styled.div`
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 12px;
  box-shadow: ${props => props.theme.shadows.xl};
  z-index: 1200;
  overflow: hidden;
`;

const ResultsList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
`;

const ResultListItem = styled.li`
  border-bottom: 1px solid ${props => props.theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

const ResultButton = styled.button`
  width: 100%;
  text-align: left;
  background: ${props => (props.$active ? props.theme.colors.surfaceAlt : 'transparent')};
  border: none;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  cursor: pointer;
  transition: ${props => props.theme.animations.transitionFast};
  border-left: 3px solid ${props => (props.$active ? props.theme.colors.primary : 'transparent')};

  &:hover {
    background: ${props => props.theme.colors.surfaceAlt};
  }

  h4 {
    margin: 0;
    font-size: 0.95rem;
    color: ${props => props.theme.colors.text};
  }

  p {
    margin: 0;
    font-size: 0.8rem;
    color: ${props => props.theme.colors.textMuted};
    line-height: 1.45;
  }

  .meta-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
`;

const TypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  text-transform: uppercase;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  background: ${props => TYPE_BADGE_STYLES[props.$type]?.background || 'rgba(148, 163, 184, 0.12)'};
  color: ${props => TYPE_BADGE_STYLES[props.$type]?.color || '#475569'};
`;

const MetaChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: ${props => props.theme.colors.surfaceAlt};
  color: ${props => props.theme.colors.textMuted};
`;

const StatusRow = styled.div`
  padding: 0.8rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: ${props => props.$variant === 'error' ? '#7f1d1d' : props.theme.colors.textMuted};

  .spin {
    animation: spin 1s linear infinite;
  }
`;

const EmptyState = styled.div`
  padding: 1rem;
  text-align: center;
  font-size: 0.85rem;
  color: ${props => props.theme.colors.textMuted};
`;

const Navbar = () => {
  const [searchValue, setSearchValue] = useState('');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { preferences, updatePreference } = useUserPreferences();
  const isDark = preferences?.theme === 'dark';
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const fetchControllerRef = useRef(null);
  const debounceRef = useRef(null);

  const handleThemeToggle = useCallback(() => {
    updatePreference('theme', isDark ? 'light' : 'dark');
  }, [isDark, updatePreference]);

  const handleResultSelect = useCallback((item) => {
    if (!item) {
      return;
    }

    setIsOpen(false);
    setActiveIndex(-1);
    setSearchValue('');
    setResults([]);
    setError('');

    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
      fetchControllerRef.current = null;
    }

    if (item.type === 'knowledge_base') {
      const query = item.action?.search;
      if (query) {
        navigate(`/videnbase?query=${encodeURIComponent(query)}`);
      } else {
        navigate('/videnbase');
      }
      return;
    }

    if (item.type === 'ai_case') {
      navigate('/ai-sager', { state: { highlightedCaseId: item.action?.caseId } });
      return;
    }

    if (item.action?.type === 'external' && item.action?.url) {
      window.open(item.action.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (item.action?.route) {
      navigate(item.action.route);
    }
  }, [navigate]);

  const runSearch = useCallback(async (query) => {
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }

    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setIsLoading(true);
    setError('');

    try {
      const baseUrl = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/api/search/global?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (controller.signal.aborted) {
        return;
      }

      const items = Array.isArray(data?.results) ? data.results : [];
      setResults(items);
      setIsOpen(items.length > 0 || Boolean(query));
      setActiveIndex(items.length ? 0 : -1);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      console.error('Global search failed:', err);
      setResults([]);
      setIsOpen(true);
      setActiveIndex(-1);
      setError('Søgning mislykkedes. Prøv igen.');
    } finally {
      if (!controller.signal.aborted) {
        fetchControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const trimmed = searchValue.trim();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (trimmed.length < 2) {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
        fetchControllerRef.current = null;
      }
      setIsLoading(false);
      setError('');
      setResults([]);
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(trimmed);
    }, 250);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [searchValue, runSearch]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => () => {
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  const handleKeyDown = (event) => {
    if (!results.length) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) => {
        const next = prev + 1;
        return next >= results.length ? 0 : next;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) => {
        if (prev <= 0) {
          return results.length - 1;
        }
        return prev - 1;
      });
      return;
    }

    if (event.key === 'Enter') {
      if (isOpen && results.length) {
        event.preventDefault();
        const index = activeIndex >= 0 ? activeIndex : 0;
        handleResultSelect(results[index]);
      }
      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const renderMetaChips = (item) => {
    const chips = [];
    if (item.type === 'knowledge_base' && item.metadata?.category) {
      const label = CATEGORY_LABELS[item.metadata.category] || item.metadata.category;
      chips.push(label);
    }
    if (item.type === 'ai_case') {
      if (item.metadata?.status) {
        chips.push(`Status: ${item.metadata.status}`);
      }
      if (item.metadata?.owner) {
        chips.push(item.metadata.owner);
      }
    }
    if (item.type === 'documentation' && item.metadata?.path) {
      chips.push(item.metadata.path);
    }
    return chips;
  };

  const trimmedSearch = searchValue.trim();
  const showDropdown = (isOpen || isLoading || error) && (trimmedSearch.length >= 2 || Boolean(error));

  return (
    <NavbarContainer>
      <NavLeft>
        <NavBrand to="/">
          <Logo
            src={BRAND.logoPath}
            alt=""
          />
          <BrandText>
            <span>{BRAND.name}</span>
            <span>{BRAND.descriptor}</span>
          </BrandText>
        </NavBrand>
      </NavLeft>

      <NavCenter>
        <SearchContainer ref={containerRef}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (results.length && isOpen) {
                const index = activeIndex >= 0 ? activeIndex : 0;
                handleResultSelect(results[index]);
              }
            }}
          >
            <SearchIcon>
              <FaSearch size={14} />
            </SearchIcon>
            <SearchInput
              type="text"
              placeholder="Søg i platformen..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onFocus={() => results.length && setIsOpen(true)}
              onKeyDown={handleKeyDown}
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={LISTBOX_ID}
              role="combobox"
            />
          </form>
          {showDropdown && (
            <ResultsDropdown>
              {isLoading && (
                <StatusRow>
                  <FaSyncIcon className="spin" aria-hidden="true" />
                  <span>Søger...</span>
                </StatusRow>
              )}
              {error && !isLoading && (
                <StatusRow $variant="error">
                  <FaExclamationTriangle aria-hidden="true" />
                  <span>{error}</span>
                </StatusRow>
              )}
              {!isLoading && !error && results.length === 0 && (
                <EmptyState>Ingen resultater for "{trimmedSearch}"</EmptyState>
              )}
              {results.length > 0 && (
                <ResultsList id={LISTBOX_ID} role="listbox">
                  {results.map((item, index) => {
                    const summary = truncateSummary(item.summary || '');
                    const metaChips = renderMetaChips(item);
                    return (
                      <ResultListItem key={item.id ?? `${item.type}-${index}`}>
                        <ResultButton
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          $active={index === activeIndex}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleResultSelect(item)}
                        >
                          <TypeBadge $type={item.type}>
                            {TYPE_LABELS[item.type] || item.type}
                          </TypeBadge>
                          <h4>{item.title}</h4>
                          {summary && <p>{summary}</p>}
                          {metaChips.length > 0 && (
                            <div className="meta-container">
                              {metaChips.map((chip, chipIndex) => (
                                <MetaChip key={chipIndex}>{chip}</MetaChip>
                              ))}
                            </div>
                          )}
                        </ResultButton>
                      </ResultListItem>
                    );
                  })}
                </ResultsList>
              )}
            </ResultsDropdown>
          )}
        </SearchContainer>
      </NavCenter>

      <NavActions>
        <ThemeToggleButton onClick={handleThemeToggle} aria-label="Skift tema">
          {isDark ? <FaSun size={16} /> : <FaMoon size={16} />}
        </ThemeToggleButton>
      </NavActions>
    </NavbarContainer>
  );
};

export default Navbar;
