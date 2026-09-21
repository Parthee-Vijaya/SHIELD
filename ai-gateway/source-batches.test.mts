import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMaterial, materialBatchDisagreements } from './analyze-material.mts';
import { generateReport, validateReportEvidence } from './generate-report.mts';
import { reviewUnits, MAX_REVIEW_CONTEXT } from './review.mts';
import { batchingMetadata, planSourceBatches, sourceTextLength, MAX_GENERATION_CONTEXT_CHARS, type GenerationRequest } from './source-batches.mts';

function syntheticSources() {
  return Array.from({ length: 1400 }, (_, index) => ({
    id: `document:version-${Math.floor(index / 40)}:${index % 40 + 1}`, document_version_id: `version-${Math.floor(index / 40)}`,
    title: 'Syntetisk dokumentation', text: ((index < 998 ? 'Kundens data hostes i Danmark. ' : 'Kundens data hostes i Tyskland. ') + '😃 ').padEnd(502, 'x'),
  }));
}
const reviewResult = () => ({ model: 'typesafe-ai/jev', rubric_version: 'offline-test', checks: [], status: 'requires_human_review', threshold: 0.5, threshold_note: 'Ikke en godkendelse.', usage: [] });
const materialDraft = (sourceId: string, second = false) => ({
  summary: 'Leverandøren oplyser hostingforhold. Anvendelse og grundlag skal afklares.',
  facts: [{ id: 'hosting', field: 'hosting_region', value: second ? 'third_country' : 'denmark', source_refs: [{ source_id: sourceId, quote: second ? 'Kundens data hostes i Tyskland.' : 'Kundens data hostes i Danmark.' }] }],
  questions: [{ id: 'dpa', question: second ? 'Hvilken databehandleraftale gælder for del to?' : 'Foreligger en databehandleraftale?', topic: 'Aftalegrundlag', priority: 'high' as const }], conflicts: [] as any[],
});

test('planner partitions document, excerpt, text and serialized budgets without losing original identifiers or Unicode', () => {
  const sources = syntheticSources();
  const original = structuredClone(sources);
  assert(sources.reduce((sum, source) => sum + sourceTextLength(source.text), 0) > 500_000);
  assert(new Set(sources.map(source => source.document_version_id)).size > 25);
  assert(sources.length > 1000);
  const plan = planSourceBatches(sources, 5000);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].length, 998);
  assert.deepEqual(plan.flat(), original);
  const metadata = batchingMetadata(plan, 1);
  assert.equal(metadata.strategy, 'map-reduce-v1');
  assert.equal(metadata.source_count, 1400);
  assert.equal(metadata.source_text_chars, sources.reduce((sum, source) => sum + Array.from(source.text).length, 0));
  assert.equal(metadata.batches[0].index, 1);
  assert.equal(metadata.batches[0].document_count, 25);
  for (const batch of plan) assert(JSON.stringify(batch).length + 5000 <= MAX_GENERATION_CONTEXT_CHARS);
  const escaped = [{ id: 'document:a:1', title: 'Kilde', text: '\\'.repeat(300_000) }, { id: 'document:a:2', title: 'Kilde', text: '\\'.repeat(300_000) }];
  assert.equal(planSourceBatches(escaped, 100).length, 2);
  assert.equal(sourceTextLength('a😃æ'), 3);
});

test('source pool limits fail explicitly before planning or model calls, never slicing input', () => {
  assert.throws(() => planSourceBatches([{ id: 'a', title: 'Kilde', text: 'x'.repeat(500001) }]), /SOURCE_EXCEEDS_BATCH_LIMIT/);
  assert.throws(() => planSourceBatches(Array.from({ length: 101 }, (_, i) => ({ id: `document:${i}:1`, title: 'Kilde', text: 'Kildetekst' }))), /SOURCE_POOL_TOO_LARGE/);
  assert.throws(() => planSourceBatches([{ id: 'a', title: 'Kilde', text: 'Kildetekst' }], MAX_GENERATION_CONTEXT_CHARS), /BATCH_CONTEXT_TOO_LARGE/);
});

