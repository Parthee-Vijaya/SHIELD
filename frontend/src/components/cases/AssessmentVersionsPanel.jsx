import React from 'react';
import { SectionHeader, StatePanel, StatusPill, TextLink } from '../workflow/WorkflowUi';
import { Actions, BasicMetadata, GenerationMetadata, Metadata, OlderVersions, VersionCard, VersionGroup, VersionHeader, VersionsPanel } from './CaseVersionsUi';
import { assessmentGroups, assessmentHref, categoryKey, categoryLabel, itemTitle, statusLabel, statusTone, text, versionLabel } from './caseVersionPresentation';

function AssessmentVersion({ item, latest, caseRecord, renderOwnerEditor }) {
  const href = assessmentHref(item, caseRecord);
  const status = text(item.aggregate_status || item.status || item.result);
  const title = itemTitle(item);
  return <VersionCard $latest={latest} aria-label={`${title} · ${versionLabel(item)}`}>
    <VersionHeader>
      <div><small>{latest ? 'Seneste version' : 'Tidligere version'} · {versionLabel(item)}</small><h4>{title}</h4></div>
      <StatusPill $tone={statusTone(status)}>{statusLabel(status)}</StatusPill>
    </VersionHeader>
    <Metadata>
      <div><dt>Kategori</dt><dd>{categoryLabel(item)}</dd></div>
      <BasicMetadata item={item} />
      <GenerationMetadata item={item} />
    </Metadata>
    {renderOwnerEditor && renderOwnerEditor(item)}
    {text(item.summary || item.description) && <p>{text(item.summary || item.description)}</p>}
    {href && <Actions>
      <TextLink href={href}>Åbn denne vurdering →</TextLink>
      {categoryKey(item) === 'dpia' && <TextLink href={`${href}&view=readable`}>Læsevenlig udgave →</TextLink>}
    </Actions>}
  </VersionCard>;
}

export default function AssessmentVersionsPanel({ assessments = [], caseRecord = {}, renderOwnerEditor }) {
  const groups = assessmentGroups(assessments);
  return <VersionsPanel id="case-panel-assessments" role="tabpanel" aria-labelledby="case-tab-assessments">
    <SectionHeader data-tour="case-assessments"><div><h2>Vurderinger og versioner</h2><p>Seneste version står først i hvert vurderingsspor. Tidligere versioner bevares med deres eget grundlag, ansvar og tidspunkt.</p></div></SectionHeader>
    {groups.length ? groups.map(group => <VersionGroup key={group.key} aria-label={group.label}>
      <h3>{group.label}</h3>
      <AssessmentVersion item={group.entries[0]} latest caseRecord={caseRecord} renderOwnerEditor={renderOwnerEditor} />
      {group.entries.length > 1 && <OlderVersions><summary>Ældre versioner ({group.entries.length - 1})</summary>
        {group.entries.slice(1).map((item, index) => <AssessmentVersion key={item.id || item.reference_id || index} item={item} latest={false} caseRecord={caseRecord} renderOwnerEditor={renderOwnerEditor} />)}
      </OlderVersions>}
    </VersionGroup>) : <StatePanel><strong>Ingen vurderinger endnu</strong><p>Start en konsekvensanalyse, AI Act-vurdering eller juridisk screening fra sagen.</p></StatePanel>}
  </VersionsPanel>;
}
