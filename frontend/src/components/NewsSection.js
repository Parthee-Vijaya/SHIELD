import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { FaSync } from 'react-icons/fa';
import { NewsSkeletonLoader } from './SkeletonLoader';
import { availableCategories, resolveSourceMeta } from '../utils/newsSourceMap';

// ---- Northern Modern news column (Design system v2) ---------------------

const NewsContainer = styled.section`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 28px 32px 12px;
  box-shadow: ${(p) => p.theme.shadows.sm};
  margin-bottom: 24px;

  @media (max-width: 720px) {
    padding: 22px 20px 8px;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid ${(p) => p.theme.colors.borderSoft};
  margin-bottom: 8px;
`;

const NewsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Eyebrow = styled.span`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.primary};
`;

const NewsTitle = styled.h2`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.65rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: ${(p) => p.theme.colors.text};
  margin: 0;
  line-height: 1.15;
`;

const HeaderInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const LastUpdated = styled.span`
  font-family: ${(p) => p.theme.fonts.sans};
  color: ${(p) => p.theme.colors.textMuted};
  font-size: 0.78rem;
  letter-spacing: 0.02em;
`;

const RefreshButton = styled.button`
  background: transparent;
  color: ${(p) => p.theme.colors.primary};
  border: 1px solid ${(p) => p.theme.colors.primary};
  border-radius: 999px;
  padding: 6px 14px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  transition: ${(p) => p.theme.animations.transitionFast};

  &:hover:not(:disabled) {
    background: ${(p) => p.theme.colors.primarySoft};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .refresh-icon {
    font-size: 0.75rem;
    animation: ${(p) => (p.spinning ? 'spin 1s linear infinite' : 'none')};
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const CategoryFilter = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const FilterLabel = styled.span`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${(p) => p.theme.colors.textMuted};
  font-weight: 600;
`;

/* Native <select> styled to match S.H.I.E.L.D. Northern Modern. Native fordi det
 * giver os gratis tastaturnavigation, screen-reader-support, og iOS-/macOS-
 * native dropdown-rendering. Custom-chevron via background-image. */
const CategorySelect = styled.select`
  appearance: none;
  -webkit-appearance: none;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: ${(p) => p.theme.colors.text};
  background: ${(p) => p.theme.colors.surface || '#fff'};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 4px;
  padding: 6px 32px 6px 12px;
  cursor: pointer;
  min-width: 180px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  /* Bronze chevron icon */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%23b08a4a' stroke-width='1.5'><path d='M2 2l4 4 4-4'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 11px 7px;

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
  }

  &:focus {
    outline: none;
    border-color: ${(p) => p.theme.colors.primary};
    box-shadow: 0 0 0 3px ${(p) => p.theme.colors.primarySoft || 'rgba(13, 46, 84, 0.12)'};
  }
`;

const CategoryCount = styled.span`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  color: ${(p) => p.theme.colors.textMuted};
  letter-spacing: 0.04em;
`;

// ---- Item ---------------------------------------------------------------

const NewsItem = styled.article`
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 22px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.borderSoft};

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 720px) {
    gap: 14px;
  }
`;

const SourceLogo = styled.img`
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.surfaceAlt};

  @media (max-width: 720px) {
    width: 36px;
    height: 36px;
  }
`;

const ItemBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ItemHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
`;

const ItemHeaderText = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const NewsItemTitle = styled.h3`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.18rem;
  font-weight: 600;
  letter-spacing: -0.005em;
  line-height: 1.3;
  color: ${(p) => p.theme.colors.text};
  margin: 0;
`;

const SourceLine = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  color: ${(p) => p.theme.colors.textMuted};
`;

const SourceName = styled.span`
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const SourceMetaText = styled.span`
  &::before {
    content: '·';
    margin-right: 8px;
    color: ${(p) => p.theme.colors.textFaded};
  }
`;

const NewsSummary = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  line-height: 1.6;
  color: ${(p) => p.theme.colors.text};
  margin: 6px 0 0;

  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Keywords = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
`;

const Keyword = styled.span`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: ${(p) => p.theme.colors.textMuted};
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 999px;
  padding: 2px 10px;
`;

const NewsLink = styled.a`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: ${(p) => p.theme.colors.primary};
  text-decoration: none;
  margin-top: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;

  &:hover {
    text-decoration: underline;
  }
`;

// ---- Importance badge — outline pill, not solid ------------------------

const ImportanceBadge = styled.span`
  flex: 0 0 auto;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.66rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
  border: 1px solid;
  background: transparent;

  ${({ importance, theme }) => {
    if (importance === 'high') {
      return `border-color: ${theme.colors.danger}; color: ${theme.colors.danger};`;
    }
    if (importance === 'medium') {
      return `border-color: ${theme.colors.primary}; color: ${theme.colors.primary};`;
    }
    return `border-color: ${theme.colors.success}; color: ${theme.colors.success};`;
  }}
`;

// ---- Status messages ----------------------------------------------------

const LoadingMessage = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  text-align: center;
  padding: 36px 0;
  color: ${(p) => p.theme.colors.textMuted};
  font-style: italic;
`;

const ErrorMessage = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  text-align: center;
  padding: 16px 18px;
  margin: 12px 0;
  color: ${(p) => p.theme.colors.danger};
  background: ${(p) => p.theme.colors.dangerSoft};
  border-left: 3px solid ${(p) => p.theme.colors.danger};
  border-radius: 4px;
  font-size: 0.85rem;
