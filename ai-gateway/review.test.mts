import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewBatches, MAX_REVIEW_CONTEXT, reviewUnits, type ReviewUnit } from './review.mts';
import { largeEvidenceSources } from './large-evidence.fixture.mts';

const unit = (id: string, sourceIds: string[]): ReviewUnit => ({ id, label: `Kontrol ${id}`, kind: 'summary', text: 'Et kildebaseret udkast, som kræver faglig gennemgang.', source_ids: sourceIds });

test('ordinary reviews retain six-unit batches, full source text and original state shape', async () => {
  const sources = [{ id: 'source', title: 'Grundlag', text: 'Oprindelig tekst.' }];
  const units = Array.from({ length: 7 }, (_, i) => unit(`section:${i}`, ['source']));
  const states: string[] = [];
  const result = await reviewUnits(units, sources, {}, async request => {
    states.push(request.state);
    return { answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability: 0.2 }])), usage: {} };
  });
  assert.deepEqual(states.map(state => JSON.parse(state)), [{ evidence: sources, draft: units.slice(0, 6) }, { evidence: sources, draft: units.slice(6) }]);
  assert.deepEqual(result.checks.map(check => check.id), units.map(item => item.id));
  assert.deepEqual(result.checks.map(check => check.label), units.map(item => item.label));
  assert.equal(result.status, 'requires_human_review');
  assert.equal(result.threshold_note, 'Foreløbig markering til fagligt review; ikke kalibreret juridisk sikkerhed eller godkendelse.');
});

test('large combined batches split by unit before splitting evidence', () => {
  const sources = ['a', 'b'].map(id => ({ id, title: id, text: id.repeat(30_000) }));
  const batches = buildReviewBatches([unit('first', ['a']), unit('second', ['b'])], sources);
  assert.equal(batches.length, 2);
  assert(batches.every(batch => batch.partCount === 1 && batch.state.length <= MAX_REVIEW_CONTEXT));
  assert.deepEqual(batches.map(batch => JSON.parse(batch.state).evidence), [[sources[0]], [sources[1]]]);
});

test('oversized evidence retains every UTF-8 byte and exact source mapping across bounded calls', () => {
  const sources = [
    { id: 'short', title: 'Kort kilde', text: 'Hele denne kilde bevares.' },
    { id: 'large', title: 'Lang kilde', text: 'Dansk æøå 😃 og JSON "\\\n'.repeat(5_000) },
    { id: 'last', title: 'Sidste kilde', text: 'Den sidste kilde medtages også.' },
  ];
  const draft = unit('summary', sources.map(source => source.id));
  const batches = buildReviewBatches([draft], sources);
  assert(batches.length > 2);
  const states = batches.map(batch => JSON.parse(batch.state));
  states.forEach((state, index) => {
    assert.equal(state.review_scope.part, index + 1);
    assert.equal(state.review_scope.count, states.length);
    assert.equal(state.review_scope.total_referenced_sources, draft.source_ids.length);
    assert.match(state.review_scope.note, /No call checks the complete evidence together/);
    assert.match(state.review_scope.note, /complete original references are retained outside this call/);
    assert.deepEqual(state.draft, [{ ...draft, source_ids: [...new Set(state.evidence.map((source: { id: string }) => source.id))] }]);
    assert.deepEqual(batches[index].units, [draft]);
    assert(batches[index].state.length <= MAX_REVIEW_CONTEXT);
  });
  for (const source of sources) {
    const pieces = states.flatMap(state => state.evidence).filter(piece => piece.id === source.id);
    const rebuilt = pieces.map(piece => piece.text).join('');
    assert.deepEqual(Buffer.from(rebuilt, 'utf8'), Buffer.from(source.text, 'utf8'));
    let offset = 0;
    for (const piece of pieces) {
      assert.equal(piece.title, source.title);
      if (piece.excerpt) {
        assert.equal(piece.excerpt.start_char, offset);
        assert.equal(piece.excerpt.end_char, offset + piece.text.length);
        assert.equal(piece.excerpt.total_chars, source.text.length);
        // Each independently encoded part also preserves complete Unicode characters.
        assert.equal(Buffer.from(piece.text).toString('utf8'), piece.text);
      }
      offset += piece.text.length;
    }
  }
});

test('partition checks map back once per original unit using the highest observed signal and explicit qualification', async () => {
  const sources = ['a', 'b', 'c'].map(id => ({ id, title: id, text: id.repeat(30_000) }));
  const units = [unit('summary', ['a', 'b', 'c']), unit('fact:one', ['a'])];
  let calls = 0;
  const result = await reviewUnits(units, sources, {}, async request => {
    calls++;
    const state = JSON.parse(request.state);
    const probability = state.review_scope?.part === 2 ? 0.8 : 0.1;
    return { answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability }])), usage: { calls: 1 } };
  });
  assert.equal(calls, 4);
  assert.equal(result.usage.length, calls);
  assert.deepEqual(result.checks.map(check => [check.id, check.section_ids, check.probability, check.requires_review]), [
    ['summary', ['summary'], 0.8, true], ['fact:one', ['fact:one'], 0.1, false],
  ]);
  assert.match(result.checks[0].label, /3 dele; samlet evidens kræver faglig gennemgang/);
  assert.equal(result.checks[1].label, units[1].label);
  assert.match(result.threshold_note, /højeste problemsignal/);
  assert.match(result.threshold_note, /ikke en samlet eller kalibreret sandsynlighed/);
  assert.equal(result.status, 'findings_require_review');
});

