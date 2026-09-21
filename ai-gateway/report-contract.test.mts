import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_REPORT_INPUT_CHARS, MAX_REPORT_RAW_INPUT_CHARS, PROMPT_VERSION, generateReport, validateDraftIds, validateReportInput } from './generate-report.mts';
import { largeEvidenceSources } from './large-evidence.fixture.mts';
import { reviewUnits } from './review.mts';

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

test('validated report input remains bounded at 16000000 characters', () => {
  const input = {
    request: {}, result: { executive_summary: '', scope: '', sections: [], risks: [] },
    sources: [{ id: 'document:1', title: 'Kilde', text: '' }],
  };
  input.sources[0].text = 'x'.repeat(MAX_REPORT_INPUT_CHARS - JSON.stringify(input).length);
  assert.equal(JSON.stringify(input).length, 16_000_000);
  assert.doesNotThrow(() => validateReportInput(input));
  input.sources[0].text += 'x';
  assert.throws(() => validateReportInput(input), /INPUT_TOO_LARGE/);
});

test('raw worker input is accepted up to 20000000 characters and rejected above it without a model call', () => {
  const input = { status_only: true, padding: '' };
  input.padding = 'x'.repeat(MAX_REPORT_RAW_INPUT_CHARS - JSON.stringify(input).length);
  const body = JSON.stringify(input);
  assert.equal(body.length, 20_000_000);
  const options = { env: {}, encoding: 'utf8' as const, timeout: 10_000 };
  const worker = fileURLToPath(new URL('./generate-report.mts', import.meta.url));
  const accepted = spawnSync(process.execPath, [worker], { ...options, input: body });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).configured, false);
  const rejected = spawnSync(process.execPath, [worker], { ...options, input: body + ' ' });
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.equal(JSON.parse(rejected.stdout).error.code, 'ai_generation_failed');
});

test('1000 excerpts with 500000 source characters fit alongside the full questionnaire and report', () => {
  const input = {
    request: { purpose: 'Kommunal dokumentgennemgang. '.repeat(180) },
    result: {
      executive_summary: 'Vurderingen skal afklares.', scope: 'Kommunens dokumentbehandling.',
      sections: Array.from({ length: 39 }, (_, index) => ({ id: String(index), title: 'Afsnit', text: 'Grundlag. '.repeat(90) })),
      risks: Array.from({ length: 33 }, (_, index) => ({ id: String(index), area: 'Risiko', scenario: 'Scenarie. '.repeat(40), measures: 'Foranstaltning. '.repeat(50), rationale: 'Vurderingsgrundlag. '.repeat(20) })),
    },
    sources: largeEvidenceSources(),
  };
  assert.equal(input.sources.reduce((sum, source) => sum + source.text.length, 0), 500_000);
  assert(JSON.stringify(input).length > 400_000);
  assert.deepEqual(validateReportInput(input).sources, input.sources);
});


test('245 document excerpts plus questionnaire and full 39-section 33-risk report fit existing bounds', () => {
  const input = {
    request: { purpose: 'Kommunal dokumentgennemgang. '.repeat(180) },
    result: {
      executive_summary: 'Vurderingen skal afklares.', scope: 'Kommunens dokumentbehandling.',
      sections: Array.from({ length: 39 }, (_, index) => ({ id: String(index), title: 'Afsnit', text: 'Grundlag. '.repeat(90) })),
      risks: Array.from({ length: 33 }, (_, index) => ({ id: String(index), area: 'Risiko', scenario: 'Scenarie. '.repeat(40), measures: 'Foranstaltning. '.repeat(50), rationale: 'Vurderingsgrundlag. '.repeat(20) })),
    },
    sources: Array.from({ length: 245 }, (_, index) => ({
      id: `document:version-${Math.floor(index / 31)}:${index % 31 + 1}`,
      title: 'Officiel leverandørdokumentation med produktbeskrivelse, databehandleraftale og revision',
      text: 'x'.repeat(Math.floor(173966 / 245) + Number(index < 173966 % 245)),
      locator: `Afsnit ${index + 1}`, version: '1', checksum: 'a'.repeat(64),
      document_version_id: `version-${Math.floor(index / 31)}`,
      source_url: 'https://supplier.example/security/documents/latest-auditor-report.pdf',
    })),
  };
  assert(JSON.stringify(input).length < MAX_REPORT_INPUT_CHARS);
  assert.equal(input.sources.reduce((sum, source) => sum + source.text.length, 0), 173966);
  assert.deepEqual(validateReportInput(input).sources, input.sources);
});