`;

// ---- Helpers ------------------------------------------------------------

const stripHtml = (html) => {
  if (!html) return '';
  // Remove tags
  let text = String(html).replace(/<[^>]+>/g, ' ');
  // Decode common entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  // Collapse whitespace
  return text.replace(/\s+/g, ' ').trim();
};

const importanceLabel = (importance) => {
  if (importance === 'high') return 'Høj vigtighed';
  if (importance === 'medium') return 'Middel vigtighed';
  return 'Lav vigtighed';
};

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
const POLLING_INTERVAL_MS = 15 * 60 * 1000;

const NewsSection = () => {
  const [rawItems, setRawItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const categories = useMemo(() => availableCategories(), []);

  const fetchWithTimeout = async (url, { timeout = 4000 } = {}) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Fejl ved fetch (${response.status})`);
      }
      return response;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const fetchStaticNews = async () => {
    const response = await fetchWithTimeout('/fallback/news.json', { timeout: 1500 });
    return response.json();
  };

  const fetchNews = useCallback(async ({ forceRefresh = false } = {}) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      if (!forceRefresh && rawItems.length === 0) {
        try {
          const fallbackData = await fetchStaticNews();
          if (fallbackData?.items?.length) {
            setRawItems(fallbackData.items);
            setLastUpdated(fallbackData.last_updated ? new Date(fallbackData.last_updated) : new Date());
            setError('Viser cached nyheder – opdaterer...');
          }
        } catch (prefetchErr) {
          console.warn('Kunne ikke indlæse statiske nyheder', prefetchErr);
        }
      }

      const params = new URLSearchParams({ limit: '24' });
      if (forceRefresh) {
        params.append('force_refresh', 'true');
      }

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/news/latest?${params.toString()}`);
      const data = await response.json();
      setRawItems(data.items || []);
      setLastUpdated(data.last_updated ? new Date(data.last_updated) : new Date());
      setError(null);
    } catch (err) {
      console.warn('Nyheds-API utilgængelig – forsøger fallback', err);
      try {
        const fallbackData = await fetchStaticNews();
        setRawItems(fallbackData.items || []);
        setLastUpdated(fallbackData.last_updated ? new Date(fallbackData.last_updated) : new Date());
        setError('Viser seneste tilgængelige nyheder (offline)');
      } catch (fallbackError) {
        console.error('Fallback nyheder utilgængelige', fallbackError);
        setRawItems([]);
        setError(fallbackError.message || 'Uventet fejl ved indlæsning af nyheder');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems.length]);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(() => fetchNews(), POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const handleCategoryChange = (category) => setSelectedCategory(category);
  const handleManualRefresh = () => fetchNews({ forceRefresh: true });

  const news = useMemo(() => {
    if (selectedCategory === 'all') return rawItems;
    return rawItems.filter((item) => resolveSourceMeta(item.source).id === selectedCategory);
  }, [rawItems, selectedCategory]);

  const formatDate = (dateString, fallbackString) => {
    const date = dateString ? new Date(dateString) : fallbackString ? new Date(fallbackString) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Ukendt tidspunkt';
    return date.toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <NewsContainer>
      <SectionHeader>
        <NewsHeader>
          <TitleBlock>
            <Eyebrow>S.H.I.E.L.D. · live-feed</Eyebrow>
            <NewsTitle>Seneste AI- og juranews</NewsTitle>
          </TitleBlock>
          <HeaderInfo>
            {lastUpdated && (
              <LastUpdated>
                Opdateret {lastUpdated.toLocaleDateString('da-DK', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </LastUpdated>
            )}
            <RefreshButton
              onClick={handleManualRefresh}
              disabled={refreshing || loading}
              spinning={refreshing}
            >
              <FaSync className="refresh-icon" />
              {refreshing ? 'Opdaterer…' : 'Opdater'}
            </RefreshButton>
          </HeaderInfo>
        </NewsHeader>

        <CategoryFilter>
          <FilterLabel htmlFor="news-source-filter">Kilde</FilterLabel>
          <CategorySelect
            id="news-source-filter"
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            aria-label="Filtrér nyheder efter kilde"
          >
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </CategorySelect>
          <CategoryCount>{news.length} af {rawItems.length}</CategoryCount>
        </CategoryFilter>
      </SectionHeader>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {loading && rawItems.length === 0 ? (
        <NewsSkeletonLoader />
      ) : news.length === 0 ? (
        <LoadingMessage>Ingen relevante nyheder fundet lige nu.</LoadingMessage>
      ) : (
        news.map((item, index) => {
          const sourceMeta = resolveSourceMeta(item.source);
          const summary = stripHtml(item.summary);
          return (
            <NewsItem key={`${item.url}-${index}`}>
              <SourceLogo src={sourceMeta.logo} alt={`${sourceMeta.name} logo`} />
              <ItemBody>
                <ItemHeaderRow>
                  <ItemHeaderText>
                    <NewsItemTitle>{item.title}</NewsItemTitle>
                    <SourceLine>
                      <SourceName>{item.source}</SourceName>
                      <SourceMetaText>
                        {sourceMeta.region} · {formatDate(item.published_at, item.scraped_at)}
                      </SourceMetaText>
                    </SourceLine>
                  </ItemHeaderText>
                  <ImportanceBadge importance={item.importance}>
                    {importanceLabel(item.importance)}
                  </ImportanceBadge>
                </ItemHeaderRow>

                {summary && <NewsSummary>{summary}</NewsSummary>}

                {item.keywords && item.keywords.length > 0 && (
                  <Keywords>
                    {item.keywords.map((keyword, kidx) => (
                      <Keyword key={kidx}>{keyword}</Keyword>
                    ))}
                  </Keywords>
                )}

                <NewsLink href={item.url} target="_blank" rel="noopener noreferrer">
                  Læs hele artiklen →
                </NewsLink>
              </ItemBody>
            </NewsItem>
          );
        })
      )}
    </NewsContainer>
  );
};

export default NewsSection;