test('material maps all sources then synthesizes once, preserves local and cross-part issues and evaluates originals', async () => {
  const sources = syntheticSources();
  const requests: GenerationRequest[] = [];
  const maps = [materialDraft(sources[0].id), materialDraft(sources[998].id, true)];
  maps[0].conflicts = [{ id: 'local_conflict', description: 'To vilkår i første del er uafklarede og skal bevares.', source_refs: [{ source_id: sources[0].id, quote: 'Kundens data hostes i Danmark.' }, { source_id: sources[1].id, quote: 'Kundens data hostes i Danmark.' }] }];
  let evaluated = false;
  const result = await analyzeMaterial({ profile: { system_name: 'Syntetisk løsning' }, sources }, async (units, evidence) => {
    evaluated = true;
    assert.deepEqual(evidence.map(source => [source.id, source.text]), sources.map(source => [source.id, source.text]));
    assert(units.some(unit => unit.id.startsWith('conflict:')));
    assert.equal(units.some(unit => unit.id === 'fact:hosting'), false);
    return reviewResult();
  }, async request => {
    requests.push(request); assert.equal(request.model, 'openai/gpt-5.5');
    assert(request.system.length + request.prompt.length <= MAX_GENERATION_CONTEXT_CHARS);
    return { output: requests.length <= 2 ? maps[requests.length - 1] : materialDraft(sources[0].id), usage: { tokens: 1 } };
  });
  assert(evaluated); assert.equal(requests.length, 3);
  assert.match(requests[2].prompt, /Kundens data hostes i Tyskland/);
  assert.match(requests[2].prompt, /Kundens data hostes i Danmark/);
  assert.equal(result.draft.facts.length, 0);
  assert(result.draft.conflicts.some(conflict => conflict.description.includes('første del')));
  assert(result.draft.conflicts.some(conflict => conflict.description.includes('hosting_region')));
  assert(result.draft.questions.some(question => question.question.includes('del to')));
  assert.equal(result.batching?.map_call_count, 2);
  assert.equal(result.batching?.synthesis_call_count, 1);
  assert.equal(result.batching?.cross_batch_conflict_count, 1);
});

test('complementary arrays and differently worded purposes are not automatically contradictions', () => {
  const draftA: any = materialDraft('a'); const draftB: any = materialDraft('b');
  draftA.facts = [{ id: 'purpose', field: 'purpose', value: 'Kommunal behandling af dokumenter.', source_refs: [] }, { id: 'subjects', field: 'data_subjects', value: ['citizens'], source_refs: [] }];
  draftB.facts = [{ id: 'purpose', field: 'purpose', value: 'Afprøvning ved kommunal aktindsigt.', source_refs: [] }, { id: 'subjects', field: 'data_subjects', value: ['employees'], source_refs: [] }];
  assert.deepEqual(materialBatchDisagreements([draftA, draftB]), []);
});

test('an invented map quote or failed second batch prevents synthesis and all evaluator calls', async () => {
  for (const fail of ['quote', 'provider']) {
    const sources = syntheticSources(); let calls = 0, evaluated = false;
    await assert.rejects(analyzeMaterial({ profile: {}, sources }, async () => { evaluated = true; return reviewResult(); }, async () => {
      calls++; if (calls === 2) {
        if (fail === 'provider') throw Error('SECOND_BATCH_FAILED');
        const forged = materialDraft(sources[998].id, true); forged.facts[0].source_refs[0].quote = 'Dette opdigtede citat findes ikke i nogen kilde.';
        return { output: forged };
      }
      return { output: materialDraft(sources[0].id) };
    }), fail === 'quote' ? /INVALID_EXACT_QUOTE/ : /SECOND_BATCH_FAILED/);
    assert.equal(calls, 2); assert.equal(evaluated, false);
  }
});

