import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluationFailure, gatewayFailure } from './errors.mts';

test('evaluation error categories never expose raw details', () => {
  const secretLookingDetail = 'upstream private header and document contents';
  for (const [error, expected] of [
    [new DOMException(secretLookingDetail, 'TimeoutError'), 'evaluation_timeout'],
    [new Error('REVIEW_CONTEXT_TOO_LARGE'), 'review_context_too_large'],
    [{ statusCode: 429, message: secretLookingDetail }, 'evaluation_rate_limited'],
    [{ statusCode: 401, message: secretLookingDetail }, 'evaluation_access_denied'],
    [{ statusCode: 503, message: secretLookingDetail }, 'evaluation_temporarily_unavailable'],
    [new Error(secretLookingDetail), 'evaluation_failed'],
    [new Error('Free tier users do not have access'), 'paid_credits_required'],
  ] as const) {
    const failure = evaluationFailure(error);
    assert.equal(failure.code, expected);
    assert.equal(JSON.stringify(failure).includes(secretLookingDetail), false);
    assert.deepEqual(Object.keys(failure), ['code', 'status']);
  }
});

test('exhausted SDK retries retain a safe temporary-unavailability category', () => {
  const error = { name: 'AI_RetryError', message: 'private provider details',
    lastError: { name: 'GatewayInternalServerError', statusCode: 503,
      cause: { name: 'AI_APICallError', statusCode: 503, message: 'private document content' } } };
  assert.deepEqual(evaluationFailure(error), { code: 'evaluation_temporarily_unavailable', status: 503 });
});

test('nested timeout is recognized while existing generation classification stays stable', () => {
  const failure = evaluationFailure(new Error('private request details', {
    cause: new DOMException('aborted', 'AbortError'),
  }));
  assert.equal(failure.code, 'evaluation_timeout');
  assert.equal(gatewayFailure(new Error('Free tier users do not have access')).code, 'paid_credits_required');
});
