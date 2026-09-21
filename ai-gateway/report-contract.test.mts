import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_REPORT_INPUT_CHARS, MAX_REPORT_RAW_INPUT_CHARS, validateDraftIds, validateReportInput } from './generate-report.mts';

const expected = { sections: [{ id: '1.1' }, { id: '2.1' }], risks: [{ id: '3.1' }] };
const sources = [{ id: 'input:purpose' }];
const draft = () => ({
  sections: expected.sections.map(section => ({ ...section, source_ids: ['input:purpose'] })),
  risks: expected.risks.map(risk => ({ ...risk, source_ids: ['input:purpose'] })),
  additional_risks: [],
});

test('accepts a complete report with source references', () => {
  assert.doesNotThrow(() => validateDraftIds(expected, draft(), sources));
});
test('rejects missing or duplicate template sections', () => {
  const missing = draft(); missing.sections.pop();
  assert.throws(() => validateDraftIds(expected, missing, sources), /INVALID_DRAFT_IDS/);
  const duplicate = draft(); duplicate.sections[1].id = '1.1';
  assert.throws(() => validateDraftIds(expected, duplicate, sources), /INVALID_DRAFT_IDS/);
});
test('rejects invented evidence and unsupported additional risk references', () => {
  const invented = draft(); invented.risks[0].source_ids = ['document:unrelated-case'];
  assert.throws(() => validateDraftIds(expected, invented, sources), /INVALID_SOURCE_REFERENCE/);
  const missing = draft(); missing.sections[0].source_ids = [];
  assert.throws(() => validateDraftIds(expected, missing, sources), /INVALID_SOURCE_REFERENCE/);
  const additional = { ...draft(), additional_risks: [{ source_ids: ['unknown'] }] };
  assert.throws(() => validateDraftIds(expected, additional, sources), /INVALID_SOURCE_REFERENCE/);
});

test('recommendations require unique identifiers and evidence from the same source pack', () => {
  const recommendation = { id: 'local_processing', source_ids: ['input:purpose'] };
  assert.doesNotThrow(() => validateDraftIds(expected, { ...draft(), recommendations: [recommendation] }, sources));
  assert.throws(() => validateDraftIds(expected, { ...draft(), recommendations: [recommendation, recommendation] }, sources), /INVALID_DRAFT_IDS/);
  assert.throws(() => validateDraftIds(expected, { ...draft(), recommendations: [{ ...recommendation, source_ids: ['unrelated'] }] }, sources), /INVALID_SOURCE_REFERENCE/);
  assert.throws(() => validateDraftIds(expected, { ...draft(), recommendations: [{ ...recommendation, source_ids: [] }] }, sources), /INVALID_SOURCE_REFERENCE/);
});

test('accepts all five supplier sources with provenance and the full base report', () => {
  const input = {
    request: { system_name: 'AI-løsning til kommunal afprøvning' },
    result: {
      executive_summary: 'Uafklarede forhold kræver faglig gennemgang.', scope: 'Kommunens anvendelse.',
      sections: Array.from({ length: 39 }, (_, index) => ({ id: String(index), title: 'Afsnit', text: 'Grundlag. '.repeat(100) })),
      risks: Array.from({ length: 33 }, (_, index) => ({ id: String(index), area: 'Risiko', scenario: 'Scenarie. '.repeat(40), measures: 'Foranstaltning. '.repeat(40) })),
    },
    sources: [
      ['product', 21_000, 11], ['privacy', 43_000, 22], ['soc-report', 40_000, 14],
      ['technical-report', 20_000, 6], ['dpa', 25_295, 10],
    ].flatMap(([name, total, count]) => Array.from({ length: Number(count) }, (_, index) => ({
      id: `document:${name}:${index + 1}`, document_version_id: name, title: String(name),
      text: 'x'.repeat(Math.floor(Number(total) / Number(count)) + (index < Number(total) % Number(count) ? 1 : 0)),
      locator: `Afsnit ${index + 1}`, checksum: 'a'.repeat(64),
      source_url: `https://supplier.example/${name}`, review_status: 'unreviewed',
    }))),
  };
  assert.equal(input.sources.length, 63);
  assert.equal(input.sources.reduce((sum, item) => sum + item.text.length, 0), 149_295);
  assert(JSON.stringify(input).length > 180_000);
  const validated = validateReportInput(input);
  assert.deepEqual(validated.sources, input.sources);
  assert.equal(validated.sources.at(-1)?.id, 'document:dpa:10');
});

test('validated report input remains bounded at 400000 characters', () => {
  const input = {
    request: {}, result: { executive_summary: '', scope: '', sections: [], risks: [] },
    sources: [{ id: 'document:1', title: 'Kilde', text: '' }],
  };
  input.sources[0].text = 'x'.repeat(MAX_REPORT_INPUT_CHARS - JSON.stringify(input).length);
  assert.equal(JSON.stringify(input).length, 400_000);
  assert.doesNotThrow(() => validateReportInput(input));
  input.sources[0].text += 'x';
  assert.throws(() => validateReportInput(input), /INPUT_TOO_LARGE/);
});

test('raw worker input is accepted up to 500000 characters and rejected above it without a model call', () => {
  const input = { status_only: true, padding: '' };
  input.padding = 'x'.repeat(MAX_REPORT_RAW_INPUT_CHARS - JSON.stringify(input).length);
  const body = JSON.stringify(input);
  assert.equal(body.length, 500_000);
  const options = { env: {}, encoding: 'utf8' as const, timeout: 10_000 };
  const worker = fileURLToPath(new URL('./generate-report.mts', import.meta.url));
  const accepted = spawnSync(process.execPath, [worker], { ...options, input: body });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).configured, false);
  const rejected = spawnSync(process.execPath, [worker], { ...options, input: body + ' ' });
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.equal(JSON.parse(rejected.stdout).error.code, 'ai_generation_failed');
});
