import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
  FaSpinner,
  FaServer,
  FaDatabase,
  FaSearch,
  FaRobot,
  FaChevronDown,
  FaChevronUp,
  FaLightbulb
} from 'react-icons/fa';
import axios from 'axios';

const statusPalette = (theme, status) => {
  const normalized = ['healthy', 'degraded', 'down'].includes(status) ? status : 'idle';
  const fallback = theme.colors.status?.idle || {
    background: theme.colors.surfaceAlt,
    border: theme.colors.border,
    text: theme.colors.text,
  };
  const palette = theme.colors.status?.[normalized] || fallback;
  return {
    background: palette.background || fallback.background,
    border: palette.border || fallback.border,
    text: palette.text || fallback.text,
  };
};

const Card = styled(motion.div)`
  background: transparent;
  padding: 0;
  margin-top: 1.5rem;
`;

const CardHeader = styled.div`
  display: none;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.6rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ServiceCard = styled(motion.div)`
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(15, 23, 42, 0.5)'
    : 'rgba(255, 255, 255, 0.7)'};
  border: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.15)'
    : 'rgba(148, 163, 184, 0.2)'};
  border-radius: ${props => props.theme.borderRadius};
  padding: 0.75rem;
  position: relative;
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.md};
    border-color: ${props => statusPalette(props.theme, props.$status).border};
  }

  .service-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    color: ${props => statusPalette(props.theme, props.$status).border};
    min-width: 2.5rem;
  }

  .service-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    flex: 1;
  }

  .service-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;

    h4 {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      color: ${props => props.theme.mode === 'dark'
        ? props.theme.colors.white
        : props.theme.colors.gray[800]};
    }
  }

  .service-details {
    display: flex;
    gap: 0.75rem;
    font-size: 0.7rem;
    color: ${props => props.theme.mode === 'dark'
      ? 'rgba(226, 232, 240, 0.6)'
      : 'rgba(71, 85, 105, 0.7)'};

    .detail-item {
      display: flex;
      gap: 0.25rem;

      .label {
        font-weight: 500;
        opacity: 0.7;
      }

      .value {
        font-weight: 600;
        font-family: 'Courier New', monospace;
      }
    }
  }

  .error-message {
    display: none;
  }
