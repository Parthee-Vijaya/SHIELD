import React from 'react';
import styled from 'styled-components';
import { FaCheck } from 'react-icons/fa';

/**
 * EvidenceChecklist — renders the union of evidens_påkrævet across all
 * triggered rule decisions, marking each item as done/pending/blocked.
 *
 * The component is presentation-only. Status data is supplied by the
 * caller — typically by joining the union of required-evidence ids
 * against the current case's stored artifacts.
 *
 * Props:
 *   items:  [{ id, label?, status: 'done' | 'pending' | 'in_progress' | 'blocked', metadata? }]
 *   onToggle?: (id) => void   — optional click handler to flip done state
 *
 * If items is undefined, the component renders nothing.
 */

const STATUS_LABEL = {
  done: 'Godkendt',
  pending: 'Mangler',
  in_progress: 'Undervejs',
  blocked: 'Blokeret',
};

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  overflow: hidden;
`;

const Item = styled.li`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1rem;
  align-items: center;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};
  transition: background ${(p) => p.theme.animations.transitionFast};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${(p) => (p.$clickable ? p.theme.colors.surfaceAlt : 'transparent')};
  }
`;

const checkColors = {
  done: (theme) => theme.colors.success,
  pending: (theme) => theme.colors.gray[300],
  in_progress: (theme) => theme.colors.warning,
  blocked: (theme) => theme.colors.danger,
};

const CheckBox = styled.span`
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 2px solid ${(p) => checkColors[p.$status](p.theme)};
  background: ${(p) => (p.$status === 'done' ? checkColors.done(p.theme) : 'transparent')};
  color: ${(p) => (p.$status === 'done' ? p.theme.colors.white : 'transparent')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  flex-shrink: 0;
`;

const Label = styled.span`
  font-family: ${(p) => p.theme.fonts.main};
  font-size: 0.95rem;
  color: ${(p) => (p.$done ? p.theme.colors.gray[500] : p.theme.colors.text)};
  text-decoration: ${(p) => (p.$done ? 'line-through' : 'none')};
`;

const Meta = styled.span`
  font-family: ${(p) => p.theme.fonts.main};
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${(p) => checkColors[p.$status](p.theme)};
  white-space: nowrap;
`;

const EvidenceChecklist = ({ items, onToggle, className }) => {
  if (!items || items.length === 0) return null;

  return (
    <List className={className}>
      {items.map((item) => {
        const status = item.status || 'pending';
        const handleClick = onToggle ? () => onToggle(item.id) : undefined;
        return (
          <Item
            key={item.id}
            $clickable={Boolean(onToggle)}
            onClick={handleClick}
          >
            <CheckBox $status={status} aria-hidden="true">
              {status === 'done' && <FaCheck />}
            </CheckBox>
            <Label $done={status === 'done'}>
              {item.label || item.id}
              {item.metadata && (
                <span style={{ color: 'inherit', opacity: 0.6, marginLeft: 8 }}>
                  · {item.metadata}
                </span>
              )}
            </Label>
            <Meta $status={status}>{STATUS_LABEL[status] || status}</Meta>
          </Item>
        );
      })}
    </List>
  );
};

export default EvidenceChecklist;
