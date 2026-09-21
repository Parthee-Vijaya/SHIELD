import React, { useMemo, useState } from 'react';
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

import resourcesCatalog from '../data/resourcesCatalog.json';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedLang, setSelectedLang] = useState('all');

  const categories = useMemo(() => {
    const c = new Set(resourcesCatalog.map((r) => r.category).filter(Boolean));
    return ['all', ...Array.from(c).sort((a, b) => a.localeCompare(b, 'da'))];
  }, []);

  const types = useMemo(() => {
    const t = new Set(resourcesCatalog.map((r) => r.type).filter(Boolean));
    return ['all', ...Array.from(t).sort((a, b) => a.localeCompare(b, 'da'))];
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return resourcesCatalog.filter((r) => {
      const haystack = [
        r.title, r.description, r.url, r.category, r.type,
        ...(r.tags || []),
      ].join(' ').toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      const matchesCategory = selectedCategory === 'all' || r.category === selectedCategory;
      const matchesType = selectedType === 'all' || r.type === selectedType;
      const matchesLang = selectedLang === 'all' || r.language === selectedLang;
      return matchesSearch && matchesCategory && matchesType && matchesLang;
    });
  }, [searchTerm, selectedCategory, selectedType, selectedLang]);

  const hasActiveFilters =
    selectedCategory !== 'all' || selectedType !== 'all' || selectedLang !== 'all' || searchTerm;

  const clearAll = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedType('all');
    setSelectedLang('all');
  };

  // Stats
  const totalCategories = categories.length - 1;
  const totalTypes = types.length - 1;

  return (
    <PageShell>
      <PageHeader
        eyebrow="S.H.I.E.L.D. · ressource-kartotek"
        title="Relevante links"
        lede="Kurateret kartotek af lovkilder, vejledninger, standarder og værktøjer relevante for kommunal AI-compliance. Søg, filtrér på kategori og type, eller klik direkte på et kort."
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

      <Toolbar>
        <SearchField>
          <FaSearch />
          <input
            type="text"
            placeholder="Søg titel, beskrivelse, tag eller URL…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchField>
      </Toolbar>

      <FilterRow>
        <span className="label">Kategori</span>
        <FilterPills>
          {categories.map((c) => (
            <OutlinePill key={c} $active={selectedCategory === c} onClick={() => setSelectedCategory(c)}>
              {c === 'all' ? 'Alle' : c}
            </OutlinePill>
          ))}
        </FilterPills>
      </FilterRow>

      <FilterRow>
        <span className="label">Type</span>
        <FilterPills>
          {types.map((t) => (
            <OutlinePill key={t} $active={selectedType === t} onClick={() => setSelectedType(t)}>
              {t === 'all' ? 'Alle' : t}
            </OutlinePill>
          ))}
        </FilterPills>
      </FilterRow>

      <FilterRow>
        <span className="label">Sprog</span>
        <FilterPills>
          {['all', 'da', 'en'].map((l) => (
            <OutlinePill key={l} $active={selectedLang === l} onClick={() => setSelectedLang(l)}>
              {l === 'all' ? 'Alle' : l === 'da' ? 'Dansk' : 'English'}
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
              {selectedLang === 'da' ? 'Dansk' : 'English'}
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
        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
          klik kort for at åbne link i ny fane
        </span>
      </ResultsCount>

      {filtered.length === 0 ? (
        <Empty>Ingen ressourcer matcher dine filtre. Prøv at rydde dem.</Empty>
      ) : (
        <Grid>
          {filtered.map((r) => (
            <Card
              key={r.id}
              href={r.url}
              target={r.url.startsWith('/') ? undefined : '_blank'}
              rel={r.url.startsWith('/') ? undefined : 'noopener noreferrer'}
              $category={r.category}
            >
              <CardTopRow>
                <span className="meta">
                  {r.type}
                  {r.language && <LangChip>{r.language}</LangChip>}
                </span>
                <FaExternalLinkAlt className="external-icon" aria-hidden="true" />
              </CardTopRow>
              <CardTitle>{r.title}</CardTitle>
              <CardHost>{hostFromUrl(r.url)}</CardHost>
              {r.description && <CardDescription>{r.description}</CardDescription>}
              <CardFooter>
                {(r.tags || []).slice(0, 3).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
                {r.lastUpdated && (
                  <Tag style={{ marginLeft: 'auto', opacity: 0.7 }}>
                    {formatDanishDate(r.lastUpdated)}
                  </Tag>
                )}
              </CardFooter>
            </Card>
          ))}
        </Grid>
      )}
    </PageShell>
  );
};

export default ResourcesPage;
