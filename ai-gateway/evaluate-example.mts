// An isolated evaluator test. This never represents a completed GPT report.
import { z } from 'zod';
import { reviewUnits } from './review.mts';

const inputSchema = z.object({
  sources: z.array(z.object({
    id: z.string(), title: z.string(), text: z.string().max(25_000),
  })).min(1).max(3),
  units: z.array(z.object({
    id: z.string(), label: z.string(), text: z.string(),
    source_ids: z.array(z.string()),
    kind: z.enum(['section', 'risk', 'summary']),
  })).min(1).max(6),
});

try {
  process.stdin.setEncoding('utf8');
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('EXAMPLE_TOO_LARGE');
  }
  const input = inputSchema.parse(JSON.parse(raw));
  const review = await reviewUnits(input.units, input.sources);
  process.stdout.write(JSON.stringify(review));
} catch {
  process.stdout.write(JSON.stringify({ error: 'Den separate JEV-kildetest kunne ikke gennemføres.' }));
  process.exitCode = 1;
}
