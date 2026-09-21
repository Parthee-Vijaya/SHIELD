import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaSearch,
  FaFilter,
  FaTimes,
  FaCalendarAlt,
  FaSortAmountDown,
  FaSortAmountUp,
  FaChevronDown,
  FaChevronUp
} from 'react-icons/fa';

const SearchContainer = styled(motion.div)`
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: ${props => props.theme.shadows.glass};
`;

const SearchHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const SearchInputGroup = styled.div`
  position: relative;
  flex: 1;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  border: 2px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  transition: ${props => props.theme.animations.transition};
  background: white;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(26, 54, 93, 0.1);
  }

  &::placeholder {
    color: ${props => props.theme.colors.gray[500]};
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${props => props.theme.colors.gray[500]};
  z-index: 1;
`;

const FilterToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: ${props => props.expanded ? props.theme.colors.primary : props.theme.colors.gray[100]};
  color: ${props => props.expanded ? 'white' : props.theme.colors.gray[700]};
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  cursor: pointer;
  font-weight: 500;
  transition: ${props => props.theme.animations.transition};

  &:hover {
    background: ${props => props.expanded ? props.theme.colors.primary : props.theme.colors.gray[200]};
  }
`;

const ClearButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: ${props => props.theme.colors.danger};
  color: white;
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  cursor: pointer;
  font-weight: 500;
  transition: ${props => props.theme.animations.transition};

  &:hover {
    background: ${props => props.theme.colors.dangerDark};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FilterPanel = styled(motion.div)`
  border-top: 1px solid ${props => props.theme.colors.gray[200]};
  padding-top: 1rem;
  margin-top: 1rem;
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  label {
    font-size: 0.875rem;
    font-weight: 600;
    color: ${props => props.theme.colors.gray[700]};
  }

  select, input {
    padding: 0.5rem;
    border: 1px solid ${props => props.theme.colors.gray[300]};
    border-radius: ${props => props.theme.borderRadius};
    font-size: 0.875rem;
    background: white;

    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.primary};
    }
  }
`;

const SortControls = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid ${props => props.theme.colors.gray[200]};
`;

const SortButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props => props.active ? props.theme.colors.primary : props.theme.colors.gray[100]};
  color: ${props => props.active ? 'white' : props.theme.colors.gray[700]};
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  cursor: pointer;
  font-size: 0.875rem;
  transition: ${props => props.theme.animations.transition};

  &:hover {
    background: ${props => props.active ? props.theme.colors.primary : props.theme.colors.gray[200]};
  }
`;

const SearchStats = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid ${props => props.theme.colors.gray[200]};
  font-size: 0.875rem;
  color: ${props => props.theme.colors.gray[600]};
`;

const AdvancedSearch = ({ onSearch, searchStats, isLoading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filters, setFilters] = useState({
    category: 'all',
    importance: 'all',
    source: 'all',
    dateFrom: '',
    dateTo: '',
    sortBy: 'date',
    sortOrder: 'desc'
  });

  const categories = [
    { value: 'all', label: 'Alle kategorier' },
    { value: 'datatilsynet', label: 'Datatilsynet' },
    { value: 'eu_news', label: 'EU Nyheder' },
    { value: 'eu_legislation', label: 'EU Lovgivning' },
    { value: 'edpb', label: 'EDPB' },
    { value: 'court_cases', label: 'Domstolsafgørelser' },
    { value: 'danish_municipal', label: 'Kommuner' }
  ];

  const importanceLevels = [
    { value: 'all', label: 'Alle vigtigheder' },
    { value: 'high', label: 'Høj vigtighed' },
    { value: 'medium', label: 'Medium vigtighed' },
    { value: 'low', label: 'Lav vigtighed' }
  ];

  const sources = [
    { value: 'all', label: 'Alle kilder' },
    { value: 'datatilsynet', label: 'Datatilsynet' },
    { value: 'edpb', label: 'EDPB' },
    { value: 'eu_commission', label: 'EU-Kommissionen' },
    { value: 'court', label: 'Domstole' },
    { value: 'municipal', label: 'Kommuner' }
  ];

  const sortOptions = [
    { value: 'date', label: 'Dato' },
    { value: 'relevance', label: 'Relevans' },
    { value: 'importance', label: 'Vigtighed' }
  ];

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm, filters]);

  const handleSearch = () => {
    const searchParams = {
      query: searchTerm,
      ...filters
    };
    onSearch(searchParams);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleClearAll = () => {
    setSearchTerm('');
    setFilters({
      category: 'all',
      importance: 'all',
      source: 'all',
      dateFrom: '',
      dateTo: '',
      sortBy: 'date',
      sortOrder: 'desc'
    });
  };

  const hasActiveFilters = searchTerm ||
    filters.category !== 'all' ||
    filters.importance !== 'all' ||
    filters.source !== 'all' ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <SearchContainer
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <SearchHeader>
        <SearchInputGroup>
          <SearchIcon>
            <FaSearch />
          </SearchIcon>
          <SearchInput
            type="text"
            placeholder="Søg i nyheder og dokumenter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchInputGroup>

        <FilterToggle
          expanded={filtersExpanded}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <FaFilter />
          Filtre
          {filtersExpanded ? <FaChevronUp /> : <FaChevronDown />}
        </FilterToggle>

        {hasActiveFilters && (
          <ClearButton onClick={handleClearAll} disabled={isLoading}>
            <FaTimes />
            Ryd
          </ClearButton>
        )}
      </SearchHeader>

      <AnimatePresence>
        {filtersExpanded && (
          <FilterPanel
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <FilterGrid>
              <FilterGroup>
                <label>Kategori</label>
                <select
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </FilterGroup>

              <FilterGroup>
                <label>Vigtighed</label>
                <select
                  value={filters.importance}
                  onChange={(e) => handleFilterChange('importance', e.target.value)}
                >
                  {importanceLevels.map(level => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </FilterGroup>

              <FilterGroup>
                <label>Kilde</label>
                <select
                  value={filters.source}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                >
                  {sources.map(source => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </FilterGroup>

              <FilterGroup>
                <label>Fra dato</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                />
              </FilterGroup>

              <FilterGroup>
                <label>Til dato</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                />
              </FilterGroup>
            </FilterGrid>

            <SortControls>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                Sortér efter:
              </span>
              {sortOptions.map(option => (
                <SortButton
                  key={option.value}
                  active={filters.sortBy === option.value}
                  onClick={() => handleFilterChange('sortBy', option.value)}
                >
                  {option.label}
                </SortButton>
              ))}

              <SortButton
                active={filters.sortOrder === 'desc'}
                onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'desc' ? 'asc' : 'desc')}
              >
                {filters.sortOrder === 'desc' ? <FaSortAmountDown /> : <FaSortAmountUp />}
                {filters.sortOrder === 'desc' ? 'Faldende' : 'Stigende'}
              </SortButton>
            </SortControls>
          </FilterPanel>
        )}
      </AnimatePresence>

      {searchStats && (
        <SearchStats>
          <span>
            {searchStats.total > 0
              ? `Viser ${searchStats.showing} af ${searchStats.total} resultater`
              : 'Ingen resultater fundet'
            }
          </span>
          {searchStats.searchTime && (
            <span>Søgetid: {searchStats.searchTime}ms</span>
          )}
        </SearchStats>
      )}
    </SearchContainer>
  );
};

export default AdvancedSearch;