import React from 'react';
import styled from 'styled-components';
import { StatusPill, TextLink } from '../workflow/WorkflowUi';
import { modelLabel } from '../../utils/modelPresentation';
import { Metadata, OlderVersions, VersionCard, VersionHeader, VersionsPanel } from './CaseVersionsUi';
import { actorLabel, categoryLabel, normalizeTimestamp, NOT_RECORDED, recordedDate, records, safeInternalHref, statusLabel, statusTone, text, timestamp, versionLabel } from './caseVersionPresentation';

const HistoryList = styled.ol`
  list-style: none; margin: 18px 0 0; padding: 0;
  > li { border-top: 1px solid ${p => p.theme.colors.line}; padding: 21px 0; min-width: 0; }
  h4 { margin: 0; font-size: 1.04rem; line-height: 1.45; }
  p { margin: 9px 0; white-space: pre-wrap; }
`;
const Conditions = styled.ul`
  margin: 10px 0; padding-left: 22px;
  li { margin: 7px 0; font-size: .88rem; line-height: 1.6; }
`;
const Changes = styled.dl`
  margin: 16px 0; padding: 15px; background: ${p => p.theme.colors.paperSoft};
  > div + div { border-top: 1px solid ${p => p.theme.colors.line}; margin-top: 13px; padding-top: 13px; }
  dt { font-size: .8rem; font-weight: 650; }
  dd { margin: 7px 0 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; font-size: .84rem; line-height: 1.6; }
  small { display: block; font-size: .72rem; color: ${p => p.theme.colors.inkSoft}; }
  @media (max-width: 560px) { dd { grid-template-columns: minmax(0, 1fr); gap: 9px; } }
`;
const chronological = items => [...records(items)].sort((a, b) => timestamp(b.decided_at || b.occurred_at || b.created_at || b.requested_at) - timestamp(a.decided_at || a.occurred_at || a.created_at || a.requested_at));
const approvalType = value => ({ case: 'Sagsgodkendelse', deployment: 'Idriftsættelse', dpia: 'Konsekvensanalyse', dpia_assessment: 'Konsekvensanalyse', ai_act: 'AI Act', ai_act_assessment: 'AI Act', fria: 'Grundrettigheder', fria_assessment: 'Grundrettigheder' })[text(value)] || text(value).replace(/_/g, ' ') || NOT_RECORDED;
const eventLabel = item => ({
  status_changed: 'Sagens status blev ændret', reference_added: 'Et vurderingsgrundlag blev tilknyttet',
  measure_completed: 'En foranstaltning blev afsluttet', measure_added: 'En foranstaltning blev oprettet',
  measure_updated: 'En foranstaltning blev ændret', assessment_metadata_updated: 'Vurderingens oplysninger blev ændret',
  assessment_owner_changed: 'Vurderingens ejer blev ændret', approval_requested: 'Der blev anmodet om en beslutning',
  approval_decided: 'En beslutning blev registreret', document_linked: 'Et dokument blev tilknyttet',
  legal_reassessment_created: 'Genvurdering efter lovændring blev oprettet', legal_reassessment_resolved: 'Genvurdering efter lovændring blev afsluttet',
  assessment_created: item.actor_kind === 'ai' ? 'AI udarbejdede en vurderingsversion' : 'En vurderingsversion blev oprettet',
  assessment_ai_generated: 'AI udarbejdede en vurderingsversion', assessment_human_edited: 'En vurderingsversion blev fagligt redigeret',
  document_uploaded: 'En dokumentversion blev uploadet', material_ai_generated: 'AI analyserede sagens materiale', material_reviewed: 'Materialets oplysninger blev gennemgået',
  dpia_assessment_created: item.actor_kind === 'ai' ? 'AI udarbejdede en konsekvensanalyse' : 'En konsekvensanalyse blev oprettet',
})[text(item.event_type)] || text(item.title) || 'Registreret hændelse';
const fieldLabel = value => ({ question: 'Kontrolspørgsmål', notes: 'Noter og afklaring', owner: 'Ejer', assigned_to: 'Ansvarlig', status: 'Status', title: 'Titel', description: 'Beskrivelse', due_at: 'Frist', evidence_note: 'Dokumentation', version: 'Version', priority: 'Prioritet', review_at: 'Reviewdato' })[value] || value.replace(/_/g, ' ');
const displayValue = value => value === null || value === undefined || value === '' ? NOT_RECORDED : typeof value === 'boolean' ? value ? 'Ja' : 'Nej' : typeof value === 'object' ? JSON.stringify(value) : String(value);

