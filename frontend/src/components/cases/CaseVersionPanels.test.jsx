import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import AssessmentVersionsPanel from './AssessmentVersionsPanel';
import CaseExportsPanel from './CaseExportsPanel';
import CaseHistoryTimeline from './CaseHistoryTimeline';
import { actorLabel, assessmentGroups, exportGroups, normalizeTimestamp, recordedDate, safeDownloadHref, timestamp, versionLabel } from './caseVersionPresentation';

const mount = element => render(<ThemeProvider theme={lightTheme}>{element}</ThemeProvider>);
const assessment = { id: 'a3', category: 'dpia', category_label: 'Konsekvensanalyse og risikovurdering', project_name: 'Kommunal mødeassistent', version: 3, is_latest: true, owner: 'Systemejer', created_by: 'Sagsbehandler', generation_kind: 'ai_assisted', model: 'gpt-5.6-sol', created_at: '2026-09-21T10:00:00Z', status: 'requires_action' };
const exported = { category: 'dpia', category_label: 'Konsekvensanalyse og risikovurdering', group_id: 'dpia:a3', assessment_id: 'a3', title: 'Kommunal mødeassistent', version: 3, is_latest: true, owner: 'Systemejer', created_at: '2026-09-21T10:00:00Z', generation_kind: 'ai_assisted', model: 'gpt-5.6-sol', created_by: 'Sagsbehandler' };

test('historiske UTC-tidspunkter uden offset vises og sorteres som eksplicit UTC', () => {
  expect(recordedDate('2026-09-21T10:00:00')).toBe(recordedDate('2026-09-21T10:00:00Z'));
  expect(timestamp('2026-09-21T10:00:00.123456')).toBe(timestamp('2026-09-21T10:00:00.123456Z'));
  expect(recordedDate('2026-09-21T12:00:00+02:00')).toBe(recordedDate('2026-09-21T10:00:00Z'));
  expect(normalizeTimestamp('2026-09-21')).toBe('2026-09-21');
  expect(recordedDate('2026-09-21')).toBe('21. sep. 2026');
});

test('seneste vurdering i hvert spor fremhæves mens ældre versioner bevares bag udfoldning', () => {
  const items = [{ ...assessment, id: 'a1', version: 1, is_latest: false }, assessment, { id: 'ai-1', category: 'ai_act', title: 'AI Act-spor', version: 1 }];
  const before = JSON.stringify(items);
  mount(<AssessmentVersionsPanel assessments={items} caseRecord={{ id: 'case-1' }} />);
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.getByRole('article', { name: 'Kommunal mødeassistent · Version 1' })).not.toBeVisible();
  const latest = screen.getByRole('article', { name: 'Kommunal mødeassistent · Version 3' });
  expect(within(latest).getByText('Seneste version · Version 3')).toBeInTheDocument();
  expect(within(latest).getByText('Systemejer')).toBeInTheDocument();
  expect(within(latest).getByText('Sagsbehandler')).toBeInTheDocument();
  expect(within(latest).getByText('GPT-5.6 Sol')).toBeInTheDocument();
  expect(within(latest).getByRole('link', { name: 'Læsevenlig udgave →' })).toHaveAttribute('href', '/vurdering?assessment_id=a3&case=case-1&view=readable');
  fireEvent.click(screen.getByText('Ældre versioner (1)'));
  expect(screen.getByRole('article', { name: 'Kommunal mødeassistent · Version 1' })).toBeVisible();
  expect(JSON.stringify(items)).toBe(before);
});

