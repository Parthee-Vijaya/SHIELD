import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  FaExternalLinkAlt,
  FaSearch,
  FaTimes,
} from 'react-icons/fa';

import {
  PageShell,
  PageHeader,
  OutlinePill,
  SearchField,
} from '../components/page-chrome/PageChrome';

import resourcesCatalog from '../data/resourceLibrary';
import { safeResourceUrl } from '../components/workspace-search/searchUtils';
import { StatePanel, SecondaryButton } from '../components/workflow/WorkflowUi';

// ---- Stat-bar -------------------------------------------------------------

const StatsBar = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0;
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  margin-bottom: 1.5rem;
  overflow: hidden;
`;

const StatCell = styled.div`
  padding: 14px 18px;
  border-right: 1px solid ${(p) => p.theme.colors.borderSoft};

  &:last-child { border-right: none; }

  .number {
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.55rem;
    font-weight: 700;
    color: ${(p) => p.theme.colors.ink};
    line-height: 1;
    letter-spacing: -0.01em;
  }
  .label {
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${(p) => p.theme.colors.textMuted};
    margin-top: 6px;
    font-weight: 600;
  }
`;

// ---- Toolbar --------------------------------------------------------------

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 1rem;
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;

  .label {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${(p) => p.theme.colors.textMuted};
    font-weight: 600;
    margin-right: 0.4rem;
  }
`;

const FilterPills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const ActiveFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 0.85rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.78rem;
  align-items: center;

  .clear {
    background: transparent;
    border: 1px solid ${(p) => p.theme.colors.border};
    color: ${(p) => p.theme.colors.textMuted};
    border-radius: 999px;
    padding: 3px 10px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.72rem;

    &:hover {
      border-color: ${(p) => p.theme.colors.primary};
      color: ${(p) => p.theme.colors.primary};
    }
  }
`;

const ActiveTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: ${(p) => p.theme.colors.primarySoft || 'rgba(13, 46, 84, 0.08)'};
  color: ${(p) => p.theme.colors.primary};
  border-radius: 999px;
  padding: 3px 4px 3px 10px;
  font-size: 0.72rem;
  font-weight: 500;

  button {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0 4px;
    display: flex;
    align-items: center;
    line-height: 1;
  }
`;

const ResultsCount = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.86rem;
  color: ${(p) => p.theme.colors.textMuted};
`;

// ---- Card grid (kartotek-stil) -------------------------------------------

/* Færre kolonner end før: vi viser flere små kort i stedet for få store. */
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`;

/* Per-kategori farve på top-strip — gør det nemt at scanne kategorier visuelt
   uden at skulle læse labels. */
const CATEGORY_ACCENT = {
  'EU lovgivning': '#0d2e54',
  'Dansk myndighed': '#a03612',
  'EU institution': '#5a8ec4',
  Standard: '#2d6a31',
  Sikkerhed: '#a02020',
  Teknik: '#b08a4a',
  Praksis: '#6b4a8a',
  Værktøj: '#4a7a8a',
  Politik: '#7a5a3a',
  Internt: '#888',
};

const Card = styled.a`
  display: flex;
  flex-direction: column;
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 4px;
  padding: 14px 16px 14px;
  text-decoration: none;
  color: inherit;
  position: relative;
  transition: border-color 0.15s ease, transform 0.12s ease, box-shadow 0.18s ease;
  cursor: pointer;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${(p) => CATEGORY_ACCENT[p.$category] || '#888'};
    opacity: 0.7;
    border-radius: 4px 4px 0 0;
  }

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(20, 24, 31, 0.06);

    .external-icon { opacity: 1; }
  }
`;

const CardTopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.4rem;

  .meta {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${(p) => p.theme.colors.textMuted};
    flex-shrink: 0;
  }

  .external-icon {
    color: ${(p) => p.theme.colors.textMuted};
    opacity: 0.4;
    font-size: 0.78rem;
    transition: opacity 0.15s ease;
  }
`;

const CardTitle = styled.div`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.ink};
  letter-spacing: -0.005em;
  line-height: 1.3;
  margin-bottom: 0.3rem;
`;

const CardHost = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.74rem;
  color: ${(p) => p.theme.colors.textMuted};
  margin-bottom: 0.55rem;
  word-break: break-all;
`;

const PublicationMeta = styled.div`
  font-size: 0.76rem;
  color: ${(p) => p.theme.colors.textMuted};
  line-height: 1.5;
  margin-bottom: 0.55rem;
  overflow-wrap: anywhere;
`;

const CardDescription = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.86rem;
  color: ${(p) => p.theme.colors.text};
  line-height: 1.5;
  margin: 0 0 0.7rem;
  /* Truncate long descriptions to 4 lines */
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const CardFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
  padding-top: 0.4rem;
  border-top: 1px dotted ${(p) => p.theme.colors.borderSoft};
