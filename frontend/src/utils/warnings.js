/**
 * Filter LLM-config noise warnings out of v3 response payloads.
 *
 * The v3 endpoints surface backend warnings that include LLM-provider
 * connectivity errors (api_key 401, model unloaded, network timeouts).
 * Those are infrastructure noise — irrelevant to the legal output and
 * should not show up in the case-focused result UI.
 *
 * Anything matching one of these patterns is dropped before the
 * frontend renders a "Bemærkninger"-banner. Other warnings (e.g. about
 * missing predicate input) still surface as they should.
 */
const NOISE_PATTERNS = [
  /signal extraction failed.*LLM invocation failed/i,
  /Incorrect API key|Invalid API key|api_key|api[- ]key/i,
  /Operation canceled|Model unloaded/i,
  /401|invalid_request_error|invalid_api_key/i,
];

export const filterNoiseWarnings = (warnings = []) =>
  warnings.filter(
    (w) => !NOISE_PATTERNS.some((re) => re.test(String(w))),
  );