function reportInput(sources = syntheticSources()) {
  return { request: { controls: [], verified_controls: [], human_oversight: null }, sources,
    result: { status: 'blocked', risk_level: 'high', executive_summary: 'Grundlag er uafklaret.', scope: 'Kommunal dokumentbehandling.', blockers: ['Ukendt kontrol'],
      sections: [{ id: '1.1', title: 'Grundlag', text: 'Manglende grundlag skal afklares.', review_status: 'missing_information' }],
      risks: [{ id: '3.1', area: 'Adgang', scenario: 'Uautoriseret adgang til data.', measures: 'Afklar adgangsstyring.', likelihood: 3, impact: 4, residual_risk: 12 }],
    } };
}
function evidenceMap(id: string, second = false) {
  return { summary: 'Dokumentation beskriver hosting og åbne spørgsmål til kommunens anvendelse.', findings: [{ topic: 'hosting.region', value: second ? 'Tyskland' : 'Danmark', statement: 'Leverandøren beskriver sin hosting.', source_refs: [{ source_id: id, quote: second ? 'Kundens data hostes i Tyskland.' : 'Kundens data hostes i Danmark.' }] }], unresolved_questions: [second ? 'Er oplysningerne fra del to gældende for kommunen?' : 'Er oplysningerne fra del et gældende for kommunen?'] };
}
function sectionDraft(id: string) { return { executive_summary: 'Dokumentationen beskriver hosting, men beslutning kræver faglig gennemgang.', scope: 'Kommunal dokumentbehandling med AI.', summary_source_ids: [id], sections: [{ id: '1.1', text: 'Forsøg på at ændre et låst afsnit.', source_ids: [id] }], open_questions: [], recommendations: [] }; }
function riskDraft(id: string) { return { risks: [{ id: '3.1', scenario: 'Uautoriseret adgang kan eksponere borgeroplysninger.', consequences: 'Borgernes fortrolige forhold bliver kendt af uvedkommende.', measures: 'Forslag til foranstaltninger: kontrollér adgange før brug.', rationale: 'Oplysningerne er fortrolige og kontrollen er uafklaret.', source_ids: [id] }], additional_risks: [] }; }

test('report maps all evidence, synthesizes sections and risks, retains locked text and disagreements, then actually invokes JEV partitions', async () => {
  const input = reportInput(); let calls = 0; const reviewedStates: any[] = [];
  const result = await generateReport(input, (units, sources, options) => reviewUnits(units, sources, options, async request => {
    assert.equal(request.model, 'typesafe-ai/jev'); assert(request.state.length <= MAX_REVIEW_CONTEXT);
    reviewedStates.push(JSON.parse(request.state));
    return { answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability: .2 }])), usage: {} };
  }), async request => {
    calls++; assert.equal(request.model, 'openai/gpt-5.5');
    if (calls <= 2) return { output: evidenceMap(input.sources[calls === 1 ? 0 : 998].id, calls === 2) };
    assert.match(request.prompt, /Tyskland/); assert.match(request.prompt, /Danmark/);
    assert.match(request.prompt, /Modstrid må ikke løses/);
    return { output: calls === 3 ? sectionDraft(input.sources[0].id) : riskDraft(input.sources[998].id) };
  });
  assert.equal(calls, 4); assert(reviewedStates.length > 0);
  assert.equal(result.draft.sections[0].text, input.result.sections[0].text);
  assert.match(result.draft.executive_summary, /Mulig modstrid om hosting.region/);
  assert.equal(result.draft.open_questions.length, 3);
  assert.equal(result.batching.map_call_count, 2); assert.equal(result.batching.synthesis_call_count, 2);
  assert.equal(result.batching.source_count, 1400);
  const reviewedRisk = reviewedStates.flatMap(state => state.draft).find(unit => unit.id === 'risk:3.1');
  assert.equal(reviewedRisk.locked_values.residual_risk, 12);
  assert.equal(reviewedRisk.locked_values.risk_definition.scenario, input.result.risks[0].scenario);
  assert.equal(result.review.status, 'requires_human_review');
});

