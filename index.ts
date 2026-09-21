import { generateText } from 'ai';
import { gatewayFailure } from './ai-gateway/errors.mts';

// Run with `npm run ai:example`; the key stays in the server environment.
try {
  const { text } = await generateText({
    model: 'openai/gpt-5.5',
    prompt: 'Opfind en ny højtid og beskriv dens traditioner på dansk. Svar med højst 150 ord.',
    abortSignal: AbortSignal.timeout(90_000),
  });
  if (!text.trim()) throw new Error('EMPTY_RESPONSE');
  console.log(text);
} catch (error) {
  // SDK errors can contain request details. Never print the raw exception.
  console.error(gatewayFailure(error).message);
  process.exitCode = 1;
}
