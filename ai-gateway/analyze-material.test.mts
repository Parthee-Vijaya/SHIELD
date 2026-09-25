import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMaterial, validateMaterialDraft, validateMaterialInput, readMaterialInput, MAX_MATERIAL_INPUT_CHARS, MAX_MATERIAL_RAW_INPUT_CHARS } from './analyze-material.mts';
import { MAX_REVIEW_CONTEXT, reviewUnits } from './review.mts';
import { largeEvidenceSources } from './large-evidence.fixture.mts';

const source = { id: 'document:1:1', title: 'Materiale', text: 'Kundens data hostes i Danmark.', locator: 'Side 2' };
const input = { profile: { system_name: 'Fagsystem' }, sources: [source] };
const draft = { summary: 'Leverandøren oplyser, at data hostes i Danmark. Aftalegrundlaget er uafklaret.', facts: [{ id: 'hosting', field: 'hosting_region', value: 'denmark', source_refs: [{ source_id: source.id, quote: source.text }] }], questions: [{ id: 'dpa', question: 'Foreligger en databehandleraftale?', topic: 'Aftalegrundlag', priority: 'high' as const }], conflicts: [] };

test('evaluation-only material bridge covers summary and every fact with page locators', async () => {
  let called = false;
  const evaluator = async (units: any[], sources: any[]) => {
    called = true;
    assert.deepEqual(units.map(unit => unit.id), ['summary', 'fact:hosting']);
    assert.equal(sources[0].title, 'Materiale · Side 2');
    assert.match(units[0].locked_values.note, /not evidence/);
    return { model: 'typesafe-ai/jev', rubric_version: 'test', checks: [], status: 'requires_human_review', threshold: 0.5, threshold_note: 'test', usage: [] };
  };
  const result = await analyzeMaterial({ ...input, mode: 'evaluate', draft }, evaluator);
  assert(called);
  assert.deepEqual(result.draft, draft);
});

test('unknown fields, invented quotes and duplicate fields stop before evaluator', async () => {
  for (const change of [
    (copy: any) => { copy.facts[0].field = 'legal_basis'; },
    (copy: any) => { copy.facts[0].value = 'maybe'; },
    (copy: any) => { copy.facts[0].source_refs[0].quote = 'Kundens data hostes i Tyskland.'; },
    (copy: any) => { copy.facts.push({ ...copy.facts[0], id: 'second' }); },
  ]) {
    const copy = structuredClone(draft);
    change(copy);
    let called = false;
    await assert.rejects(analyzeMaterial({ ...input, mode: 'evaluate', draft: copy }, async () => { called = true; throw Error('should not run'); }));
    assert.equal(called, false);
  }
});

test('booleans are not inferred or string-coerced and unknown information requires a high priority question', () => {
  const copy: any = structuredClone(draft);
  copy.facts[0].field = 'model_training';
  copy.facts[0].value = 'false';
  assert.throws(() => validateMaterialDraft(input, copy));
  copy.facts = [];
  copy.questions[0].priority = 'normal';
  assert.throws(() => validateMaterialDraft(input, copy));
});

test('material summary keeps all large sources while its exact-citation fact retains its own complete evidence', async () => {
  const sources = [source, ...['dpa', 'audit', 'product'].map(id => ({ id, title: id, text: `${id}: ` + 'Leverandørens dokumentation. '.repeat(1_100) }))];
  const reviewed: any[] = [];
  const result = await analyzeMaterial({ ...input, sources, mode: 'evaluate', draft }, (units, evidence, options) => reviewUnits(units, evidence, options, async request => {
    reviewed.push(JSON.parse(request.state));
    return { answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability: 0.2 }])), usage: {} };
  }));
  const summarySources = reviewed.filter(state => state.draft[0].id === 'summary').flatMap(state => state.evidence);
  for (const item of sources) assert.equal(summarySources.filter(piece => piece.id === item.id).map(piece => piece.text).join(''), item.text);
  const factState = reviewed.find(state => state.draft[0].id === 'fact:hosting');
  assert.equal(factState.evidence[0].text, source.text);
  assert.match(factState.draft[0].text, /Citat: Kundens data hostes i Danmark/);
  assert.deepEqual(result.draft, draft);
  assert.deepEqual(result.review.checks.map(check => check.id), ['summary', 'fact:hosting']);
  assert.match(result.review.threshold_note, /samlet eller kalibreret sandsynlighed/);
});


test('245 excerpts and 173966 text characters survive material validation and review unchanged', async () => {
  const sources = Array.from({ length: 245 }, (_, index) => ({
    id: `document:version-${Math.floor(index / 31)}:${index % 31 + 1}`,
    title: 'Officiel leverandørdokumentation med produktbeskrivelse, databehandleraftale og revision',
    text: 'x'.repeat(Math.floor(173966 / 245) + Number(index < 173966 % 245)),
    locator: `Afsnit ${index + 1}`, version: '1', checksum: 'a'.repeat(64),
    document_version_id: `version-${Math.floor(index / 31)}`,
    source_url: 'https://supplier.example/security/documents/latest-auditor-report.pdf',
  }));
  const largeDraft = { ...draft, facts: [] };
  const largeInput = { ...input, sources, mode: 'evaluate' as const, draft: largeDraft };
  assert(JSON.stringify(largeInput).length > 230000);
  assert.deepEqual(validateMaterialInput(largeInput).sources, sources);
  let inspected = false;
  await analyzeMaterial(largeInput, async (units, evidence) => {
    inspected = true;
    assert.deepEqual(units[0].source_ids, sources.map(item => item.id));
    assert.deepEqual(evidence.map(item => [item.id, item.text]), sources.map(item => [item.id, item.text]));
    assert.equal(evidence.reduce((sum, item) => sum + item.text.length, 0), 173966);
    return { model: 'typesafe-ai/jev', rubric_version: 'test', checks: [], status: 'requires_human_review', threshold: .5, threshold_note: 'test', usage: [] };
  });
  assert(inspected);
});