function Reference({ reference }) {
  const id = text(reference.reference_id || reference.assessment_id || reference.id);
  const href = safeInternalHref(reference.href || reference.url);
  const label = `${text(reference.title) || categoryLabel(reference)}${text(reference.version || reference.source_version || reference.version_label) ? ` · ${versionLabel(reference)}` : ''}`;
  return <li>{href ? <TextLink href={href}>{label}</TextLink> : <strong>{label}</strong>}<p>Reference: {id || NOT_RECORDED}</p></li>;
}

function Approval({ item }) {
  const hasDecision = Boolean(item.decided_at) || ['approved', 'approved_with_conditions', 'rejected', 'changes_requested'].includes(item.status);
  const conditions = Array.isArray(item.conditions) ? item.conditions.map(condition => typeof condition === 'string' ? condition : text(condition?.text || condition?.description)).filter(Boolean) : text(item.conditions).split('\n').filter(Boolean);
  const references = records(item.decision_snapshot?.assessment_references);
  return <VersionCard aria-label={`${approvalType(item.approval_type)} · ${statusLabel(item.status)}`}>
    <VersionHeader><div><small>{approvalType(item.approval_type)}</small><h4>{statusLabel(item.status)}</h4></div><StatusPill $tone={statusTone(item.status)}>{hasDecision ? 'Beslutning registreret' : 'Anmodning'}</StatusPill></VersionHeader>
    <Metadata>
      <div><dt>Anmodet af</dt><dd>{actorLabel(item.requested_by)}</dd></div>
      <div><dt>Anmodet</dt><dd><time dateTime={normalizeTimestamp(item.requested_at) || undefined}>{recordedDate(item.requested_at)}</time></dd></div>
      <div><dt>Besluttet af</dt><dd>{hasDecision ? actorLabel(item.decided_by) : 'Afventer beslutning'}</dd></div>
      {hasDecision && <div><dt>Besluttet</dt><dd><time dateTime={normalizeTimestamp(item.decided_at) || undefined}>{recordedDate(item.decided_at)}</time></dd></div>}
    </Metadata>
    {hasDecision && <p>{item.is_identity_verified === true ? 'Beslutningstagerens identitet er Entra-verificeret.' : 'Beslutningstagerens identitet er ikke Entra-verificeret i denne registrering.'}</p>}
    {text(item.decision_snapshot?.note) && <><h4>Bemærkning ved anmodningen</h4><p>{text(item.decision_snapshot.note)}</p></>}
    {text(item.reason) && <><h4>Begrundelse</h4><p>{text(item.reason)}</p></>}
    {conditions.length > 0 && <><h4>Vilkår for beslutningen</h4><Conditions>{conditions.map((condition, index) => <li key={index}>{condition}</li>)}</Conditions></>}
    {(item.subject_reference_type || item.subject_reference_id) && <p>Beslutningen vedrører: {approvalType(item.subject_reference_type)} · {text(item.subject_reference_id) || NOT_RECORDED}</p>}
    {references.length > 0 && <OlderVersions><summary>Beslutningsgrundlag ({references.length} referencer)</summary><Conditions>{references.map((reference, index) => <Reference key={reference.reference_id || reference.id || index} reference={reference} />)}</Conditions></OlderVersions>}
  </VersionCard>;
}

