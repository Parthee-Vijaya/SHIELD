import React from 'react';
import styled, { css } from 'styled-components';

/**
 * ComplianceVerdict — status label for a v3 rule_engine decision.
 *
 * Maps rule_engine Status values to themed colors:
 *   GO            -> success (green)
 *   BETINGET-GO   -> warning
 *   NO-GO         -> danger
 *   needs_input   -> muted gray (rule applies but predicates missing)
 *
 * Usage:
 *   <ComplianceVerdict status="BETINGET-GO" />
 *   <ComplianceVerdict status="NO-GO" size="lg" label="Forbudt under art. 5" />
 */

const statusStyles = {
  GO: css`
    background: ${(p) => p.theme.colors.successSoft};
    color: ${(p) => p.theme.colors.success};
    border-color: ${(p) => p.theme.colors.success};
  `,
  'BETINGET-GO': css`
    background: ${(p) => p.theme.colors.warningSoft};
    color: ${(p) => p.theme.colors.warning};
    border-color: ${(p) => p.theme.colors.warning};
  `,
  'NO-GO': css`
    background: ${(p) => p.theme.colors.dangerSoft};
    color: ${(p) => p.theme.colors.danger};
    border-color: ${(p) => p.theme.colors.danger};
  `,
  NEEDS_INPUT: css`
    background: ${(p) => p.theme.colors.surfaceAlt};
    color: ${(p) => p.theme.colors.textMuted};
    border-color: ${(p) => p.theme.colors.border};
  `,
};

const sizeStyles = {
  sm: css`
    padding: 3px 7px;
    font-size: 0.66rem;
  `,
  md: css`
    padding: 5px 10px;
    font-size: 0.72rem;
  `,
  lg: css`
    padding: 7px 14px;
    font-size: 0.8rem;
  `,
};

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  border: 1px solid;
  border-radius: 0;
  font-weight: 600;
  letter-spacing: 0.055em;
  line-height: 1.3;
  text-transform: uppercase;
  white-space: nowrap;
  font-family: ${(p) => p.theme.fonts.mono};
  ${(p) => sizeStyles[p.$size] || sizeStyles.md}
  ${(p) => statusStyles[p.$statusKey] || statusStyles.NEEDS_INPUT}
`;

const Dot = styled.span`
  width: 0.45em;
  height: 0.45em;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
`;

const STATUS_LABELS = {
  GO: 'Ingen blokeringer',
  'BETINGET-GO': 'Kræver handling',
  'NO-GO': 'Blokeret',
  NEEDS_INPUT: 'Mangler oplysninger',
};

const ComplianceVerdict = ({ status, label, size = 'md', withDot = true, className }) => {
  const key = String(status || 'NEEDS_INPUT').toUpperCase();
  const text = label || STATUS_LABELS[key] || key;
  return (
    <Pill
      $statusKey={key}
      $size={size}
      className={className}
      role="status"
      aria-label={`Status: ${text}`}
    >
      {withDot && <Dot aria-hidden="true" />}
      {text}
    </Pill>
  );
};

export default ComplianceVerdict;
