import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableError, computeNextAttemptTime } from './retry';
import { JOB_HANDLERS } from './worker';

test('Job retry classifier identifies transient vs non-transient errors', () => {
  // Transient
  assert.equal(isRetryableError(new Error('Rate limit exceeded: 429')), true);
  assert.equal(isRetryableError(new Error('ETIMEDOUT: Connection timeout')), true);
  assert.equal(isRetryableError(new Error('503 Service Unavailable')), true);
  assert.equal(isRetryableError({ code: 429, message: 'Too Many Requests' }), true);
  assert.equal(isRetryableError({ code: 500, message: 'Internal Server Error' }), true);

  // Permanent
  assert.equal(isRetryableError(new Error('400 Bad Request')), false);
  assert.equal(isRetryableError(new Error('401 Unauthorized: Invalid API key')), false);
  assert.equal(isRetryableError(new Error('403 Forbidden')), false);
  assert.equal(isRetryableError(new Error('Invalid Zod schema output')), false);
});

test('Exponential backoff calculation increases delay with attempt count', () => {
  const baseMs = 2000;
  const time1 = new Date(computeNextAttemptTime(1, baseMs)).getTime();
  const time2 = new Date(computeNextAttemptTime(2, baseMs)).getTime();
  const time3 = new Date(computeNextAttemptTime(3, baseMs)).getTime();

  const now = Date.now();
  const delay1 = time1 - now;
  const delay2 = time2 - now;
  const delay3 = time3 - now;

  assert.ok(delay2 > delay1);
  assert.ok(delay3 > delay2);
});

test('Job worker registers all required job handlers', () => {
  const requiredTypes = [
    'process_provider_event',
    'project_account_features',
    'evaluate_recovery_case',
    'run_case_analysis',
    'generate_case_draft',
    'verify_case_draft',
    'notify_founder',
    'send_approved_draft',
    'sync_gmail_history',
    'classify_case_outcome',
  ];

  for (const jobType of requiredTypes) {
    assert.ok(typeof (JOB_HANDLERS as any)[jobType] === 'function', `Missing handler for ${jobType}`);
  }
});
