import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FaHistory,
  FaEye,
  FaDownload,
  FaTrash,
  FaSearch,
  FaCalendarAlt,
  FaFilter,
  FaChevronDown,
  FaChevronUp,
  FaBalanceScale,
  FaEnvelopeOpenText,
  FaClock,
  FaRedo
} from 'react-icons/fa';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

const buildApiUrl = (path) => {
  if (!API_BASE_URL) {
    return path;
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
};

const fetchAiCases = async () => {
  const response = await fetch(buildApiUrl('/api/ai-cases'));
  if (!response.ok) {
    throw new Error('Kunne ikke hente AI sager');
  }
  return response.json();
};

const CASE_STATUS_COLORS = {
  sent: '#10b981',
  failed: '#ef4444',
  skipped: '#6366f1',
  pending: '#C94416'
};

const CASE_STATUS_LABELS = {
  sent: 'Email sendt',
  failed: 'Email fejl',
  skipped: 'Email ikke konfigureret',
  pending: 'Afventer email'
};

const HistoryContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;

  h1 {
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  p {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 1.1rem;
  }
`;

const ControlsSection = styled.div`
  background: white;
  padding: 1.5rem;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  margin-bottom: 2rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
`;

const SearchBox = styled.div`
  position: relative;
  flex: 1;
  min-width: 250px;

  input {
    width: 100%;
    padding: 0.75rem 2.5rem 0.75rem 1rem;
    border: 2px solid ${props => props.theme.colors.gray[300]};
    border-radius: ${props => props.theme.borderRadius};
    font-size: 0.875rem;

    &:focus {
      border-color: ${props => props.theme.colors.primary};
      outline: none;
    }
  }

  .search-icon {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: ${props => props.theme.colors.gray[400]};
  }
`;

const FilterDropdown = styled.div`
  position: relative;

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: ${props => props.theme.colors.gray[100]};
    border: 2px solid ${props => props.theme.colors.gray[300]};
    border-radius: ${props => props.theme.borderRadius};
    color: ${props => props.theme.colors.gray[700]};
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: ${props => props.theme.colors.gray[200]};
    }
  }
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const HistoryCard = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  overflow: hidden;
  border-left: 4px solid ${props => {
    switch(props.decision) {
      case 'go': return props.theme.colors.success;
      case 'betinget-go': return props.theme.colors.warning;
      case 'no-go': return props.theme.colors.danger;
      default: return props.theme.colors.gray[300];
    }
  }};
`;

const CardHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
`;

const CardInfo = styled.div`
  flex: 1;

  h3 {
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.875rem;

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  }
`;

const DecisionBadge = styled.span`
  padding: 0.375rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props => {
    switch(props.decision) {
      case 'go': return props.theme.colors.success;
      case 'betinget-go': return props.theme.colors.warning;
      case 'no-go': return props.theme.colors.danger;
      default: return props.theme.colors.gray[400];
    }
  }};
  color: white;
`;

const RiskScore = styled.div`
  text-align: center;
  padding: 0.5rem;

  .score {
    font-size: 1.5rem;
    font-weight: 700;
    color: ${props => {
      if (props.score <= 30) return props.theme.colors.success;
      if (props.score <= 70) return props.theme.colors.warning;
      return props.theme.colors.danger;
    }};
  }

  .label {
    font-size: 0.75rem;
    color: ${props => props.theme.colors.gray[600]};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const CardActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled.button`
  padding: 0.5rem;
  background: ${props => props.variant === 'danger' ? props.theme.colors.danger : props.theme.colors.gray[100]};
  color: ${props => props.variant === 'danger' ? 'white' : props.theme.colors.gray[600]};
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.variant === 'danger' ? '#c53030' : props.theme.colors.gray[200]};
    color: ${props => props.variant === 'danger' ? 'white' : props.theme.colors.gray[800]};
  }
`;

const CardDetails = styled(motion.div)`
  padding: 1.5rem;
  background: ${props => props.theme.colors.gray[50]};
  border-top: 1px solid ${props => props.theme.colors.gray[200]};

  .summary {
    margin-bottom: 1rem;

    h4 {
      color: ${props => props.theme.colors.gray[800]};
      margin-bottom: 0.5rem;
    }

    p {
      color: ${props => props.theme.colors.gray[600]};
      line-height: 1.6;
    }
  }

  .evidence-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;

    .evidence-item {
      background: white;
      padding: 0.75rem;
      border-radius: ${props => props.theme.borderRadius};
      border-left: 3px solid ${props => props.theme.colors.primary};

      .evidence-title {
        font-weight: 600;
        color: ${props => props.theme.colors.gray[800]};
        font-size: 0.875rem;
        margin-bottom: 0.25rem;
      }

      .evidence-status {
        font-size: 0.75rem;
        color: ${props => props.theme.colors.gray[600]};
      }
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};

  .icon {
    font-size: 3rem;
    color: ${props => props.theme.colors.gray[400]};
    margin-bottom: 1rem;
  }

  h3 {
    color: ${props => props.theme.colors.gray[700]};
    margin-bottom: 0.5rem;
  }

  p {
    color: ${props => props.theme.colors.gray[500]};
  }
