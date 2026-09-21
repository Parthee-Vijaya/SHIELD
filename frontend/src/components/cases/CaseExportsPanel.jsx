import React from 'react';
import { Button, ErrorPanel, SectionHeader, StatePanel } from '../workflow/WorkflowUi';
import { Actions, BasicMetadata, GenerationMetadata, Metadata, OlderVersions, VersionCard, VersionGroup, VersionHeader, VersionsPanel } from './CaseVersionsUi';
import { assessmentGroups, categoryKey, exportGroups, formatLabel, itemTitle, safeDownloadHref, text, versionLabel } from './caseVersionPresentation';

function ExportVersion({ item, latest, onDownload, isDownloading }) {
  const liveBundle = categoryKey(item) === 'case_bundle';
  const formats = [...item.formats].sort((a, b) => ['docx', 'xlsx', 'pdf', 'json'].indexOf(a.format) - ['docx', 'xlsx', 'pdf', 'json'].indexOf(b.format));
  return <VersionCard $latest={latest} aria-label={`Eksport · ${itemTitle(item)} · ${versionLabel(item)}`}>
    <VersionHeader><div><small>{liveBundle ? 'Samlet sagstilstand' : latest ? 'Seneste version' : 'Tidligere version'} · {versionLabel(item)}</small><h4>{itemTitle(item)}</h4></div></VersionHeader>
    <Metadata>{liveBundle ? <><div><dt>Indhold</dt><dd>Vurderinger, dokumentreferencer, opgaver, kontrolpunkter og historik</dd></div><div><dt>Oprettelse</dt><dd>Samles automatisk ved download</dd></div></> : <><BasicMetadata item={item} /><GenerationMetadata item={item} /></>}</Metadata>
    {liveBundle ? <p>Sagspakken dannes ved download og indeholder den aktuelle sagstilstand. Revisions-ID kan ændre sig, hvis sagen opdateres.</p> : <p>Vælg filformat for den samme gemte version. Et andet filformat opretter ikke en ny vurdering.</p>}
    <Actions>{formats.map((format, index) => {
      const href = safeDownloadHref(format.href || format.url);
      return <Button key={`${format.format}-${index}`} type="button" disabled={isDownloading || !href || !onDownload}
        aria-label={`Hent ${formatLabel(format)} · ${versionLabel(item)} · ${itemTitle(item)}`}
        onClick={() => onDownload({ href, filename: text(format.download_name) || `shield-${categoryKey(item)}-${text(item.version || item.revision_id || item.assessment_id) || 'vurdering'}.${text(format.format) || 'bin'}` })}>
        {isDownloading ? `Henter… ${formatLabel(format)}` : formatLabel(format)}
      </Button>;
    })}</Actions>
    {formats.some(format => !safeDownloadHref(format.href || format.url)) && <p>Et eller flere filformater mangler et gyldigt downloadlink.</p>}
  </VersionCard>;
}

export default function CaseExportsPanel({ exports: exportItems = [], onDownload, isDownloading = false, downloadError = null }) {
  const groups = assessmentGroups(exportGroups(exportItems));
  const error = typeof downloadError === 'string' ? downloadError : text(downloadError?.response?.data?.detail?.message || downloadError?.response?.data?.detail || downloadError?.message);
  return <VersionsPanel id="case-panel-exports" role="tabpanel" aria-labelledby="case-tab-exports">
    <SectionHeader data-tour="case-exports"><div><h2>Eksportér en bestemt version</h2><p>Word, Excel og JSON vises samlet, når de vedrører samme dokumenterede grundlag. Kontrollér version og tidspunkt før deling.</p></div></SectionHeader>
    {groups.length ? groups.map(group => <VersionGroup key={group.key} aria-label={`Eksport: ${group.label}`}>
      <h3>{group.label}</h3>
      <ExportVersion item={group.entries[0]} latest onDownload={onDownload} isDownloading={isDownloading} />
      {group.entries.length > 1 && <OlderVersions><summary>Ældre eksportversioner ({group.entries.length - 1})</summary>{group.entries.slice(1).map(item => <ExportVersion key={item.key} item={item} latest={false} onDownload={onDownload} isDownloading={isDownloading} />)}</OlderVersions>}
    </VersionGroup>) : <StatePanel><strong>Ingen eksport klar</strong><p>Eksport bliver tilgængelig, når sagen har et dokumenteret vurderingsgrundlag.</p></StatePanel>}
    {downloadError && <ErrorPanel role="alert"><strong>Eksporten kunne ikke hentes</strong><p>{error || 'Prøv igen. Filen er ikke hentet.'}</p></ErrorPanel>}
  </VersionsPanel>;
}
