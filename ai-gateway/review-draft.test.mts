import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewDraft } from './review-draft.mts';
import { reviewUnits } from './review.mts';
import { MAX_AI_INPUT_CHARS } from './input-limits.mts';

function input() {
  const ids = ['input:purpose'];
  const sections = Array.from({ length: 39 }, (_, index) => ({ id: String(index), title: 'Afsnit', text: 'Grundtekst', review_status: 'reviewed' }));
  const risks = Array.from({ length: 33 }, (_, index) => ({ id: String(index), area: 'Område', scenario: 'Muligt tab', measures: 'Foreslået kontrol', likelihood: 3, impact: 4 }));
  return {
    sources: [{ id: ids[0], title: 'Formål', text: 'Syntetisk test af en referatassistent.' }],
    result: { executive_summary: 'Grundresumé', scope: 'Afgrænsning', sections, risks, status: 'blocked', blockers: ['Afklaring mangler'] },
    draft: { executive_summary: 'Testudkast', scope: 'Testafgrænsning', summary_source_ids: ids,
      sections: sections.map(section => ({ id: section.id, text: 'Syntetisk forslag.', source_ids: ids })),
      risks: risks.map(risk => ({ id: risk.id, scenario: risk.scenario, measures: risk.measures,
        consequences: 'Tab af kontrol for registrerede.', rationale: 'Faglig afklaring kræves.', source_ids: ids })),
      additional_risks: [], open_questions: [] },
  };
}

const recommendation = () => ({
  id: 'local_processing', title: 'Afprøv lokal behandling',
  proposal: 'Overvej lokal behandling, hvis leverandørens arkitektur understøtter det.',
  rationale: 'Mødereferater kan indeholde fortrolige oplysninger.',
  prerequisites: 'Teknisk mulighed og driftsansvar skal afklares først.',
  verification: 'Afprøv på syntetiske møder og dokumentér kvalitet og sletning.',
  source_ids: ['input:purpose'],
});

test('evaluation-only bridge passes every report unit and locked values to evaluator', async () => {
  let calls = 0;
  const result = await reviewDraft(input(), async (units, sources, options) => {
    calls++;
    assert.equal(units.length, 73);
    assert.deepEqual(units[0].locked_values?.blockers, ['Afklaring mangler']);
    assert.equal(units[40].locked_values?.likelihood, 3);
    assert.deepEqual(units[40].locked_values?.risk_definition, { id: '0', area: 'Område', scenario: 'Muligt tab' });
    assert.equal(sources.length, 1);
    assert.equal(options?.perBatchTimeoutMs, 90_000);
    assert.equal(options?.maxRetries, 2);
    return { model: 'typesafe-ai/jev', rubric_version: 'offline-test', checks: [],
      status: 'requires_human_review', threshold: 0.5, threshold_note: 'Syntetisk test', usage: [] };
  });
  assert.equal(calls, 1);
  assert.equal(result.model, 'typesafe-ai/jev');
});

test('the local report bridge shares the 1600000-character parsed input bound and fails before evaluation above it', async () => {
  const original = input();
  const candidate = { ...original, draft: { ...original.draft, recommendations: [] } };
  candidate.sources[0].text = '';
  candidate.sources[0].text = 'x'.repeat(MAX_AI_INPUT_CHARS - JSON.stringify(candidate).length);
  assert.equal(JSON.stringify(candidate).length, 1_600_000);
  let calls = 0;
  const evaluator = async () => {
    calls++;
    return { model: 'typesafe-ai/jev', rubric_version: 'offline-test', checks: [],
      status: 'requires_human_review', threshold: 0.5, threshold_note: 'Syntetisk test', usage: [] };
  };
  await reviewDraft(candidate, evaluator);
  assert.equal(calls, 1);
  candidate.sources[0].text += 'x';
  await assert.rejects(reviewDraft(candidate, evaluator), /INPUT_TOO_LARGE/);
  assert.equal(calls, 1);
});

test('risk meaning is checked against the original event rather than the rewritten draft', async () => {
  const candidate = input();
  candidate.result.risks[0] = { ...candidate.result.risks[0], id: '6.4', area: 'Sikkerhed',
    scenario: 'Manipulerede input fremprovokerer skadeligt eller fejlagtigt output.' };
  candidate.draft.risks[0] = { ...candidate.draft.risks[0], id: '6.4',
    scenario: 'En uvedkommende overtager kontoen via et stjålet password.' };
  let checkedOriginalEvent = false;
  const result = await reviewDraft(candidate, (units, sources, options) => reviewUnits(units, sources, options, async request => {
    const state = JSON.parse(request.state);
    const risk = state.draft.find((item: { id: string }) => item.id === 'risk:6.4');
    if (risk) {
      checkedOriginalEvent = true;
      assert.deepEqual(risk.locked_values.risk_definition, {
        id: '6.4', area: 'Sikkerhed', scenario: candidate.result.risks[0].scenario,
      });
      assert(risk.text.includes(candidate.draft.risks[0].scenario));
      assert.equal(risk.locked_values.likelihood, 3);
      assert.match(request.questions['risk:6.4'].instructions, /same hazardous event and cause/);
      assert.match(request.questions['risk:6.4'].instructions, /even if the replacement is plausible and source-supported/);
    }
    return { answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability: id === 'risk:6.4' ? 0.9 : 0.1 }])), usage: {} };
  }));
  assert.equal(checkedOriginalEvent, true);
  assert.equal(result.status, 'findings_require_review');
  assert.equal(result.checks.find(check => check.id === 'risk:6.4')?.requires_review, true);
});