test('a single 200000-character source is losslessly partitioned with bounded context and exact Unicode offsets', () => {
  const source = { id: 'large-document', title: 'Syntetisk dokument', text: 'æøå😃"\\\n'.repeat(25_000) };
  assert.equal(source.text.length, 200_000);
  const batches = buildReviewBatches([unit('summary', [source.id])], [source]);
  assert(batches.length > 1 && batches.length <= 100);
  const pieces = batches.flatMap(batch => {
    assert(batch.state.length <= MAX_REVIEW_CONTEXT);
    assert.equal(batch.partCount, batches.length);
    return JSON.parse(batch.state).evidence;
  });
  let offset = 0;
  for (const piece of pieces) {
    assert.equal(piece.id, source.id);
    assert.equal(piece.excerpt.start_char, offset);
    offset += piece.text.length;
    assert.equal(piece.excerpt.end_char, offset);
    assert.equal(piece.excerpt.total_chars, 200_000);
    assert.equal(Buffer.from(piece.text).toString('utf8'), piece.text);
  }
  assert.equal(offset, source.text.length);
  assert.deepEqual(Buffer.from(pieces.map(piece => piece.text).join('')), Buffer.from(source.text));
});

test('a full 81-unit review of 1000 excerpts and 500000 characters stays within the unchanged call budget', async () => {
  const sources = largeEvidenceSources();
  assert(sources.every(source => /^document:[a-f0-9-]{36}:\d+$/.test(source.id)));
  const units = [unit('summary', sources.map(source => source.id)), ...Array.from({ length: 80 }, (_, index) =>
    unit(`section:${index}`, sources.slice(index * 10, index * 10 + 10).map(source => source.id)))];
  const originalUnits = structuredClone(units);
  const planned = buildReviewBatches(units, sources);
  for (const batch of planned.filter(batch => batch.units[0].id === 'summary')) {
    assert.deepEqual(batch.units, [originalUnits[0]]);
    const state = JSON.parse(batch.state);
    assert.equal(state.review_scope.total_referenced_sources, 1_000);
    assert.deepEqual(state.draft[0].source_ids, state.evidence.map((source: { id: string }) => source.id));
    assert(state.draft[0].source_ids.length < 1_000);
  }
  let calls = 0;
  const summaryEvidence: any[] = [];
  const seenUnits = new Set<string>();
  const result = await reviewUnits(units, sources, {}, async request => {
    calls++;
    assert(request.state.length <= MAX_REVIEW_CONTEXT);
    const state = JSON.parse(request.state);
    for (const draft of state.draft) seenUnits.add(draft.id);
    if (state.draft[0].id === 'summary') summaryEvidence.push(...state.evidence);
    return { answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability: 0.2 }])), usage: {} };
  });
  assert(calls > 1 && calls <= 100);
  assert.equal(result.usage.length, calls);
  assert.deepEqual(units, originalUnits);
  assert.equal(seenUnits.size, 81);
  assert.deepEqual(result.checks.map(check => check.id), units.map(draft => draft.id));
  assert.deepEqual(summaryEvidence, sources);
  assert.equal(summaryEvidence.reduce((sum, source) => sum + source.text.length, 0), 500_000);
  assert.equal(result.status, 'requires_human_review');
  assert.match(result.threshold_note, /ikke en samlet eller kalibreret sandsynlighed/);
});

test('unrepresentable drafts, references and excessive request counts fail before any provider call', async () => {
  const sources = [{ id: 'a', title: 'Grundlag', text: 'Relevant tekst' }];
  let calls = 0;
  const evaluator = async () => { calls++; return { answers: {}, usage: {} }; };
  await assert.rejects(reviewUnits([{ ...unit('summary', ['a']), text: 'x'.repeat(MAX_REVIEW_CONTEXT) }], sources, {}, evaluator), /REVIEW_CONTEXT_TOO_LARGE/);
  await assert.rejects(reviewUnits([unit('summary', ['missing'])], sources, {}, evaluator), /INVALID_SOURCE_REFERENCE/);
  await assert.rejects(reviewUnits([unit('summary', ['a'])], [{ ...sources[0], title: 'x'.repeat(MAX_REVIEW_CONTEXT) }], {}, evaluator), /REVIEW_CONTEXT_TOO_LARGE/);
  const manySources = Array.from({ length: 501 }, (_, i) => ({ id: String(i), title: 'Kilde', text: 'x'.repeat(30_000) }));
  await assert.rejects(reviewUnits(manySources.map(source => unit(source.id, [source.id])), manySources, {}, evaluator), /REVIEW_CONTEXT_TOO_LARGE/);
  assert.equal(calls, 0);
});

test('missing or invalid provider probabilities cannot become a successful check', async () => {
  for (const probability of [undefined, Number.NaN, -0.1, 1.1]) {
    const answers: Record<string, { probability: number }> = {};
    if (probability !== undefined) answers.summary = { probability };
    await assert.rejects(reviewUnits([unit('summary', [])], [], {}, async () => ({ answers, usage: {} })), /INVALID_REVIEW_ANSWER/);
  }
});

test('a JEV finding on an optional recommendation remains a review finding, never an approval', async () => {
  const advice: ReviewUnit = { ...unit('recommendation:local_processing', ['purpose']), kind: 'recommendation' };
  const result = await reviewUnits([advice], [{ id: 'purpose', title: 'Formål', text: 'Interne mødereferater.' }], {}, async request => {
    assert.match(request.questions[advice.id].instructions, /conditional advice separate from findings and approval/);
    assert.match(request.questions[advice.id].instructions, /does not claim that an unverified vendor capability exists/);
    return { answers: { [advice.id]: { probability: 0.8 } }, usage: {} };
  });
  assert.equal(result.status, 'findings_require_review');
  assert.equal(result.checks[0].requires_review, true);
  assert.deepEqual(result.checks[0].section_ids, [advice.id]);
});