test('material accepts 16000000 parsed characters plus wire whitespace up to 20000000 characters', async () => {
  assert.equal(MAX_MATERIAL_INPUT_CHARS, 16_000_000);
  assert.equal(MAX_MATERIAL_RAW_INPUT_CHARS, 20_000_000);
  const candidate = { profile: {}, sources: [{ id: 'document:1', title: 'Kilde', text: '' }] };
  candidate.sources[0].text = 'x'.repeat(MAX_MATERIAL_INPUT_CHARS - JSON.stringify(candidate).length);
  const boundary = JSON.stringify(candidate);
  assert.equal(boundary.length, MAX_MATERIAL_INPUT_CHARS);
  assert.doesNotThrow(() => validateMaterialInput(candidate));
  async function* chunks(value: string) { yield value.slice(0, 200000); yield value.slice(200000); }
  assert.equal(await readMaterialInput(chunks(boundary)), boundary);
  const wireBoundary = boundary.padEnd(MAX_MATERIAL_RAW_INPUT_CHARS, ' ');
  assert.equal(await readMaterialInput(chunks(wireBoundary)), wireBoundary);
  assert.deepEqual(validateMaterialInput(JSON.parse(wireBoundary)), candidate);
  await assert.rejects(readMaterialInput(chunks(wireBoundary + ' ')), /INPUT_TOO_LARGE/);
  candidate.sources[0].text += 'x';
  assert.throws(() => validateMaterialInput(candidate), /INPUT_TOO_LARGE/);
  let called = false;
  await assert.rejects(analyzeMaterial(candidate, async () => { called = true; throw Error('must not run'); }), /INPUT_TOO_LARGE/);
  assert.equal(called, false);
});

test('25 documents with 1000 excerpts and 500000 source characters reach bounded JEV review intact', async () => {
  const sources = largeEvidenceSources();
  assert.equal(new Set(sources.map(item => item.document_version_id)).size, 25);
  assert.equal(sources.length, 1_000);
  assert.equal(sources.reduce((sum, item) => sum + item.text.length, 0), 500_000);
  const candidate = { ...input, sources, mode: 'evaluate', draft: { ...draft, facts: [] } };
  assert(JSON.stringify(candidate).length > 400_000);
  const received: any[] = [];
  let calls = 0;
  const result = await analyzeMaterial(candidate, (units, evidence, options) => reviewUnits(units, evidence, options, async request => {
    calls++;
    assert(request.state.length <= MAX_REVIEW_CONTEXT);
    const state = JSON.parse(request.state);
    assert.equal(state.draft[0].id, 'summary');
    assert.match(state.review_scope.note, /No call checks the complete evidence together/);
    received.push(...state.evidence);
    return { answers: { summary: { probability: 0.2 } }, usage: {} };
  }));
  assert(calls > 1 && calls <= 100);
  assert.deepEqual(received.map(item => [item.id, item.text]), sources.map(item => [item.id, item.text]));
  assert.equal(received.at(-1).id, sources.at(-1)?.id);
  assert.equal(result.review.checks.length, 1);
  assert.equal(result.review.status, 'requires_human_review');
  assert.match(result.review.threshold_note, /ikke en samlet eller kalibreret sandsynlighed/);
});


test('only explicitly nullable evidence fields may preserve unknown values', () => {
  for (const field of ['large_scale', 'transfer_outside_eea', 'human_oversight']) {
    const candidate = structuredClone(draft) as any;
    candidate.facts[0].field = field;
    candidate.facts[0].value = null;
    assert.equal(validateMaterialDraft(input, candidate).facts[0].value, null);
  }
  for (const field of ['special_categories', 'criminal_data', 'automated_decisions', 'dpo_involved']) {
    const candidate = structuredClone(draft) as any;
    candidate.facts[0].field = field;
    candidate.facts[0].value = null;
    assert.throws(() => validateMaterialDraft(input, candidate));
  }
});

test('municipal needs cannot establish hosting and keep their origin for generation and JEV', async () => {
  const needs = { ...source, category: 'needs_description', evidence_type: 'municipal_needs_statement', evidence_label: 'Kommunens behovsbeskrivelse' };
  assert.throws(() => validateMaterialDraft({ ...input, sources: [needs] }, draft), /NEEDS_CANNOT_ESTABLISH_DEPLOYMENT/);
  const planned = { ...draft, summary: 'Kommunens behovsbeskrivelse angiver planlagt støtte til møder. Leverandøregenskaber skal afklares.', facts: [{ ...draft.facts[0], field: 'purpose', value: 'Planlagt støtte til kommunale møder.' }] };
  let generated = false, reviewed = false;
  await analyzeMaterial({ ...input, sources: [needs] }, async (_units, evidence) => {
    reviewed = true;
    assert.equal((evidence[0] as typeof needs).evidence_type, 'municipal_needs_statement');
    return { model: 'typesafe-ai/jev', rubric_version: 'test', checks: [], status: 'requires_human_review', threshold: .5, threshold_note: 'test', usage: [] };
  }, async request => {
    generated = true;
    assert.match(request.system, /Kommunens behovsbeskrivelse/);
    assert.match(request.system, /aldrig leverandørens dokumentation/);
    assert.match(request.prompt, /municipal_needs_statement/);
    return { output: planned };
  });
  assert(generated && reviewed);
});