`;

const Tag = styled.span`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.66rem;
  background: ${(p) => p.theme.colors.paperSoft};
  color: ${(p) => p.theme.colors.textMuted};
  padding: 1px 7px;
  border-radius: 2px;
  letter-spacing: 0.02em;
`;

const LangChip = styled.span`
  display: inline-block;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.66rem;
  background: ${(p) => p.theme.colors.bronzeSoft || 'rgba(176,138,74,0.15)'};
  color: ${(p) => p.theme.colors.bronze || '#b08a4a'};
  padding: 1px 6px;
  border-radius: 2px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-left: 4px;
  flex-shrink: 0;
`;

const Empty = styled.div`
  padding: 2.5rem;
  text-align: center;
  color: ${(p) => p.theme.colors.textMuted};
  font-style: italic;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px dashed ${(p) => p.theme.colors.border};
  border-radius: 4px;
`;

// ---- Helpers --------------------------------------------------------------

const hostFromUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('/')) return 'shield.local';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const formatDanishDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('da-DK', {
    year: 'numeric', month: 'short', day: '2-digit',
  });
};

// ---- Main page -----------------------------------------------------------

const ResourcesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedResourceId = searchParams.get('resource_id') || '';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedLang, setSelectedLang] = useState('all');

  useEffect(() => {
    if (!requestedResourceId) return;
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedType('all');
    setSelectedLang('all');
  }, [requestedResourceId]);

  const categories = useMemo(() => {
    const c = new Set(resourcesCatalog.flatMap((r) => r.categories));
    return ['all', ...Array.from(c).sort((a, b) => a.localeCompare(b, 'da'))];
  }, []);

  const types = useMemo(() => {
    const t = new Set(resourcesCatalog.flatMap((r) => r.types));
    return ['all', ...Array.from(t).sort((a, b) => a.localeCompare(b, 'da'))];
  }, []);

  const languages = useMemo(() => ['all', ...Array.from(new Set(resourcesCatalog.flatMap(r => r.languages))).sort()], []);
  const languageLabel = code => ({ all: 'Alle', da: 'Dansk', en: 'Engelsk', unknown: 'Ikke angivet' }[code] || code);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return resourcesCatalog.filter((r) => {
      const haystack = [
        ...r.titles, ...r.descriptions, r.url, ...r.categories, ...r.types,
        ...r.tags, ...r.publishers, ...r.years, ...r.areas,
      ].join(' ').toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      const matchesCategory = selectedCategory === 'all' || r.categories.includes(selectedCategory);
      const matchesType = selectedType === 'all' || r.types.includes(selectedType);
      const matchesLang = selectedLang === 'all' || r.languages.includes(selectedLang);
      return (!requestedResourceId || String(r.id) === requestedResourceId) && matchesSearch && matchesCategory && matchesType && matchesLang;
    });
  }, [searchTerm, selectedCategory, selectedType, selectedLang, requestedResourceId]);

  const hasActiveFilters =
    selectedCategory !== 'all' || selectedType !== 'all' || selectedLang !== 'all' || searchTerm || requestedResourceId;

  const clearAll = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedType('all');
    setSelectedLang('all');
    if (requestedResourceId) {
      const next = new URLSearchParams(searchParams);
      next.delete('resource_id');
      setSearchParams(next);
    }
  };

  // Stats
  const totalCategories = categories.length - 1;
  const totalTypes = types.length - 1;

  return (
    <PageShell>
      <PageHeader
        eyebrow="S.H.I.E.L.D. · ressource-kartotek"
        title="Vejledninger og links"
        lede="Samlet kartotek af lovkilder, vejledninger, rapporter, publikationer, standarder og værktøjer til arbejdet med kommunale AI-løsninger. Søg, filtrér eller åbn en kilde direkte."
      />

      <StatsBar>
        <StatCell>
          <div className="number">{resourcesCatalog.length}</div>
          <div className="label">Ressourcer</div>
        </StatCell>
        <StatCell>
          <div className="number">{totalCategories}</div>
          <div className="label">Kategorier</div>
        </StatCell>
        <StatCell>
          <div className="number">{totalTypes}</div>
          <div className="label">Typer</div>
        </StatCell>
        <StatCell>
          <div className="number">{filtered.length}</div>
          <div className="label">Vist</div>
        </StatCell>
      </StatsBar>

      {requestedResourceId && <StatePanel role="status">
        <strong>{resourcesCatalog.some(item => String(item.id) === requestedResourceId) ? 'Kilde fra søgeresultatet' : 'Kilden findes ikke i kataloget'}</strong>
        <p>{resourcesCatalog.some(item => String(item.id) === requestedResourceId) ? 'Listen viser den valgte vejledning eller rapport. Åbn kildens originale link for at læse indholdet.' : 'Linket peger på en kilde, som ikke længere findes her. Åbn hele kataloget for at finde en anden kilde.'}</p>
        <SecondaryButton type="button" onClick={clearAll}>Vis alle vejledninger og rapporter</SecondaryButton>
      </StatePanel>}

      <Toolbar>
        <SearchField>
          <FaSearch />
          <input
            type="text"
            aria-label="Søg i vejledninger og publikationer"
            placeholder="Søg titel, udgiver, årstal, emne eller URL…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchField>
      </Toolbar>

      <FilterRow>
        <span className="label">Kategori</span>
        <FilterPills>
          {categories.map((c) => (
            <OutlinePill key={c} type="button" aria-pressed={selectedCategory === c} $active={selectedCategory === c} onClick={() => setSelectedCategory(c)}>
              {c === 'all' ? 'Alle' : c}
            </OutlinePill>
          ))}
        </FilterPills>
      </FilterRow>

      <FilterRow>
        <span className="label">Type</span>
        <FilterPills>
          {types.map((t) => (
            <OutlinePill key={t} type="button" aria-pressed={selectedType === t} $active={selectedType === t} onClick={() => setSelectedType(t)}>
              {t === 'all' ? 'Alle' : t}
            </OutlinePill>
          ))}
        </FilterPills>
      </FilterRow>

      <FilterRow>
        <span className="label">Sprog</span>
        <FilterPills>
          {languages.map((l) => (
            <OutlinePill key={l} type="button" aria-pressed={selectedLang === l} $active={selectedLang === l} onClick={() => setSelectedLang(l)}>
              {languageLabel(l)}
            </OutlinePill>
          ))}
        </FilterPills>
      </FilterRow>

      {hasActiveFilters && (
        <ActiveFilters>
          {searchTerm && (
            <ActiveTag>
              "{searchTerm}"
              <button onClick={() => setSearchTerm('')} aria-label="Fjern søgning">
                <FaTimes />
              </button>
            </ActiveTag>
          )}
          {selectedCategory !== 'all' && (
            <ActiveTag>
              {selectedCategory}
              <button onClick={() => setSelectedCategory('all')} aria-label={`Fjern kategori ${selectedCategory}`}>
                <FaTimes />
              </button>
            </ActiveTag>
          )}
          {selectedType !== 'all' && (
            <ActiveTag>
              {selectedType}
              <button onClick={() => setSelectedType('all')} aria-label={`Fjern type ${selectedType}`}>
                <FaTimes />
              </button>
            </ActiveTag>
          )}
          {selectedLang !== 'all' && (
            <ActiveTag>
              {languageLabel(selectedLang)}
              <button onClick={() => setSelectedLang('all')} aria-label="Fjern sprog">
                <FaTimes />
              </button>
            </ActiveTag>
          )}
          <button className="clear" onClick={clearAll}>Ryd alle</button>
        </ActiveFilters>
      )}

      <ResultsCount>
        <span>Viser {filtered.length} af {resourcesCatalog.length}</span>
        <span style={{ fontSize: '0.75rem' }}>
          klik kort for at åbne link i ny fane
        </span>
      </ResultsCount>

      {filtered.length === 0 ? (
        <Empty>Ingen ressourcer matcher dine filtre. Prøv at rydde dem.</Empty>
      ) : (
        <Grid>
          {filtered.map((r) => { const href = safeResourceUrl(r.url); return (
            <Card
              key={r.id}
              as={href ? 'a' : 'article'}
              href={href || undefined}
              target={href && !href.startsWith('/') ? '_blank' : undefined}
              rel={href && !href.startsWith('/') ? 'noopener noreferrer' : undefined}
              $category={r.category}
            >
              <CardTopRow>
                <span className="meta">
                  {r.types.join(' · ')}
                  {r.language && <LangChip>{r.language}</LangChip>}
                </span>
                {href && <FaExternalLinkAlt className="external-icon" aria-hidden="true" />}
              </CardTopRow>
              <CardTitle>{r.titles.join(' / ')}</CardTitle>
              <CardHost>{href ? hostFromUrl(href) : 'Link ikke tilgængeligt'}</CardHost>
              {(r.publishers.length > 0 || r.years.length > 0) && <PublicationMeta>{[r.publishers.join(', '), r.years.join(', '), r.areas.join(', ')].filter(Boolean).join(' · ')}</PublicationMeta>}
              {r.descriptions.length > 0 && <CardDescription>{r.descriptions.join(' ')}</CardDescription>}
              <CardFooter>
                {(r.tags || []).slice(0, 3).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
                {r.updatedDates.map(date => (
                  <Tag key={date} style={{ marginLeft: 'auto', opacity: 0.7 }}>
                    {formatDanishDate(date)}
                  </Tag>
                ))}
              </CardFooter>
            </Card>
          ); })}
        </Grid>
      )}
    </PageShell>
  );
};

export default ResourcesPage;
