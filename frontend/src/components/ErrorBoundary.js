import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { FaExclamationTriangle, FaRedo, FaHome, FaEnvelope } from 'react-icons/fa';

const ErrorContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 2rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: ${props => props.theme.borderRadiusLarge};
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: ${props => props.theme.shadows.glass};
  margin: 2rem;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: ${props => props.theme.colors.gradients.glass};
    opacity: 0.5;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`;

const ErrorIcon = styled.div`
  background: ${props => props.theme.colors.gradients.danger};
  color: white;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2rem;
  font-size: 2rem;
  box-shadow: ${props => props.theme.shadows.xl};
  animation: pulse 2s infinite;

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
`;

const ErrorTitle = styled.h1`
  color: ${props => props.theme.colors.gray[800]};
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1rem;
`;

const ErrorMessage = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  font-size: 1.1rem;
  line-height: 1.6;
  margin-bottom: 2rem;
  max-width: 500px;
`;

const ErrorDetails = styled.details`
  margin: 1rem 0;
  padding: 1rem;
  background: ${props => props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius};
  border-left: 4px solid ${props => props.theme.colors.danger};
  text-align: left;
  max-width: 600px;
  width: 100%;

  summary {
    cursor: pointer;
    font-weight: 600;
    color: ${props => props.theme.colors.gray[700]};
    margin-bottom: 0.5rem;
  }

  pre {
    background: ${props => props.theme.colors.gray[100]};
    padding: 1rem;
    border-radius: ${props => props.theme.borderRadius};
    overflow-x: auto;
    font-size: 0.875rem;
    color: ${props => props.theme.colors.gray[800]};
    white-space: pre-wrap;
    word-break: break-all;
  }
`;

const ErrorActions = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 2rem;
`;

const ErrorButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  font-weight: 600;
  text-decoration: none;
  transition: ${props => props.theme.animations.transition};
  cursor: pointer;
  position: relative;
  overflow: hidden;

  &.primary {
    background: ${props => props.theme.colors.gradients.primary};
    color: white;

    &:hover {
      transform: translateY(-2px);
      box-shadow: ${props => props.theme.shadows.lg};
    }
  }

  &.secondary {
    background: ${props => props.theme.colors.gray[200]};
    color: ${props => props.theme.colors.gray[700]};

    &:hover {
      background: ${props => props.theme.colors.gray[300]};
      transform: translateY(-1px);
    }
  }

  &.link {
    background: transparent;
    color: ${props => props.theme.colors.primary};
    border: 2px solid ${props => props.theme.colors.primary};

    &:hover {
      background: ${props => props.theme.colors.primary};
      color: white;
      transform: translateY(-1px);
    }
  }
`;

const ErrorInfo = styled.div`
  background: ${props => props.theme.colors.gray[50]};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius};
  padding: 1rem;
  margin-top: 2rem;
  max-width: 500px;
  text-align: left;

  .info-title {
    font-weight: 600;
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .info-text {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.875rem;
    line-height: 1.5;
  }
`;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo,
      eventId: this.generateEventId()
    });

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // In production, you would send this to your error reporting service
    this.logErrorToService(error, errorInfo);
  }

  generateEventId = () => {
    return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  logErrorToService = (error, errorInfo) => {
    // Here you would integrate with services like Sentry, LogRocket, etc.
    console.log('Error logged with ID:', this.state.eventId);

    // Example: Send to your backend
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/log-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId: this.state.eventId,
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }),
      }).catch(() => {
        // Fail silently if error logging fails
      });
    }
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReportError = () => {
    const { error, eventId } = this.state;
    const subject = `Fejlrapport - ${eventId}`;
    const body = `
Hej S.H.I.E.L.D. supportteam,

Jeg stødte på en uventet fejl i systemet.

Event ID: ${eventId}
URL: ${window.location.href}
Tidspunkt: ${new Date().toLocaleString('da-DK')}

Fejlbesked: ${error?.message || 'Ingen specifik fejlbesked'}

Tak for jeres hjælp!

Venlig hilsen,
S.H.I.E.L.D.
    `.trim();

    window.location.href = `mailto:ServicePortalen@kalundborg.dk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, eventId } = this.state;
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <ErrorContainer
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <ErrorIcon>
            <FaExclamationTriangle />
          </ErrorIcon>

          <ErrorTitle>Noget gik galt</ErrorTitle>

          <ErrorMessage>
            Vi beklager, men der opstod en uventet fejl i S.H.I.E.L.D.
            Genindlæs siden, eller send en fejlrapport til Serviceportalen, hvis fejlen fortsætter.
          </ErrorMessage>

          {isDevelopment && error && (
            <ErrorDetails>
              <summary>Tekniske detaljer (kun synlig i udvikling)</summary>
              <pre>{error.toString()}</pre>
              {errorInfo && <pre>{errorInfo.componentStack}</pre>}
            </ErrorDetails>
          )}

          <ErrorActions>
            <ErrorButton className="primary" onClick={this.handleRetry}>
              <FaRedo />
              Prøv igen
            </ErrorButton>

            <ErrorButton className="secondary" onClick={this.handleGoHome}>
              <FaHome />
              Gå til forsiden
            </ErrorButton>

            <ErrorButton className="link" onClick={this.handleReportError}>
              <FaEnvelope />
              Rapporter fejl
            </ErrorButton>
          </ErrorActions>

          {eventId && (
            <ErrorInfo>
              <div className="info-title">
                <FaExclamationTriangle size={14} />
                Fejl-reference
              </div>
              <div className="info-text">
                Reference ID: <strong>{eventId}</strong><br />
                Denne ID kan bruges til support henvendelser.
              </div>
            </ErrorInfo>
          )}
        </ErrorContainer>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