test('faglig redigering adskilles fra AI-grundlaget og root kan indsætte ejereditor pr. version', () => {
  const renderOwnerEditor = jest.fn(item => <button>Redigér ejer {item.id}</button>);
  mount(<AssessmentVersionsPanel assessments={[{ ...assessment, generation_kind: 'human_edited', model: null, source_ai_model: 'gpt-5.6-sol', created_by: 'Jurist' }]} renderOwnerEditor={renderOwnerEditor} />);
  expect(screen.getByText('Fagligt redigeret af et menneske')).toBeInTheDocument();
  expect(screen.getByText('Redigeret af')).toBeInTheDocument();
  expect(screen.getByText('AI-grundlag')).toBeInTheDocument();
  expect(screen.getByText('GPT-5.6 Sol')).toBeInTheDocument();
  expect(screen.getByText('Jurist')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Redigér ejer a3' })).toBeInTheDocument();
  expect(renderOwnerEditor).toHaveBeenCalledWith(expect.objectContaining({ id: 'a3' }));
});

test('AI-foreslået ejer har særskilt modelangivelse og bliver ikke rapportens ophav', () => {
  mount(<AssessmentVersionsPanel assessments={[{ ...assessment, owner: 'Rolle til afklaring', owner_assignment_kind: 'ai', owner_assignment_model: 'gpt-6-astra' }]} />);
  expect(screen.getByText('Ejer foreslået med GPT-6 Astra')).toBeInTheDocument();
  expect(screen.getByText('GPT-5.6 Sol')).toBeInTheDocument();
  expect(screen.getByText('Sagsbehandler')).toBeInTheDocument();
});

test('historiske vurderinger får ikke opdigtet version, dato eller ejer som aktør', () => {
  mount(<AssessmentVersionsPanel assessments={[{ id: 'old', type: 'legal_screening', title: 'Historisk vurdering', owner: 'Kendt ejer' }]} />);
  expect(screen.getByText('Seneste version · Version ikke registreret')).toBeInTheDocument();
  expect(screen.getByText('Kendt ejer')).toBeInTheDocument();
  expect(screen.getAllByText('Ikke registreret').length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByText('System')).not.toBeInTheDocument();
  expect(versionLabel({ source_version: '2.1' })).toBe('Version 2.1');
});

test('versionssortering er pr. kategori og prioriterer eksplicit seneste markering', () => {
  const groups = assessmentGroups([{ ...assessment, version: 9, is_latest: false }, { ...assessment, version: 3, is_latest: true }, { id: 'b', type: 'ai_act_assessment', version: 1 }]);
  expect(groups.find(group => group.key === 'dpia').entries.map(item => item.version)).toEqual([3, 9]);
  expect(groups.find(group => group.key === 'ai_act').entries).toHaveLength(1);
});

test('Word og JSON for samme snapshot grupperes og downloader via beskyttet callback', () => {
  const onDownload = jest.fn();
  const items = [
    { ...exported, type: 'dpia_docx', format: 'docx', href: '/api/dpia/assessments/a3/export.docx', download_name: 'moedeassistent-v3.docx' },
    { ...exported, type: 'dpia_json', format: 'json', href: '/api/dpia/assessments/a3/export.json' },
  ];
  mount(<CaseExportsPanel exports={items} onDownload={onDownload} />);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('GPT-5.6 Sol')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Hent Word/ }));
  expect(onDownload).toHaveBeenCalledWith({ href: '/api/dpia/assessments/a3/export.docx', filename: 'moedeassistent-v3.docx' });
  expect(screen.getByRole('button', { name: /Hent JSON/ })).toBeInTheDocument();
});

test('ens titler og tidspunkter sammenlægger ikke forskellige eksportversioner', () => {
  const old = { ...exported, group_id: 'dpia:a2', assessment_id: 'a2', version: 2, is_latest: false };
  const items = [exported, old].flatMap(item => ['docx', 'xlsx'].map(format => ({ ...item, format, href: `/api/dpia/assessments/${item.assessment_id}/export.${format}` })));
  expect(exportGroups(items)).toHaveLength(2);
  mount(<CaseExportsPanel exports={items} onDownload={jest.fn()} />);
  expect(screen.getByRole('article', { name: 'Eksport · Kommunal mødeassistent · Version 2' })).not.toBeVisible();
  fireEvent.click(screen.getByText('Ældre eksportversioner (1)'));
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('button', { name: /Hent Excel.*Version 2/ })).toBeInTheDocument();
});

test('historisk eksport bruger snapshot-ID fra href men gætter ikke på identiske navne', () => {
  expect(exportGroups([{ type: 'procurement_review', format: 'docx', href: '/api/v3/cases/c1/procurement/reviews/r1/export.docx' }, { type: 'procurement_review', format: 'json', href: '/api/v3/cases/c1/procurement/reviews/r1/export.json' }])).toHaveLength(1);
  expect(exportGroups([{ title: 'Samme titel' }, { title: 'Samme titel' }])).toHaveLength(2);
});

test('levende sagspakke har revisions-ID uden at foregive en historisk låst version', () => {
  mount(<CaseExportsPanel exports={[{ type: 'case_bundle', group_id: 'case:c1', revision_id: 'abc123', title: 'Samlet sagspakke', format: 'json', href: '/api/v3/cases/c1/export.json' }]} onDownload={jest.fn()} />);
  expect(screen.getByText('Samlet sagstilstand · Revision abc123')).toBeInTheDocument();
  expect(screen.getByText(/Sagspakken dannes ved download/)).toBeInTheDocument();
  expect(screen.queryByText(/Version 1/)).not.toBeInTheDocument();
});