test('structured prose retains detailed topics, locked text and source references through final JEV review', async () => {
  const ids = ['document:synthetic-dpa:1'];
  const locked = 'Manglende aftalegrundlag.\nBevar denne præcise afklaring.';
  const summary = '## Konklusion\n\nSyntetisk mødeassistent kræver faglig afklaring før beslutning.\n\n## Dokumenteret grundlag\n\n- Aftalen beskriver behandlingsformålet.\n\n## Skal afklares\n\n- Dokumentér den gældende slettefrist.';
  const topics = ['Personoplysninger', 'Hosting og behandlingssteder', 'Underdatabehandlere', 'Sikkerhed', 'Sletning og opbevaring', 'Aftalevilkår og ansvar', 'AI-funktioner og modelafklaringer'];
  const sectionText = topics.map(topic => `### ${topic}\n\n${'Syntetisk kildeoplysning med afgrænsning til den beskrevne anvendelse. '.repeat(5)}\n\nAfklaring: kontrollér det konkrete dokumentationsgrundlag.`).join('\n\n');
  assert(sectionText.length > 2500 && sectionText.length < 4000);
  const input = {
    request: { system_name: 'Syntetisk mødeassistent' },
    result: { executive_summary: 'Faglig afklaring kræves.', scope: 'Kommunens konkrete anvendelse.', status: 'blocked', blockers: ['Slettefrist er uafklaret'],
      sections: [{ id: '1.1', title: 'Databehandleraftale', text: 'Grundlag for aftalen.', review_status: 'requires_review' },
        { id: '1.2', title: 'Manglende grundlag', text: locked, review_status: 'missing_information' }],
      risks: [{ id: '3.1', area: 'Adgang', scenario: 'Uautoriseret adgang til optagelser.', measures: 'Afklar adgangsstyring.', likelihood: 3, impact: 4 }],
    },
    sources: [{ id: ids[0], title: 'Syntetisk aftale', text: 'Aftalen beskriver behandling af mødeoptagelser. En slettefrist er ikke dokumenteret i det gennemgåede materiale.' }],
  };
  const recommendation = { id: 'synthetic_pilot', title: 'Afprøv sletning', proposal: 'Overvej en afgrænset afprøvning.', rationale: 'Slettefristen skal kunne efterprøves.', prerequisites: 'Afklar aftale og teknisk mulighed.', verification: 'Dokumentér sletning med syntetiske optagelser.', source_ids: ids };
  const sectionDraft = { executive_summary: summary, scope: 'Kommunens anvendelse af den syntetiske mødeassistent.', summary_source_ids: ids,
    sections: [{ id: '1.1', text: sectionText, source_ids: ids }, { id: '1.2', text: 'Et forsøg på at omskrive det låste afsnit.', source_ids: ids }],
    open_questions: ['Hvilken dokumenteret slettefrist gælder?'], recommendations: [recommendation] };
  const riskDraft = { risks: [{ id: '3.1', scenario: 'Uautoriseret adgang kan blotlægge optagelser.', consequences: 'Deltagere kan miste fortrolighed om deres oplysninger.',
    measures: '### Forslag til foranstaltninger\n\n- Afklar adgangsstyring.\n\n### Kontrol før ibrugtagning\n\n- Dokumentér en afprøvning.',
    rationale: 'Adgangskontrollen kræver faglig vurdering.', source_ids: ids }], additional_risks: [] };
  let generationCalls = 0;
  const reviewedStates: { draft: { id: string; text: string; source_ids: string[]; locked_values?: Record<string, unknown> }[] }[] = [];
  const result = await generateReport(input, (units, sourcePool, options) => reviewUnits(units, sourcePool, options, async request => {
    assert.equal(request.model, 'typesafe-ai/jev');
    reviewedStates.push(JSON.parse(request.state));
    return { answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability: .2 }])), usage: {} };
  }), async request => {
    generationCalls++;
    assert.match(request.system, /## Konklusion/);
    assert.match(request.system, /### mellemoverskrifter/);
    for (const topic of topics) assert(request.system.includes(topic));
    assert.match(request.system, /Bevar låste afsnit.*ordret/);
    assert.match(request.system, /Ingen anbefaling.*fjerner en blokering/);
    if (generationCalls === 1) {
      assert(request.schema.safeParse(sectionDraft).success);
      assert(!request.schema.safeParse({ ...sectionDraft, sections: [{ id: '1.1', text: 'x'.repeat(4001), source_ids: ids }] }).success);
      return { output: sectionDraft };
    }
    return { output: riskDraft };
  });
  assert.equal(generationCalls, 2);
  assert.equal(result.prompt_version, PROMPT_VERSION);
  assert.match(result.prompt_version, /v5-structured-prose$/);
  assert.equal(result.draft.executive_summary, summary);
  assert.equal(result.draft.sections[0].text, sectionText);
  assert.equal(result.draft.sections[1].text, locked);
  const reviewed = reviewedStates.flatMap(state => state.draft);
  assert.equal(reviewed.find(unit => unit.id === 'section:1.1')?.text, sectionText);
  assert.equal(reviewed.find(unit => unit.id === 'section:1.2')?.text, locked);
  assert.deepEqual(reviewed.find(unit => unit.id === 'summary')?.locked_values?.blockers, ['Slettefrist er uafklaret']);
  assert.equal(reviewed.find(unit => unit.id === 'risk:3.1')?.locked_values?.likelihood, 3);
  assert.deepEqual(reviewed.find(unit => unit.id === 'recommendation:synthetic_pilot')?.locked_values,
    { role: 'optional_proposal_only', implementation_verified: false, legal_approval: false });
  assert(reviewed.every(unit => unit.source_ids.every(id => ids.includes(id))));
  assert.equal(result.review.status, 'requires_human_review');
});
