import React from 'react';
import styled from 'styled-components';
import { modelLabel } from '../../utils/modelPresentation';
import { creatorLabel, generationLabel, generationModel, normalizeTimestamp, NOT_RECORDED, recordedDate, text } from './caseVersionPresentation';

export const VersionsPanel = styled.section`
  padding-top: 28px; min-width: 0; overflow-wrap: anywhere;
  h2 { margin: 0 0 9px; font-size: 1.55rem; }
  h3 { margin: 0; font-size: 1.1rem; line-height: 1.4; }
  p { font-size: .86rem; line-height: 1.65; color: ${p => p.theme.colors.inkSoft}; }
  summary { cursor: pointer; line-height: 1.6; font-size: .86rem; }
  summary:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; }
`;
export const VersionGroup = styled.section`
  margin: 26px 0; min-width: 0;
  > h3 { margin-bottom: 13px; }
`;
export const VersionCard = styled.article`
  min-width: 0; padding: clamp(17px, 3vw, 24px);
  border: 1px solid ${p => p.theme.colors.line};
  border-left: ${p => p.$latest ? '4px' : '1px'} solid ${p => p.$latest ? p.theme.colors.primary : p.theme.colors.line};
  background: ${p => p.$latest ? p.theme.colors.surface : p.theme.colors.paperSoft};
  margin: 12px 0;
  > p { margin: 13px 0; }
`;
export const VersionHeader = styled.div`
  display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 14px;
  > div { flex: 1 1 240px; min-width: 0; }
  > span { max-width: 100%; white-space: normal; line-height: 1.4; }
  h4 { margin: 5px 0 0; font-size: 1.15rem; line-height: 1.4; }
  small { display: block; font-size: .74rem; color: ${p => p.theme.colors.inkSoft}; }
`;
export const Metadata = styled.dl`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 17px 24px; margin: 20px 0;
  > div { min-width: 0; } dt { font-size: .73rem; color: ${p => p.theme.colors.inkFaded}; }
  dd { margin: 5px 0 0; font-size: .85rem; line-height: 1.55; white-space: pre-wrap; }
  dd small { display: block; margin-top: 5px; font-size: .74rem; color: ${p => p.theme.colors.inkSoft}; }
  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 450px) { grid-template-columns: minmax(0, 1fr); }
`;
export const Actions = styled.div`
  display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; margin-top: 16px;
  > * { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
`;
export const OlderVersions = styled.details`
  margin-top: 16px; border-top: 1px solid ${p => p.theme.colors.line}; padding-top: 14px;
  > summary { color: ${p => p.theme.colors.inkSoft}; font-weight: 600; }
`;
export function GenerationMetadata({ item }) {
  const model = generationModel(item);
  return <>
    <div><dt>Udarbejdelse</dt><dd>{generationLabel(item)}</dd></div>
    {model && <div><dt>{item.generation_kind === 'human_edited' ? 'AI-grundlag' : 'AI-model'}</dt><dd>{model}</dd></div>}
    <div><dt>{item.generation_kind === 'human_edited' ? 'Redigeret af' : item.generation_kind === 'ai_assisted' || item.generation_kind === 'rule_based' ? 'Igangsat af' : 'Registreret aktør'}</dt><dd>{creatorLabel(item)}</dd></div>
  </>;
}
export function BasicMetadata({ item }) {
  return <>
    <div><dt>Tidspunkt</dt><dd><time dateTime={normalizeTimestamp(item.created_at) || undefined}>{recordedDate(item.created_at)}</time></dd></div>
    <div><dt>Ejer</dt><dd>{text(item.owner) || NOT_RECORDED}{item.owner_assignment_kind === 'ai' && <small>Ejer foreslået med {text(item.owner_assignment_model) ? modelLabel(item.owner_assignment_model) : 'AI · model ikke registreret'}</small>}</dd></div>
  </>;
}
