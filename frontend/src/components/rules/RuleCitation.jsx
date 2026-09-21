import React from 'react';
import styled from 'styled-components';
import LawSourceLink from './LawSourceLink';

/**
 * RuleCitation — display block for a rule's source quotation.
 *
 * Renders the exact citat from the law as a styled blockquote, followed
 * by attribution and a clickable LawSourceLink. This is the primary
 * "show me the law" UI primitive in v3.
 *
 * Usage:
 *   <RuleCitation kilde={decision.kilde} />
 *   <RuleCitation kilde={decision.kilde} variant="compact" />
 */

const Block = styled.blockquote`
  margin: 0;
  padding: 1rem 1.25rem;
  border-left: 3px solid ${(p) => p.theme.colors.primary};
  background: ${(p) => p.theme.colors.surfaceAlt};
  border-radius: 0 ${(p) => p.theme.borderRadius} ${(p) => p.theme.borderRadius} 0;
  font-family: ${(p) => p.theme.fonts.main};
  color: ${(p) => p.theme.colors.text};
  line-height: 1.55;
`;

const CitatText = styled.p`
  margin: 0 0 0.75rem;
  font-size: ${(p) => (p.$compact ? '0.95rem' : '1.05rem')};
  font-style: italic;
  color: ${(p) => p.theme.colors.gray[700]};
`;

const Attribution = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const RuleId = styled.code`
  font-family: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.gray[500]};
  letter-spacing: 0.04em;
`;

const RuleCitation = ({ kilde, ruleId, variant = 'default' }) => {
  if (!kilde) return null;
  const compact = variant === 'compact';
  const citat = kilde.citat;

  return (
    <Block>
      {citat && <CitatText $compact={compact}>{`"${citat}"`}</CitatText>}
      <Attribution>
        <LawSourceLink kilde={kilde} compact={compact} />
        {ruleId && <RuleId>{ruleId}</RuleId>}
      </Attribution>
    </Block>
  );
};

export default RuleCitation;