function Event({ item }) {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  const before = item.before ?? payload.before;
  const after = item.after ?? payload.after;
  const hasChanges = Boolean((before && typeof before === 'object') || (after && typeof after === 'object'));
  const changedFields = hasChanges ? [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) : [];
  const kind = text(item.actor_kind) || 'unknown';
  const date = item.occurred_at || item.created_at;
  const actor = item.actor || item.changed_by;
  const model = text(item.model);
  const actorKind = ({ human: 'Menneskelig handling', ai: 'AI-kørsel eller AI-assisteret import', system: 'Automatisk arbejdsgang', unknown: 'Aktørtype ikke registreret' })[kind] || 'Aktørtype ikke registreret';
  const initiatedBy = text(item.initiated_by || payload.initiated_by);
  const detail = text(item.description || item.summary || item.reason || item.note || payload.description || payload.summary || payload.reason || payload.note || payload.evidence_note);
  const title = eventLabel(item);
  const context = text(item.title);
  const referenceId = text(item.assessment_id || item.target_id || payload.assessment_id || payload.reference_id || payload.source_reference_id);
  const referenceType = text(item.category || payload.reference_type || payload.source_reference_type);
  const fromStatus = item.from_status || payload.from_status;
  const toStatus = item.to_status || payload.to_status;
  return <li>
    <h4>{title}</h4>
    {context && context !== title && !context.startsWith('Status:') && <p>{context}</p>}
    <Metadata>
      <div><dt>Tidspunkt</dt><dd><time dateTime={normalizeTimestamp(date) || undefined}>{recordedDate(date)}</time></dd></div>
      <div><dt>Handlingstype</dt><dd>{actorKind}</dd></div>
      <div><dt>{kind === 'ai' ? 'AI / registreret aktør' : 'Udført af'}</dt><dd>{kind === 'ai' && model ? modelLabel(model) : actorLabel(actor, model)}</dd></div>
      {model && kind !== 'ai' && <div><dt>AI-model</dt><dd>{modelLabel(model)}</dd></div>}
      {kind === 'ai' && !model && <div><dt>AI-model</dt><dd>Ikke registreret</dd></div>}
      {initiatedBy && <div><dt>Igangsat af</dt><dd>{actorLabel(initiatedBy)}</dd></div>}
      {(item.version !== undefined || item.version_label || payload.version !== undefined || payload.version_label) && <div><dt>{item.event_type?.startsWith('human_control_') ? 'Kontrolpunktets version' : 'Vurderingsversion'}</dt><dd>{versionLabel({ ...payload, ...item })}</dd></div>}
    </Metadata>
    {(fromStatus || toStatus) && <p>Status: {statusLabel(fromStatus)} → {statusLabel(toStatus)}</p>}
    {detail && <p>{detail}</p>}
    {changedFields.length > 0 && <Changes aria-label="Registrerede ændringer">{changedFields.map(field => <div key={field}><dt>{fieldLabel(field)}</dt><dd><span><small>Før</small>{displayValue(before?.[field])}</span><span><small>Efter</small>{displayValue(after?.[field])}</span></dd></div>)}</Changes>}
    {referenceId && <p>Grundlag: {referenceType ? categoryLabel({ type: referenceType }) : 'Registreret reference'} · {referenceId}</p>}
  </li>;
}

export default function CaseHistoryTimeline({ approvals = [], timeline = [] }) {
  const decisions = chronological(approvals);
  const events = chronological(timeline);
  return <VersionsPanel aria-label="Beslutninger og revisionshistorik">
    <section aria-label="Menneskelige beslutninger"><h3>Anmodninger og menneskelige beslutninger</h3><p>Hvem bad om en beslutning, hvem traf den, og hvilke vilkår gælder? AI-kørsler vises separat i hændelsesforløbet.</p>
      {decisions.length ? decisions.map((item, index) => <Approval key={item.id || index} item={item} />) : <p>Ingen anmodninger eller menneskelige beslutninger er registreret.</p>}
    </section>
    <section aria-label="Hændelsesforløb"><h3>Hændelsesforløb</h3><p>Nyeste hændelse står først. En AI-kørsel eller et automatisk statusskift er ikke en menneskelig godkendelse.</p>
      {events.length ? <HistoryList>{events.map((item, index) => <Event key={`${item.event_type}-${item.id || index}`} item={item} />)}</HistoryList> : <p>Ingen hændelser er registreret endnu.</p>}
    </section>
  </VersionsPanel>;
}
