// Display names only; the saved model and provenance remain unchanged.
export function modelLabel(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return ({
    'openai/gpt-5.5': 'GPT-5.5', 'gpt-5.5': 'GPT-5.5',
    'gpt-5.6-sol': 'GPT-5.6 Sol', 'openai/gpt-5.6-sol': 'GPT-5.6 Sol',
    'gpt-6-astra': 'GPT-6 Astra', 'openai/gpt-6-astra': 'GPT-6 Astra',
    'typesafe-ai/jev': 'JEV',
  })[id] || id || 'Ikke registreret';
}

// Only known platform metadata is rewritten. Source excerpts and substantive
// assessment text must never pass through a broad search-and-replace.
export function modelNote(value, model) {
  if (typeof value !== 'string') return '';
  if (/^(?:Testudkast|Udkast) udarbejdet i Codex med [^;]+; JEV-kontrol via AI Gateway\.$/i.test(value)) {
    return `Udarbejdet med ${modelLabel(model)}. Kontrolleret med JEV.`;
  }
  if (/^Model og (?:test)?kørsels-ID er (?:angivet|oplyst).*\b(?:Codex|import)/i.test(value)) {
    return 'Modeloplysningen er angivet ved importen og er ikke automatisk verificeret.';
  }
  if (/^Codex-forbrug er ikke tilgængeligt i denne import\.$/i.test(value)) {
    return 'Forbrug til udarbejdelsen er ikke registreret.';
  }
  return value;
}

export const modelNotes = (values, model) => Array.isArray(values)
  ? [...new Set(values.map(value => modelNote(value, model)).filter(Boolean))] : [];
