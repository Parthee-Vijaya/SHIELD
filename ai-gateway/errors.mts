export function gatewayFailure(error: unknown) {
  let cause = error;
  let status = 503;
  let paidCreditsRequired = false;
  for (let depth = 0; cause && typeof cause === 'object' && depth < 4; depth += 1) {
    if ('statusCode' in cause && typeof cause.statusCode === 'number') status = cause.statusCode;
    if ('message' in cause && typeof cause.message === 'string') {
      paidCreditsRequired ||= cause.message.includes('Free tier users do not have access');
    }
    cause = 'cause' in cause ? cause.cause : null;
  }
  return paidCreditsRequired
    ? { code: 'paid_credits_required', status: 403, message: 'GPT-5.5 kræver betalte AI Gateway-kreditter på Vercel-teamet.' }
    : { code: 'ai_generation_failed', status, message: 'AI-kaldet kunne ikke gennemføres. Ingen ny analyse er gemt.' };
}

/** Only stable categories leave an evaluator process, never provider details. */
export function evaluationFailure(error: unknown) {
  let cause = error;
  let status = 503;
  let hasHttpStatus = false;
  let timeout = false;
  let contextLimit = false;
  let credits = false;
  let missingKey = false;
  for (let depth = 0; cause && typeof cause === 'object' && depth < 6; depth += 1) {
    if ('statusCode' in cause && typeof cause.statusCode === 'number') {
      status = cause.statusCode;
      hasHttpStatus = true;
    }
    if ('name' in cause) timeout ||= cause.name === 'TimeoutError' || cause.name === 'AbortError';
    if ('message' in cause && typeof cause.message === 'string') {
      contextLimit ||= cause.message === 'REVIEW_CONTEXT_TOO_LARGE';
      missingKey ||= cause.message === 'GATEWAY_NOT_CONFIGURED';
      credits ||= cause.message.includes('Free tier users do not have access');
    }
    cause = 'cause' in cause && cause.cause ? cause.cause
      : 'lastError' in cause ? cause.lastError : null;
  }
  const code = timeout ? 'evaluation_timeout' : contextLimit ? 'review_context_too_large'
    : missingKey ? 'gateway_not_configured' : credits ? 'paid_credits_required'
    : status === 429 ? 'evaluation_rate_limited'
    : status === 401 || status === 403 ? 'evaluation_access_denied'
    : hasHttpStatus && [500, 502, 503, 504].includes(status) ? 'evaluation_temporarily_unavailable'
    : 'evaluation_failed';
  return { code, status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503 };
}