test('downloadfejl og igangværende download vises og usikre links kan ikke kaldes', () => {
  const download = jest.fn();
  mount(<CaseExportsPanel exports={[{ ...exported, format: 'docx', href: 'https://outside.example/secret' }]} onDownload={download} downloadError={new Error('Ingen adgang')} />);
  expect(screen.getByRole('button', { name: /Hent Word/ })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Ingen adgang');
  expect(download).not.toHaveBeenCalled();
  expect(safeDownloadHref('//outside.example/a')).toBeNull();
  expect(safeDownloadHref('/\\outside.example/a')).toBeNull();
  // A hostile scheme is deliberately supplied to verify download rejection.
  // eslint-disable-next-line no-script-url
  expect(safeDownloadHref('javascript:alert(1)')).toBeNull();
});

test('beslutninger viser anmodning, afgørelse, vilkår og versionsbundet grundlag hver for sig', () => {
  mount(<CaseHistoryTimeline approvals={[{ id: 'approval-1', approval_type: 'dpia', status: 'approved_with_conditions', requested_by: 'Sagsbehandler', requested_at: '2026-09-20T08:00:00Z', decided_by: 'Jurist', decided_at: '2026-09-21T09:00:00Z', reason: 'Kun til afgrænset pilot.', conditions: ['Slettekontrol før opstart.'], is_identity_verified: false, subject_reference_type: 'dpia', subject_reference_id: 'a3', decision_snapshot: { note: 'Gennemgå slettefristen.', assessment_references: [{ reference_type: 'dpia_assessment', reference_id: 'a3', title: 'Kommunal mødeassistent', source_version: '3' }] } }]} />);
  const decisions = screen.getByRole('region', { name: 'Menneskelige beslutninger' });
  expect(within(decisions).getByText('Sagsbehandler')).toBeInTheDocument();
  expect(within(decisions).getByText('Jurist')).toBeInTheDocument();
  expect(within(decisions).getByText('Slettekontrol før opstart.')).toBeInTheDocument();
  expect(within(decisions).getByText('Gennemgå slettefristen.')).toBeInTheDocument();
  expect(within(decisions).getByText(/ikke Entra-verificeret/)).toBeInTheDocument();
  fireEvent.click(within(decisions).getByText('Beslutningsgrundlag (1 referencer)'));
  expect(within(decisions).getByText('Kommunal mødeassistent · Version 3')).toBeVisible();
});

test('historikken beholder anmodningshændelser og viser AI og menneskelige ændringer særskilt', () => {
  mount(<CaseHistoryTimeline timeline={[
    { id: 'request', event_type: 'approval_requested', actor_kind: 'human', actor: 'Sagsbehandler', occurred_at: '2026-09-20T09:00:00Z' },
    { id: 'ai', event_type: 'assessment_created', actor_kind: 'ai', model: 'gpt-6-astra', initiated_by: 'Projektleder', version: 3, occurred_at: '2026-09-21T10:00:00Z' },
    { id: 'owner', event_type: 'assessment_metadata_updated', actor_kind: 'human', actor: 'Jurist', occurred_at: '2026-09-21T11:00:00Z', before: { owner: 'Tidligere ejer' }, after: { owner: 'Ny ejer' } },
  ]} />);
  const events = screen.getByRole('region', { name: 'Hændelsesforløb' });
  expect(within(events).getByText('Der blev anmodet om en beslutning')).toBeInTheDocument();
  expect(within(events).getByText('GPT-6 Astra')).toBeInTheDocument();
  expect(within(events).getByText('Projektleder')).toBeInTheDocument();
  expect(within(events).getByText('Tidligere ejer')).toBeInTheDocument();
  expect(within(events).getByText('Ny ejer')).toBeInTheDocument();
  expect(within(events).getAllByRole('heading', { level: 4 })[0]).toHaveTextContent('Vurderingens oplysninger blev ændret');
});

test('ukendte aktører og gammel platformreference bliver ikke et opdigtet menneske eller modelnavn', () => {
  mount(<CaseHistoryTimeline timeline={[{ id: 'unknown', event_type: 'reference_added', owner: 'Kendt ejer', actor: null }, { id: 'legacy', event_type: 'reference_added', actor_kind: 'ai', actor: 'Codex' }]} />);
  expect(screen.getByText('AI-assisteret import · model ikke registreret')).toBeInTheDocument();
  expect(screen.getAllByText('Ikke registreret').length).toBeGreaterThan(0);
  expect(screen.queryByText('System')).not.toBeInTheDocument();
  expect(screen.queryByText('Kendt ejer')).not.toBeInTheDocument();
  expect(screen.queryByText(/GPT-/)).not.toBeInTheDocument();
  expect(actorLabel('Codex', 'gpt-5.6-sol')).toBe('AI-assisteret import · GPT-5.6 Sol');
});
