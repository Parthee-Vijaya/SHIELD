/** Offline cross-language bridge: real batching, consolidation and JEV planning. */
import { analyzeMaterial } from '../../ai-gateway/analyze-material.mts';
import { planSourceBatches } from '../../ai-gateway/source-batches.mts';
import { reviewUnits } from '../../ai-gateway/review.mts';

let body = '';
for await (const chunk of process.stdin) body += chunk;
const input = JSON.parse(body);
const batches = planSourceBatches(input.sources, 12000);
let calls = 0;
const generate = async () => {
  const index = calls++;
  if (process.argv.includes('--fail-second') && index === 1) throw Error('SYNTHETIC_BATCH_FAILURE');
  const source = batches[index]?.[0];
  return { output: {
    summary: source ? 'Leverandørens delgrundlag indeholder hostingoplysninger, som skal sammenholdes med de øvrige bilag.' : 'Delgrundlagene beskriver forskellige hostingregioner. Den gældende aftale og dataflow skal afklares.',
    facts: source ? [{ id: 'hosting', field: 'hosting_region', value: index === 0 ? 'denmark' : 'eu_eea', source_refs: [{ source_id: source.id, quote: source.text.slice(0, source.text.indexOf('\n')) }] }] : [],
    questions: [{ id: `question_${index}`, question: 'Hvilken aftaleversion gælder for kommunens konkrete anvendelse?', topic: 'Aftalegrundlag', priority: 'high' as const }],
    conflicts: [],
  }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
};
const result = await analyzeMaterial(input, (units, sources, options) => reviewUnits(units, sources, options, async request => ({
  answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { probability: 0.2 }])),
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
})), generate);
process.stdout.write(JSON.stringify(result));
