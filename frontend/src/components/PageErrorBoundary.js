import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { FaExclamationTriangle, FaRedo } from 'react-icons/fa';

const PageErrorContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: ${props => props.theme.borderRadius};
  border: 1px solid rgba(239, 68, 68, 0.2);
  margin: 1rem 0;
  min-height: 200px;
`;

const PageErrorIcon = styled.div`
  background: ${props => props.theme.colors.danger};
  color: white;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  font-size: 1.25rem;
`;

const PageErrorTitle = styled.h3`
  color: ${props => props.theme.colors.gray[800]};
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
`;

const PageErrorMessage = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
  max-width: 300px;
`;

const PageErrorButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props => props.theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: ${props => props.theme.animations.transition};

  &:hover {
    background: ${props => props.theme.colors.primaryDark};
    transform: translateY(-1px);
  }
`;

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for debugging
    console.error('PageErrorBoundary caught an error:', error, errorInfo);

    // You can also log to an error reporting service here
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <PageErrorContainer
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <PageErrorIcon>
            <FaExclamationTriangle />
          </PageErrorIcon>

          <PageErrorTitle>
            {this.props.title || 'Indlæsningsfejl'}
          </PageErrorTitle>

          <PageErrorMessage>
            {this.props.message || 'Der opstod en fejl ved indlæsning af denne sektion. Prøv venligst igen.'}
          </PageErrorMessage>

          <PageErrorButton onClick={this.handleRetry}>
            <FaRedo size={12} />
            Prøv igen
          </PageErrorButton>
        </PageErrorContainer>
      );
    }

    return this.props.children;
  }
}

export default PageErrorBoundary;