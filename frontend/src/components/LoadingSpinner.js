import React from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const LoadingContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${props => props.size === 'large' ? '4rem 2rem' : props.size === 'medium' ? '2rem' : '1rem'};
  text-align: center;

  ${props => props.overlay && `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    z-index: 9999;
  `}

  ${props => props.fullHeight && `
    min-height: 60vh;
  `}
`;

const SpinnerWrapper = styled.div`
  position: relative;
  display: inline-block;
  margin-bottom: ${props => props.showText ? '1rem' : '0'};
`;

const Spinner = styled.div`
  width: ${props => {
    switch(props.size) {
      case 'small': return '24px';
      case 'medium': return '48px';
      case 'large': return '64px';
      default: return '48px';
    }
  }};
  height: ${props => {
    switch(props.size) {
      case 'small': return '24px';
      case 'medium': return '48px';
      case 'large': return '64px';
      default: return '48px';
    }
  }};
  border: ${props => {
    const thickness = props.size === 'small' ? '2px' : props.size === 'large' ? '4px' : '3px';
    return `${thickness} solid ${props.theme.colors.gray[200]}`;
  }};
  border-top: ${props => {
    const thickness = props.size === 'small' ? '2px' : props.size === 'large' ? '4px' : '3px';
    return `${thickness} solid #C94416`;
  }};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;

  ${props => props.variant === 'juridical' && `
    border-top-color: ${props.theme.colors.juridical.gold};
    box-shadow: 0 0 20px rgba(184, 134, 11, 0.3);
  `}
`;

const DotsSpinner = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;

  .dot {
    width: ${props => props.size === 'small' ? '6px' : props.size === 'large' ? '12px' : '8px'};
    height: ${props => props.size === 'small' ? '6px' : props.size === 'large' ? '12px' : '8px'};
    background: #C94416;
    border-radius: 50%;
    animation: ${pulse} 1.2s ease-in-out infinite;

    &:nth-child(1) { animation-delay: 0s; }
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }

  ${props => props.variant === 'juridical' && `
    .dot {
      background: ${props.theme.colors.juridical.gold};
    }
  `}
`;

const ProgressBar = styled.div`
  width: 100%;
  max-width: 300px;
  height: 4px;
  background: ${props => props.theme.colors.gray[200]};
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 1rem;

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #C94416 0%, #E85A28 50%, #C94416 100%);
    background-size: 200% 100%;
    border-radius: 2px;
    animation: ${spin} 1.5s ease-in-out infinite;
    transform-origin: center;
  }
`;

const LoadingText = styled.div`
  color: ${props => props.theme.colors.gray[600]};
  font-size: ${props => {
    switch(props.size) {
      case 'small': return '0.875rem';
      case 'medium': return '1rem';
      case 'large': return '1.125rem';
      default: return '1rem';
    }
  }};
  font-weight: 500;

  .primary-text {
    color: ${props => props.theme.colors.gray[800]};
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .secondary-text {
    font-size: 0.875rem;
    opacity: 0.8;
  }
`;

const JuridicalSpinner = styled.div`
  position: relative;
  width: ${props => props.size === 'small' ? '32px' : props.size === 'large' ? '72px' : '56px'};
  height: ${props => props.size === 'small' ? '32px' : props.size === 'large' ? '72px' : '56px'};

  .outer-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: ${props => props.size === 'small' ? '2px' : '3px'} solid transparent;
    border-top: ${props => props.size === 'small' ? '2px' : '3px'} solid ${props => props.theme.colors.juridical.gold};
    border-radius: 50%;
    animation: ${spin} 1s linear infinite;
  }

  .inner-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 70%;
    height: 70%;
    border: ${props => props.size === 'small' ? '1px' : '2px'} solid transparent;
    border-bottom: ${props => props.size === 'small' ? '1px' : '2px'} solid #C94416;
    border-radius: 50%;
    animation: ${spin} 1.5s linear infinite reverse;
  }

  .center-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${props => props.size === 'small' ? '4px' : props.size === 'large' ? '8px' : '6px'};
    height: ${props => props.size === 'small' ? '4px' : props.size === 'large' ? '8px' : '6px'};
    background: ${props => props.theme.colors.juridical.lightGold};
    border-radius: 50%;
    animation: ${pulse} 2s ease-in-out infinite;
  }
`;

const LoadingSpinner = ({
  size = 'medium',
  variant = 'circular',
  text = null,
  subText = null,
  overlay = false,
  fullHeight = false,
  showProgress = false,
  className = '',
  ...props
}) => {
  const renderSpinner = () => {
    switch (variant) {
      case 'dots':
        return (
          <DotsSpinner size={size} variant={variant}>
            <div className="dot" />
            <div className="dot" />
            <div className="dot" />
          </DotsSpinner>
        );

      case 'juridical':
        return (
          <JuridicalSpinner size={size}>
            <div className="outer-ring" />
            <div className="inner-ring" />
            <div className="center-dot" />
          </JuridicalSpinner>
        );

      case 'progress':
        return (
          <ProgressBar>
            <div className="progress-fill" />
          </ProgressBar>
        );

      default:
        return <Spinner size={size} variant={variant} />;
    }
  };

  return (
    <LoadingContainer
      size={size}
      overlay={overlay}
      fullHeight={fullHeight}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      {...props}
    >
      <SpinnerWrapper showText={text || subText}>
        {renderSpinner()}
      </SpinnerWrapper>

      {(text || subText) && (
        <LoadingText size={size}>
          {text && <div className="primary-text">{text}</div>}
          {subText && <div className="secondary-text">{subText}</div>}
        </LoadingText>
      )}
    </LoadingContainer>
  );
};

// Convenience components for specific use cases
export const FullPageLoader = (props) => (
  <LoadingSpinner
    size="large"
    variant="juridical"
    overlay={true}
    text="Indlæser..."
    subText="S.H.I.E.L.D. forbereder data"
    {...props}
  />
);

export const SectionLoader = (props) => (
  <LoadingSpinner
    size="medium"
    variant="circular"
    fullHeight={true}
    text="Indlæser sektion..."
    {...props}
  />
);

export const ButtonLoader = (props) => (
  <LoadingSpinner
    size="small"
    variant="circular"
    {...props}
  />
);

export const InlineLoader = (props) => (
  <LoadingSpinner
    size="small"
    variant="dots"
    {...props}
  />
);

export default LoadingSpinner;
