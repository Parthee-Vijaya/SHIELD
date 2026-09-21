import { generateText, Output } from 'ai';
import { z } from 'zod';

export const MAX_SOURCE_TEXT_CHARS = 5_000_000;
export const MAX_SOURCE_COUNT = 10_000;
export const MAX_DOCUMENT_COUNT = 100;
export const MAX_DRAFT_BATCHES = 20;
export const MAX_BATCH_TEXT_CHARS = 500_000;
export const MAX_BATCH_SOURCE_COUNT = 1_000;
export const MAX_BATCH_DOCUMENT_COUNT = 25;
export const MAX_GENERATION_CONTEXT_CHARS = 1_200_000;
export const MAX_MAP_RESULT_CHARS = 45_000;

export interface BatchSource { id: string; title: string; text: string; [key: string]: unknown }
export interface GenerationRequest { model: string; system: string; prompt: string; schema: z.ZodType; maxOutputTokens: number }
export type StructuredGenerator = (request: GenerationRequest) => Promise<{ output: unknown; usage?: unknown }>;
export const generateStructured: StructuredGenerator = async ({ schema, ...request }) => {
  assertGenerationContext(request.system, request.prompt);
  const result = await generateText({ ...request, output: Output.object({ schema }), maxRetries: 0, abortSignal: AbortSignal.timeout(160_000) });
  return { output: result.output, usage: result.usage };
};
export function assertGenerationContext(system: string, prompt: string) {
  if (system.length + prompt.length > MAX_GENERATION_CONTEXT_CHARS) throw new Error('BATCH_CONTEXT_TOO_LARGE');
}
export const sourceTextLength = (text: string) => Array.from(text).length;
function documentId(source: BatchSource): string | undefined {
  if (typeof source.document_version_id === 'string' && source.document_version_id) return source.document_version_id;
  if (source.id.startsWith('document:')) return source.id.split(':')[1];
  return undefined;
}
export function validateSourcePool(sources: BatchSource[]) {
  if (!sources.length || new Set(sources.map(source => source.id)).size !== sources.length) throw new Error('INVALID_SOURCES');
  if (sources.length > MAX_SOURCE_COUNT || sources.reduce((sum, source) => sum + sourceTextLength(source.text), 0) > MAX_SOURCE_TEXT_CHARS ||
    new Set(sources.map(documentId).filter(Boolean)).size > MAX_DOCUMENT_COUNT) throw new Error('SOURCE_POOL_TOO_LARGE');
}
export function planSourceBatches<T extends BatchSource>(sources: T[], contextOverheadChars = 0): T[][] {
  validateSourcePool(sources);
  if (contextOverheadChars >= MAX_GENERATION_CONTEXT_CHARS) throw new Error('BATCH_CONTEXT_TOO_LARGE');
  const batches: T[][] = [];
  let batch: T[] = [], textChars = 0, serializedChars = 2;
  let documents = new Set<string>();
  for (const source of sources) {
    const document = documentId(source);
    const sourceChars = JSON.stringify(source).length + 1;
    const exceeds = () => batch.length + 1 > MAX_BATCH_SOURCE_COUNT || textChars + sourceTextLength(source.text) > MAX_BATCH_TEXT_CHARS ||
      documents.size + Number(Boolean(document && !documents.has(document))) > MAX_BATCH_DOCUMENT_COUNT ||
      contextOverheadChars + serializedChars + sourceChars > MAX_GENERATION_CONTEXT_CHARS;
    if (exceeds() && batch.length) { batches.push(batch); batch = []; textChars = 0; serializedChars = 2; documents = new Set(); }
    if (exceeds()) throw new Error('SOURCE_EXCEEDS_BATCH_LIMIT');
    batch.push(source); textChars += sourceTextLength(source.text); serializedChars += sourceChars;
    if (document) documents.add(document);
  }
  if (batch.length) batches.push(batch);
  if (batches.length > MAX_DRAFT_BATCHES) throw new Error('TOO_MANY_SOURCE_BATCHES');
  return batches;
}
export interface BatchResultSummary { summary?: string; fact_count?: number; conflict_count?: number; question_count?: number; finding_count?: number }
export function batchingMetadata(batches: BatchSource[][], synthesisCallCount: number, mapCallCount = batches.length > 1 ? batches.length : 0, summaries: BatchResultSummary[] = [], conflictCount = 0) {
  return {
    strategy: batches.length > 1 ? 'map-reduce-v1' : 'single-pass-v1',
    batch_count: batches.length, source_count: batches.reduce((sum, batch) => sum + batch.length, 0),
    source_text_chars: batches.flat().reduce((sum, source) => sum + sourceTextLength(source.text), 0),
    batches: batches.map((batch, index) => ({ index: index + 1, source_ids: batch.map(source => source.id),
      source_text_chars: batch.reduce((sum, source) => sum + sourceTextLength(source.text), 0), document_count: new Set(batch.map(documentId).filter(Boolean)).size, ...(summaries[index] || {}) })),
    map_call_count: mapCallCount, synthesis_call_count: synthesisCallCount, cross_batch_conflict_count: conflictCount,
    consolidation_note: batches.length > 1 ? `Alle delresultater er sammenholdt. ${conflictCount} mulige modstrid er bevaret som afklaringspunkter; ingen flertalsafgørelse eller automatisk godkendelse. Samlingen bygger på citerede evidensudtræk, ikke hele kildeteksten i ét modelkald.` : 'Hele kildegrundlaget indgik i én del. Ingen automatisk godkendelse.',
  };
}
export function boundedMapResult<T>(value: T): T {
  if (JSON.stringify(value).length > MAX_MAP_RESULT_CHARS) throw new Error('BATCH_FINDINGS_TOO_LARGE');
  return value;
}