`;

const StatusValue = styled.span`
  color: ${props => statusPalette(props.theme, props.$status).border};
  font-family: 'Courier New', monospace;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 600;
  background: ${props => statusPalette(props.theme, props.$status).background};
  color: ${props => statusPalette(props.theme, props.$status).text};
  border: 1px solid ${props => statusPalette(props.theme, props.$status).border};
  letter-spacing: 0.03em;
  white-space: nowrap;

  &::before {
    content: '';
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${props => statusPalette(props.theme, props.$status).border};
    box-shadow: 0 0 0 2px ${props => statusPalette(props.theme, props.$status).background},
                0 0 6px ${props => statusPalette(props.theme, props.$status).border};
    animation: ${props => props.$status === 'healthy' ? 'pulse 2s ease-in-out infinite' : 'none'};
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
`;

const SolutionPanel = styled(motion.div)`
  background: linear-gradient(135deg, rgba(201, 68, 22, 0.05), rgba(232, 90, 40, 0.03));
  border: 1px solid rgba(201, 68, 22, 0.15);
  border-radius: 8px;
  padding: 1.5rem;
  margin-top: 1rem;

  .solution-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;

    svg {
      color: #C94416;
      font-size: 1.5rem;
    }

    h4 {
      margin: 0;
      color: ${props => props.theme.colors.gray[800]};
    }
  }

  .solution-content {
    font-size: 0.875rem;
    color: ${props => props.theme.colors.gray[700]};
    line-height: 1.6;

    h5 {
      margin: 1rem 0 0.5rem;
      color: ${props => props.theme.colors.gray[800]};
      font-size: 0.95rem;
    }

    ul {
      margin: 0.5rem 0;
      padding-left: 1.5rem;

      li {
        margin-bottom: 0.5rem;
      }
    }

    pre {
      background: ${props => props.theme.colors.gray[100]};
      padding: 0.75rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.8rem;
    }
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: ${props => props.theme.colors.gray[600]};
    font-style: italic;

    svg {
      animation: spin 1s linear infinite;
    }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props => props.theme.colors.primary};
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.theme.colors.primaryDark};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SystemHealthCard = () => {
  const [expanded, setExpanded] = useState(true);
  const [checking, setChecking] = useState(false);
  const [services, setServices] = useState({
    backend: { status: 'checking', responseTime: null, error: null },
    database: { status: 'checking', responseTime: null, error: null },
    websearch: { status: 'checking', responseTime: null, error: null },
    llm: { status: 'checking', responseTime: null, error: null }
  });
  const [aiSolution, setAiSolution] = useState(null);
  const [loadingSolution, setLoadingSolution] = useState(false);

  const checkHealth = async () => {
    setChecking(true);
    const results = {};

    // Check Backend
    try {
      const start = Date.now();
      const response = await axios.get('/api/version', { timeout: 5000 });
      const responseTime = Date.now() - start;
      results.backend = {
        status: response.status === 200 ? 'healthy' : 'degraded',
        responseTime,
        version: response.data.version,
        error: null
      };
    } catch (error) {
      results.backend = {
        status: 'down',
        responseTime: null,
        error: error.message,
        details: error.response?.data || null
      };
    }

    // Check Database
    try {
      const start = Date.now();
      const response = await axios.get('/api/health/database', { timeout: 5000 });
      const responseTime = Date.now() - start;
      results.database = {
        status: response.data.healthy ? 'healthy' : 'degraded',
        responseTime,
        error: null,
        records: response.data.record_count
      };
    } catch (error) {
      results.database = {
        status: 'down',
        responseTime: null,
        error: error.message
      };
    }

    // Check Web Search
    try {
      const start = Date.now();
      const response = await axios.post('/api/compliance/test-search', {
        query: 'GDPR test'
      }, { timeout: 10000 });
      const responseTime = Date.now() - start;
      results.websearch = {
        status: response.data.success ? 'healthy' : 'degraded',
        responseTime,
        error: null,
        resultsFound: response.data.results_count
      };
    } catch (error) {
      results.websearch = {
        status: 'down',
        responseTime: null,
        error: error.message
      };
    }

    // Check LLM
    try {
      const start = Date.now();
      const response = await axios.post('/api/compliance/test-llm', {
        prompt: 'Test'
      }, { timeout: 15000 });
      const responseTime = Date.now() - start;
      results.llm = {
        status: response.data.success ? 'healthy' : 'degraded',
        responseTime,
        error: null,
        model: response.data.model
      };
    } catch (error) {
      results.llm = {
        status: 'down',
        responseTime: null,
        error: error.message
      };
    }

    setServices(results);
    setChecking(false);

    // If any service is down, fetch AI solution
    const downServices = Object.entries(results).filter(([_, service]) => service.status === 'down');
    if (downServices.length > 0) {
      fetchAISolution(downServices);
    } else {
      setAiSolution(null);
    }
  };

  const fetchAISolution = async (downServices) => {
    setLoadingSolution(true);
    try {
      const serviceNames = downServices.map(([name, _]) => name).join(', ');
      const errors = downServices.map(([name, service]) => `${name}: ${service.error}`).join('; ');

      const response = await axios.post('/api/ai/diagnose-issue', {
        services: serviceNames,
        errors: errors,
        context: 'S.H.I.E.L.D. konsekvensanalysesystem'
      });

      setAiSolution(response.data.solution);
    } catch (error) {
      setAiSolution({
        diagnosis: 'Kunne ikke hente AI-løsning',
        steps: ['Tjek manuelt logs', 'Genstart services'],
        resources: []
      });
    } finally {
      setLoadingSolution(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status) => {
    if (status === 'healthy') return <FaCheckCircle />;
    if (status === 'degraded') return <FaExclamationTriangle />;
    if (status === 'down') return <FaTimesCircle />;
    return <FaSpinner />;
  };

  const getServiceIcon = (serviceName) => {
    if (serviceName === 'backend') return <FaServer />;
    if (serviceName === 'database') return <FaDatabase />;
    if (serviceName === 'websearch') return <FaSearch />;
    if (serviceName === 'llm') return <FaRobot />;
    return <FaServer />;
  };

  return (
    <Card
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <CardHeader onClick={() => setExpanded(!expanded)}>
        <h3>
          {checking ? <FaSpinner style={{ animation: 'spin 1s linear infinite' }} /> : getStatusIcon(
            Object.values(services).every(s => s.status === 'healthy') ? 'healthy' :
            Object.values(services).some(s => s.status === 'down') ? 'down' : 'degraded'
          )}
          System Status
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <RefreshButton onClick={(e) => { e.stopPropagation(); checkHealth(); }} disabled={checking}>
            <FaSpinner style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
            Opdater
          </RefreshButton>
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </div>
      </CardHeader>

      <StatusGrid>
        {Object.entries(services).map(([name, service]) => (
          <ServiceCard
            key={name}
            $status={service.status}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <div className="service-icon">
              {getServiceIcon(name)}
            </div>

            <div className="service-info">
              <div className="service-header">
                <h4>{name.charAt(0).toUpperCase() + name.slice(1)}</h4>
                <StatusBadge $status={service.status}>
                  {service.status === 'healthy' ? 'Online' :
                   service.status === 'degraded' ? 'Degraded' :
                   service.status === 'down' ? 'Offline' : 'Checking'}
                </StatusBadge>
              </div>

              <div className="service-details">
                {service.responseTime && (
                  <div className="detail-item">
                    <span className="label">Respons:</span>
                    <span className="value">{service.responseTime}ms</span>
                  </div>
                )}
                {service.model && (
                  <div className="detail-item">
                    <span className="label">Model:</span>
                    <span className="value">{service.model}</span>
                  </div>
                )}
                {service.version && (
                  <div className="detail-item">
                    <span className="label">Ver:</span>
                    <span className="value">{service.version}</span>
                  </div>
                )}
                {service.records !== undefined && (
                  <div className="detail-item">
                    <span className="label">Records:</span>
                    <span className="value">{service.records}</span>
                  </div>
                )}
              </div>
            </div>
          </ServiceCard>
        ))}
      </StatusGrid>
    </Card>
  );
};

export default SystemHealthCard;
