import React from 'react';
import styled from 'styled-components';
import ComplianceVerdict from './ComplianceVerdict';
import RuleCitation from './RuleCitation';

/**
 * RuleDecisionPanel — wraps a single v3 RuleDecision into a ready-to-use
 * presentation block: header (rule title + status pill), the source
 * citation, and the krav (requirements) list.
 *
 * Designed to take a v3 rule_engine RuleDecision JSON directly:
 *   {
 *     rule_id, triggered, status, outcome: { krav, evidens_påkrævet, begrundelse },
 *     kilde: { lov, artikel, citat, url, sidst_verificeret },
 *     needs_input: [...],
 *     evaluation_log: [...]
 *   }
 *
 * Props:
 *   decision (required) — a RuleDecision object
 *   title?              — optional human-readable rule title
 *                         (falls back to the artikel from kilde)
 */

const Panel = styled.section`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
  letter-spacing: -0.01em;
  line-height: 1.35;
`;

const Begrundelse = styled.p`
  margin: 0;
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.gray[700]};
  line-height: 1.5;
`;

const RequirementsBlock = styled.div`
  background: ${(p) => p.theme.colors.surfaceAlt};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1rem 1.25rem;
`;

const RequirementsHeader = styled.div`
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${(p) => p.theme.colors.textMuted};
  font-weight: 600;
  margin-bottom: 0.6rem;
`;

const RequirementList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const RequirementItem = styled.li`
  display: grid;
  grid-template-columns: 1.25rem 1fr;
  gap: 0.5rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: ${(p) => p.theme.colors.text};

  &::before {
    content: '§';
    color: ${(p) => p.theme.colors.primary};
    font-weight: 600;
    text-align: center;
  }
`;

const NeedsInputBox = styled.div`
  background: ${(p) => p.theme.colors.warning}1a;
  border: 1px solid ${(p) => p.theme.colors.warning};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 0.85rem 1rem;
  font-size: 0.9rem;
  color: ${(p) => p.theme.colors.gray[800]};
`;

const NeedsInputList = styled.ul`
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  font-family: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.gray[700]};
`;

const RuleDecisionPanel = ({ decision, title }) => {
  if (!decision) return null;

  const {
    rule_id,
    triggered,
    status,
    outcome,
    kilde,
    needs_input,
  } = decision;

  if (!triggered) {
    // Untriggered rules don't deserve a panel — caller should filter
    // them out unless showing a debug view.
    return null;
  }

  const headerTitle =
    title ||
    (kilde && (kilde.artikel || kilde.lov)) ||
    rule_id;

  return (
    <Panel>
      <Header>
        <Title>{headerTitle}</Title>
        <ComplianceVerdict status={status || 'NEEDS_INPUT'} />
      </Header>

      <RuleCitation kilde={kilde} ruleId={rule_id} />

      {outcome?.begrundelse && <Begrundelse>{outcome.begrundelse}</Begrundelse>}

      {outcome?.krav && outcome.krav.length > 0 && (
        <RequirementsBlock>
          <RequirementsHeader>Krav for compliance</RequirementsHeader>
          <RequirementList>
            {outcome.krav.map((krav, idx) => (
              <RequirementItem key={idx}>
                <span>{krav}</span>
              </RequirementItem>
            ))}
          </RequirementList>
        </RequirementsBlock>
      )}

      {needs_input && needs_input.length > 0 && (
        <NeedsInputBox>
          <strong>Mangler svar på {needs_input.length} predikat(er):</strong>
          <NeedsInputList>
            {needs_input.map((pid) => (
              <li key={pid}>{pid}</li>
            ))}
          </NeedsInputList>
        </NeedsInputBox>
      )}
    </Panel>
  );
};

export default RuleDecisionPanel;