`;

const CasesSection = styled.section`
  margin-top: 3rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const CasesHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;

  h2 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
    color: ${props => props.theme.colors.gray[800]};
  }
`;

const CasesHeaderMeta = styled.span`
  color: ${props => props.theme.colors.gray[500]};
  font-size: 0.85rem;
`;

const CasesActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const CasesRefreshButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.9rem;
  border-radius: ${props => props.theme.borderRadius};
  border: 1px solid ${props => props.theme.colors.gray[300]};
  background: ${props => props.theme.colors.gray[100]};
  color: ${props => props.theme.colors.gray[700]};
  cursor: pointer;
  transition: ${props => props.theme.animations.transitionFast};

  &:hover {
    background: ${props => props.theme.colors.gray[200]};
    transform: translateY(-1px);
  }
`;

const CasesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
`;

const CaseCard = styled(motion.article)`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  border-left: 4px solid ${props => CASE_STATUS_COLORS[props.status] || props.theme.colors.primary};
  box-shadow: ${props => props.highlight ? props.theme.shadows.md : props.theme.shadows.sm};
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: ${props => props.theme.animations.transition};
`;

const CaseHeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
`;

const CaseTitle = styled.h3`
  margin: 0;
  color: ${props => props.theme.colors.gray[800]};
  font-size: 1.05rem;
`;

const CaseStatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${props => {
    switch (props.status) {
      case 'sent':
        return 'rgba(16, 185, 129, 0.18)';
      case 'failed':
        return 'rgba(239, 68, 68, 0.16)';
      case 'skipped':
        return 'rgba(99, 102, 241, 0.18)';
      default:
        return 'rgba(201, 68, 22, 0.15)';
    }
  }};
  color: ${props => CASE_STATUS_COLORS[props.status] || props.theme.colors.gray[700]};
`;

const CaseMetaInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: ${props => props.theme.colors.gray[600]};
  font-size: 0.85rem;
`;

const CaseDescription = styled.p`
  margin: 0;
  color: ${props => props.theme.colors.gray[600]};
  font-size: 0.9rem;
  line-height: 1.45;
`;

const HistoryPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [highlightCaseId, setHighlightCaseId] = useState(location.state?.highlightCaseId || null);
  const [assessments, setAssessments] = useState([]);
  const [filteredAssessments, setFilteredAssessments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCard, setExpandedCard] = useState(null);

  const {
    data: casesData = [],
    isLoading: casesLoading,
    isError: casesError,
    isFetching: casesFetching,
    refetch: refetchCases
  } = useQuery(['ai-cases'], fetchAiCases, {
    refetchOnWindowFocus: false,
    staleTime: 60_000
  });

  useEffect(() => {
    if (location.state?.highlightCaseId) {
      setHighlightCaseId(location.state.highlightCaseId);
      navigate(location.pathname, {
        replace: true,
        state: { ...location.state, highlightCaseId: undefined }
      });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!highlightCaseId) {
      return;
    }
    const timeout = setTimeout(() => setHighlightCaseId(null), 6000);
    return () => clearTimeout(timeout);
  }, [highlightCaseId]);

  // Filter assessments based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredAssessments(assessments);
    } else {
      const filtered = assessments.filter(assessment =>
        assessment.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        assessment.aiSystem.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredAssessments(filtered);
    }
  }, [searchTerm, assessments]);

  const casesLoadingState = casesLoading || casesFetching;

  const aiCases = useMemo(() => {
    return (casesData || []).map(item => ({
      ...item,
      createdAt: item.created_at ? new Date(item.created_at) : null,
    }));
  }, [casesData]);

  const toggleCardExpansion = (cardId) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  const handleDeleteAssessment = (id) => {
    if (window.confirm('Er du sikker på, at du vil slette denne analyse?')) {
      const updated = assessments.filter(assessment => assessment.id !== id);
      setAssessments(updated);
      setFilteredAssessments(updated);
    }
  };

  const getDecisionText = (decision) => {
    switch(decision) {
      case 'go': return 'GO';
      case 'betinget-go': return 'Betinget GO';
      case 'no-go': return 'NO-GO';
      default: return 'Ukendt';
    }
  };

  return (
    <HistoryContainer>
      <PageHeader>
        <h1><FaHistory /> Vurderingshistorik</h1>
        <p>Gennemse og administrer dine tidligere AI-compliance analyser</p>
      </PageHeader>

      <ControlsSection>
        <SearchBox>
          <input
            type="text"
            placeholder="Søg efter projektnavn eller AI-system type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <FaSearch className="search-icon" />
        </SearchBox>

        <FilterDropdown>
          <button>
            <FaFilter />
            Filter
            <FaChevronDown />
          </button>
        </FilterDropdown>
      </ControlsSection>

      {filteredAssessments.length === 0 ? (
        <EmptyState>
          <FaHistory className="icon" />
          <h3>Ingen assessments fundet</h3>
          <p>
            {searchTerm
              ? 'Prøv at justere dine søgekriterier eller clear søgefeltet.'
              : 'Der er endnu ikke registreret compliance analyser. Indsend AI-sager eller fulde vurderinger for at se dem her.'
            }
          </p>
        </EmptyState>
      ) : (
        <HistoryList>
          {filteredAssessments.map((assessment) => (
            <HistoryCard
              key={assessment.id}
              decision={assessment.decision}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardHeader>
                <CardInfo>
                  <h3>{assessment.projectName}</h3>
                  <div className="meta">
                    <div className="meta-item">
                      <FaCalendarAlt />
                      {format(assessment.date, 'dd MMM yyyy', { locale: da })}
                    </div>
                    <div className="meta-item">
                      AI System: {assessment.aiSystem}
                    </div>
                  </div>
                </CardInfo>

                <RiskScore score={assessment.riskScore}>
                  <div className="score">{assessment.riskScore}</div>
                  <div className="label">Risiko</div>
                </RiskScore>

                <DecisionBadge decision={assessment.decision}>
                  {getDecisionText(assessment.decision)}
                </DecisionBadge>

                <CardActions>
                  <ActionButton
                    onClick={() => toggleCardExpansion(assessment.id)}
                    title="Se detaljer"
                  >
                    {expandedCard === assessment.id ? <FaChevronUp /> : <FaEye />}
                  </ActionButton>
                  <ActionButton title="Download rapport">
                    <FaDownload />
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    onClick={() => handleDeleteAssessment(assessment.id)}
                    title="Slet analyse"
                  >
                    <FaTrash />
                  </ActionButton>
                </CardActions>
              </CardHeader>

              <AnimatePresence>
                {expandedCard === assessment.id && (
                  <CardDetails
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="summary">
                      <h4>Sammenfatning</h4>
                      <p>{assessment.summary}</p>
                    </div>

                    <div className="evidence-grid">
                      {assessment.evidence.map((item, index) => (
                        <div key={index} className="evidence-item">
                          <div className="evidence-title">{item.title}</div>
                          <div className="evidence-status">{item.status}</div>
                        </div>
                      ))}
                    </div>
                  </CardDetails>
                )}
              </AnimatePresence>
            </HistoryCard>
          ))}
        </HistoryList>
      )}

      <CasesSection>
        <CasesHeader>
          <div>
            <h2><FaBalanceScale /> AI Sager</h2>
            <CasesHeaderMeta>
              {casesLoadingState ? 'Opdaterer...' : `${aiCases.length} registrerede sager`}
            </CasesHeaderMeta>
          </div>
          <CasesActions>
            <CasesRefreshButton type="button" onClick={() => refetchCases()}>
              <FaRedo size={12} /> Opdater
            </CasesRefreshButton>
          </CasesActions>
        </CasesHeader>

        {casesLoadingState ? (
          <EmptyState>
            <FaClock className="icon" />
            <h3>Indlæser AI sager</h3>
            <p>Henter registrerede cases...</p>
          </EmptyState>
        ) : casesError ? (
          <EmptyState>
            <FaEnvelopeOpenText className="icon" />
            <h3>Kunne ikke hente AI sager</h3>
            <p>Prøv at opdatere eller kontakt supportteamet.</p>
          </EmptyState>
        ) : aiCases.length === 0 ? (
          <EmptyState>
            <FaEnvelopeOpenText className="icon" />
            <h3>Ingen AI sager endnu</h3>
            <p>Indsend din første sag via fanen AI Sager.</p>
          </EmptyState>
        ) : (
          <CasesGrid>
            {aiCases.map(item => (
              <CaseCard
                key={item.id}
                status={item.email_status}
                highlight={highlightCaseId === item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <CaseHeaderRow>
                  <CaseTitle>{item.title}</CaseTitle>
                  <CaseStatusBadge status={item.email_status}>
                    {CASE_STATUS_LABELS[item.email_status] || item.email_status}
                  </CaseStatusBadge>
                </CaseHeaderRow>
                {item.createdAt && (
                  <CaseMetaInfo>
                    <FaClock /> {item.createdAt.toLocaleString('da-DK')}
                  </CaseMetaInfo>
                )}
                <CaseDescription>{item.description}</CaseDescription>
              </CaseCard>
            ))}
          </CasesGrid>
        )}
      </CasesSection>
    </HistoryContainer>
  );
};

export default HistoryPage;
