import React, { useState } from 'react';
import styled from 'styled-components';
import { FaInfoCircle, FaQuestionCircle } from 'react-icons/fa';

const TooltipWrapper = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`;

const TooltipTrigger = styled.div`
  display: inline-flex;
  align-items: center;
  cursor: help;
  color: ${props => props.theme.colors.info};
  margin-left: 0.35rem;
  font-size: 0.9rem;
  opacity: 0.7;
  transition: ${props => props.theme.animations.transitionFast};

  &:hover {
    opacity: 1;
    color: ${props => props.theme.colors.infoLight};
  }
`;

const TooltipContent = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: ${props => props.theme.mode === 'dark'
    ? props.theme.colors.gray[800]
    : props.theme.colors.gray[900]};
  color: ${props => props.theme.colors.white};
  padding: 0.75rem 1rem;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.lg};
  min-width: 220px;
  max-width: 320px;
  z-index: ${props => props.theme.zIndex?.tooltip || 700};
  font-size: 0.875rem;
  line-height: 1.5;
  opacity: ${props => props.$visible ? 1 : 0};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transition: opacity ${props => props.theme.animations.transitionFast},
              visibility ${props => props.theme.animations.transitionFast};
  pointer-events: none;
  white-space: normal;

  /* Arrow */
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 6px 6px 0 6px;
    border-color: ${props => props.theme.mode === 'dark'
      ? props.theme.colors.gray[800]
      : props.theme.colors.gray[900]} transparent transparent transparent;
  }

  /* Mobile positioning */
  @media (max-width: 640px) {
    left: auto;
    right: 0;
    transform: none;
    min-width: 200px;
    max-width: 280px;

    &::after {
      right: 1rem;
      left: auto;
      transform: none;
    }
  }
`;

const Tooltip = ({
  children,
  icon = 'info',
  placement = 'top',
  delay = 200
}) => {
  const [visible, setVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState(null);

  const handleMouseEnter = () => {
    const id = setTimeout(() => {
      setVisible(true);
    }, delay);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    setVisible(false);
  };

  const Icon = icon === 'question' ? FaQuestionCircle : FaInfoCircle;

  return (
    <TooltipWrapper
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      role="tooltip"
      aria-label={typeof children === 'string' ? children : 'Information'}
    >
      <TooltipTrigger tabIndex={0}>
        <Icon />
      </TooltipTrigger>
      <TooltipContent $visible={visible} role="tooltip">
        {children}
      </TooltipContent>
    </TooltipWrapper>
  );
};

export default Tooltip;