test('report rejects fabricated quotes and does not continue after a failed evidence part', async () => {
  assert.throws(() => validateReportEvidence([{ id: 'a', text: 'En dokumenteret oplysning.' }], evidenceMap('a')), /INVALID_EXACT_QUOTE/);
  assert.throws(() => validateReportEvidence([{ id: 'a', text: 'En dokumenteret oplysning.' }], { summary: 'Et delresultat uden oplysninger eller åbne spørgsmål.', findings: [], unresolved_questions: [] }), /BATCH_WITHOUT_FINDINGS/);
  const input = reportInput(); let calls = 0, evaluated = false;
  await assert.rejects(generateReport(input, async () => { evaluated = true; return reviewResult(); }, async () => {
    calls++; if (calls === 2) throw Error('SECOND_BATCH_FAILED');
    return { output: evidenceMap(input.sources[0].id) };
  }), /SECOND_BATCH_FAILED/);
  assert.equal(calls, 2); assert.equal(evaluated, false);
});

test('small input preserves direct material and two-pass report paths without map calls', async () => {
  const sources = [{ id: 'document:a:1', title: 'Kilde', text: 'Kundens data hostes i Danmark.' }];
  let materialCalls = 0;
  const material = await analyzeMaterial({ profile: {}, sources }, async () => reviewResult(), async () => { materialCalls++; return { output: materialDraft(sources[0].id) }; });
  assert.equal(materialCalls, 1); assert.equal(material.batching?.strategy, 'single-pass-v1'); assert.equal(material.batching?.map_call_count, 0);
  let reportCalls = 0;
  const report = await generateReport(reportInput(sources as any), async () => reviewResult(), async () => { reportCalls++; return { output: reportCalls === 1 ? sectionDraft(sources[0].id) : riskDraft(sources[0].id) }; });
  assert.equal(reportCalls, 2); assert.equal(report.batching.strategy, 'single-pass-v1'); assert.equal(report.batching.map_call_count, 0);
});

test('maximum source pool can pass more than100 bounded JEV partitions with every character preserved', async () => {
  const sources = Array.from({ length: 10000 }, (_, index) => ({ id: `document:doc-${Math.floor(index / 100)}:${index % 100}`, title: 'Syntetisk dokumentation', text: `${index}:`.padEnd(500, 'x') }));
  let calls = 0; const received: any[] = [];
  const result = await reviewUnits([{ id: 'summary', label: 'Resumé', kind: 'summary', text: 'Det samlede grundlag kræver gennemgang.', source_ids: sources.map(source => source.id) }], sources, {}, async request => {
    calls++; assert(request.state.length <= MAX_REVIEW_CONTEXT); received.push(...JSON.parse(request.state).evidence);
    return { answers: { summary: { probability: .1 } }, usage: {} };
  });
  assert(calls > 100 && calls <= 500);
  assert.deepEqual(received.map(source => [source.id, source.text]), sources.map(source => [source.id, source.text]));
  assert.equal(result.status, 'requires_human_review'); assert.match(result.threshold_note, /separate kald/);
});

test('30-day versus365-day retention cannot become a winning fact and retains both original citations', async () => {
  const sources = syntheticSources().map((source, index) => ({ ...source, text: `${index < 998 ? 'Data slettes efter 30 dage.' : 'Data slettes efter 365 dage.'} 😃 `.padEnd(502, 'x') }));
  const retention = (second = false) => ({ ...materialDraft(sources[second ? 998 : 0].id, second), facts: [{ id: 'retention', field: 'retention_period', value: second ? '365 dage' : '30 dage', source_refs: [{ source_id: sources[second ? 998 : 0].id, quote: second ? 'Data slettes efter 365 dage.' : 'Data slettes efter 30 dage.' }] }] });
  let calls = 0;
  const result = await analyzeMaterial({ profile: {}, sources }, async () => reviewResult(), async () => { calls++; return { output: retention(calls === 2) }; });
  assert.equal(calls, 3);
  assert.equal(result.draft.facts.some(fact => fact.field === 'retention_period'), false);
  const conflict = result.draft.conflicts.find(item => item.description.includes('retention_period'));
  assert.deepEqual(conflict?.source_refs.map(ref => ref.source_id), [sources[0].id, sources[998].id]);
  assert.match(conflict?.description || '', /30 dage/); assert.match(conflict?.description || '', /365 dage/);
  assert.match(result.draft.summary, /Uafklarede forskelle/);
});
