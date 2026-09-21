/** Evaluation only: an explicit local Codex test must never invoke drafting. */
import { z } from 'zod';
import { buildReviewUnits, recommendationSchema, validateDraftIds } from './generate-report.mts';
import { reviewUnits } from './review.mts';
import { evaluationFailure } from './errors.mts';

const sourceIds = z.array(z.string()).min(1).max(100);
const prose = z.string().min(1).max(20000);
const schema = z.object({
  sources: z.array(z.object({ id: z.string(), title: z.string(), text: z.string() }).passthrough()).min(1),
  result: z.object({
    executive_summary: z.string(), scope: z.string(),
    sections: z.array(z.object({ id: z.string(), title: z.string(), text: z.string() }).passthrough()).length(39),
    risks: z.array(z.object({ id: z.string(), area: z.string(), scenario: z.string(), measures: z.string() }).passthrough()).length(33),
  }).passthrough(),
  draft: z.object({
    executive_summary: prose, scope: prose, summary_source_ids: sourceIds,
    sections: z.array(z.object({ id: z.string(), text: prose, source_ids: sourceIds }).strict()).length(39),
    risks: z.array(z.object({ id: z.string(), scenario: prose, consequences: z.string().max(12000),
      measures: prose, rationale: prose, source_ids: sourceIds }).strict()).length(33),
    additional_risks: z.array(z.object({ title: prose, scenario: prose, measures: prose, source_ids: sourceIds }).strict()).max(30),
    recommendations: z.array(recommendationSchema).max(8).default([]),
    open_questions: z.array(z.string()).max(100),
  }).strict(),
}).strict();

export async function reviewDraft(raw: unknown, evaluator = reviewUnits) {
  const input = schema.parse(raw);
  if (JSON.stringify(input).length > 1_500_000) throw new Error('INPUT_TOO_LARGE');
  if (new Set(input.sources.map(source => source.id)).size !== input.sources.length) throw new Error('INVALID_SOURCES');
  validateDraftIds(input.result, input.draft, input.sources);
  const known = new Set(input.sources.map(source => source.id));
  if (input.draft.summary_source_ids.some(id => !known.has(id))) throw new Error('INVALID_SOURCE_REFERENCE');
  for (const original of input.result.sections) {
    if (['missing_information', 'not_applicable'].includes(String(original.review_status)) &&
      input.draft.sections.find(section => section.id === original.id)?.text !== original.text) throw new Error('LOCKED_SECTION_CHANGED');
  }
  // Local full-report review tolerates a slower batch; the application path
  // keeps reviewUnits' existing 30-second default and the CLI has a total cap.
  return evaluator(buildReviewUnits(input, input.draft), input.sources, {
    perBatchTimeoutMs: 90_000, maxRetries: 2,
  });
}

async function main() {
  let body = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error('INPUT_TOO_LARGE');
  }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('GATEWAY_NOT_CONFIGURED');
  process.stdout.write(JSON.stringify(await reviewDraft(JSON.parse(body))));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    process.stdout.write(JSON.stringify({ error: evaluationFailure(error) }));
    process.exitCode = 1;
  });
}
