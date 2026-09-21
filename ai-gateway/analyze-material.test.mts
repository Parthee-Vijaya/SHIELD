import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMaterial, validateMaterialDraft } from './analyze-material.mts';
import { reviewUnits } from './review.mts';

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
