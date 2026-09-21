import React from 'react';
import styled, { keyframes } from 'styled-components';

const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`;

const SkeletonBase = styled.div`
  display: inline-block;
  height: ${props => props.height || '1rem'};
  width: ${props => props.width || '100%'};
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200px 100%;
  background-repeat: no-repeat;
  border-radius: ${props => props.borderRadius || '4px'};
  animation: ${shimmer} 1.2s ease-in-out infinite;
  margin: ${props => props.margin || '0'};
`;

const SkeletonText = styled(SkeletonBase)`
  height: ${props => {
    switch(props.variant) {
      case 'h1': return '2.5rem';
      case 'h2': return '2rem';
      case 'h3': return '1.5rem';
      case 'body1': return '1rem';
      case 'body2': return '0.875rem';
      case 'caption': return '0.75rem';
      default: return props.height || '1rem';
    }
  }};
  width: ${props => props.width || '100%'};
`;

const SkeletonAvatar = styled(SkeletonBase)`
  width: ${props => props.size || '40px'};
  height: ${props => props.size || '40px'};
  border-radius: ${props => props.variant === 'square' ? '4px' : '50%'};
`;

const SkeletonCard = styled.div`
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  padding: 1.5rem;
  border-radius: ${props => props.theme.borderRadiusLarge};
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: ${props => props.theme.shadows.glass};
  margin-bottom: 1rem;
`;

const SkeletonNewsItem = styled.div`
  border-bottom: 1px solid #e2e8f0;
  padding: 16px 0;

  &:last-child {
    border-bottom: none;
  }
`;

const SkeletonStatCard = styled(SkeletonCard)`
  .skeleton-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
`;

// Compound components for common patterns
export const NewsSkeletonLoader = ({ count = 3 }) => (
  <SkeletonCard>
    <div style={{ marginBottom: '1.5rem' }}>
      <SkeletonText variant="h2" width="60%" margin="0 0 0.5rem 0" />
      <SkeletonText variant="body2" width="40%" />
    </div>

    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      {[...Array(5)].map((_, i) => (
        <SkeletonBase key={i} height="28px" width="80px" borderRadius="14px" />
      ))}
    </div>

    {[...Array(count)].map((_, index) => (
      <SkeletonNewsItem key={index}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <SkeletonText variant="h3" width="70%" />
          <SkeletonBase height="24px" width="60px" borderRadius="12px" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '8px' }}>
          <SkeletonAvatar size="20px" variant="square" />
          <SkeletonText variant="body2" width="30%" />
        </div>
        <SkeletonText variant="body1" width="90%" margin="0 0 0.5rem 0" />
        <SkeletonText variant="body1" width="60%" />
      </SkeletonNewsItem>
    ))}
  </SkeletonCard>
);

export const StatCardSkeletonLoader = () => (
  <SkeletonStatCard>
    <div className="skeleton-header">
      <SkeletonAvatar size="50px" />
      <SkeletonText variant="body2" width="50px" />
    </div>
    <SkeletonText variant="h1" width="80px" margin="0 0 0.25rem 0" />
    <SkeletonText variant="body2" width="120px" />
  </SkeletonStatCard>
);

export const ChartSkeletonLoader = () => (
  <SkeletonCard>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
      <SkeletonText variant="h3" width="200px" />
      <SkeletonAvatar size="32px" variant="square" />
    </div>
    <SkeletonBase height="300px" width="100%" borderRadius="8px" />
  </SkeletonCard>
);

export const FeatureCardSkeletonLoader = () => (
  <SkeletonCard>
    <div style={{ textAlign: 'center' }}>
      <SkeletonAvatar size="70px" margin="0 auto 1.5rem" />
      <SkeletonText variant="h3" width="80%" margin="0 auto 1rem" />
      <SkeletonText variant="body1" width="100%" margin="0 0 0.5rem 0" />
      <SkeletonText variant="body1" width="90%" margin="0 0 0.5rem 0" />
      <SkeletonText variant="body1" width="70%" />
    </div>
  </SkeletonCard>
);

export const HistoryCardSkeletonLoader = () => (
  <SkeletonCard>
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <SkeletonText variant="h3" width="70%" margin="0 0 0.5rem 0" />
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
            <SkeletonText variant="body2" width="100px" />
            <SkeletonText variant="body2" width="120px" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <SkeletonText variant="h1" width="60px" height="60px" borderRadius="8px" />
          <SkeletonBase height="24px" width="80px" borderRadius="12px" />
        </div>
      </div>
    </div>
  </SkeletonCard>
);

// Base skeleton components for custom usage
export const Skeleton = {
  Text: SkeletonText,
  Avatar: SkeletonAvatar,
  Base: SkeletonBase,
  Card: SkeletonCard
};

export default Skeleton;