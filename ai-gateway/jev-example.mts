import { experimental_evaluate as evaluate } from 'ai';
import { EVALUATOR_MODEL } from './review.mts';

try {
  const result = await evaluate({
    model: EVALUATOR_MODEL,
    state: {
      evidence: 'Dette er en syntetisk test. Adgangsloggen er planlagt, men endnu ikke implementeret.',
      draft: 'Adgangsloggen er implementeret og kontrolleres hver uge.',
    },
    questions: {
      unsupported_implementation: {
        type: 'boolean',
        instructions: 'Does the draft claim that a safeguard is implemented despite the evidence saying it is only planned?',
      },
    },
    abortSignal: AbortSignal.timeout(30_000),
    maxRetries: 0,
  });
  console.log(JSON.stringify(result.answers, null, 2));
} catch {
  console.error('JEV-testen mislykkedes. Ingen forespørgselsdetaljer er logget.');
  process.exitCode = 1;
}