test('review timeout overrides are bounded and empty default review never calls a provider', async () => {
  await assert.rejects(reviewUnits([], [], { perBatchTimeoutMs: 90_001 }), /INVALID_REVIEW_TIMEOUT/);
  await assert.rejects(reviewUnits([], [], { perBatchTimeoutMs: Number.NaN }), /INVALID_REVIEW_TIMEOUT/);
  await assert.rejects(reviewUnits([], [], { maxRetries: 3 }), /INVALID_REVIEW_RETRIES/);
  await assert.rejects(reviewUnits([], [], { maxRetries: -1 }), /INVALID_REVIEW_RETRIES/);
  assert.deepEqual((await reviewUnits([], [])).checks, []);
});

test('unknown sources and changed locked sections stop before evaluator', async () => {
  for (const mode of ['source', 'summary', 'locked']) {
    const candidate = input();
    if (mode === 'source') candidate.draft.risks[0].source_ids = ['invented'];
    if (mode === 'summary') candidate.draft.summary_source_ids = ['invented'];
    if (mode === 'locked') candidate.result.sections[0].review_status = 'missing_information';
    let calls = 0;
    await assert.rejects(reviewDraft(candidate, async () => { calls++; throw new Error('Must not call'); }));
    assert.equal(calls, 0);
  }
});

test('recommendations reach JEV as separate proposals with prerequisites and verification', async () => {
  const original = input();
  const candidate = { ...original, draft: { ...original.draft, recommendations: [recommendation()] } };
  let calls = 0;
  await reviewDraft(candidate, async (units, sources) => {
    calls++;
    assert.equal(units.length, 74);
    const advice = units.at(-1)!;
    assert.equal(advice.id, 'recommendation:local_processing');
    assert.equal(advice.kind, 'recommendation');
    assert.deepEqual(advice.source_ids, ['input:purpose']);
    assert.deepEqual(advice.locked_values, { role: 'optional_proposal_only', implementation_verified: false, legal_approval: false });
    assert(advice.text.includes(candidate.draft.recommendations[0].prerequisites));
    assert(advice.text.includes(candidate.draft.recommendations[0].verification));
    assert.equal(sources[0].id, 'input:purpose');
    assert.equal(units[0].locked_values?.status, 'blocked');
    assert.equal(units[40].locked_values?.likelihood, 3);
    return { model: 'typesafe-ai/jev', rubric_version: 'offline-test', checks: [],
      status: 'requires_human_review', threshold: 0.5, threshold_note: 'Syntetisk test', usage: [] };
  });
  assert.equal(calls, 1);
});

test('invalid recommendations fail before any evaluator call', async () => {
  for (const mode of ['source', 'duplicate', 'approval', 'verification']) {
    const original = input();
    const advice: Record<string, unknown> = recommendation();
    const candidate = { ...original, draft: { ...original.draft, recommendations: [advice] } };
    if (mode === 'source') advice.source_ids = ['invented'];
    if (mode === 'duplicate') candidate.draft.recommendations.push({ ...advice });
    if (mode === 'approval') advice.approved = true;
    if (mode === 'verification') delete advice.verification;
    let calls = 0;
    await assert.rejects(reviewDraft(candidate, async () => { calls++; throw new Error('Must not call'); }));
    assert.equal(calls, 0);
  }
});


test('unknown questionnaire answers reach every JEV unit as locked uncertainty, not negative facts', async () => {
  const candidate = input();
  const fields = ['large_scale', 'transfer_outside_eea', 'human_oversight', 'dpo_involved'];
  candidate.sources.push(...fields.map(field => ({ id: `input:${field}`, title: field, text: 'null' })));
  await reviewDraft(candidate, async (units) => {
    for (const unit of units) {
      assert.deepEqual(Object.keys(unit.locked_values?.uncertain_inputs as object), fields);
      assert(Object.values(unit.locked_values?.uncertain_inputs as object).every(value => String(value).includes('Ikke afklaret')));
    }
    return { model: 'typesafe-ai/jev', rubric_version: 'offline-test', checks: [], status: 'requires_human_review', threshold: .5, threshold_note: 'test', usage: [] };
  });
});
