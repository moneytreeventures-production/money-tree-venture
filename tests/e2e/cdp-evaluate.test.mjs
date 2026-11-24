import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyCdpException, evaluateCdp } from './cdp-evaluate.mjs';

test('undefined CDP value is not an exception', async () => {
  const value = await evaluateCdp(async () => ({ result: { type: 'undefined' } }), { label: 'page-readiness', expression: 'void 0', stage: 'startup' });
  assert.equal(value, undefined);
});

test('navigation context loss is classified without leaking exception content', async () => {
  const detail = { text: 'Uncaught', exception: { description: 'Error: Execution context was destroyed at https://example.test/callback?token=private' } };
  assert.deepEqual(classifyCdpException(detail), { category: 'Error', description: 'Page execution context changed during navigation.', contextLost: true });
  await assert.rejects(
    evaluateCdp(async () => ({ exceptionDetails: detail }), { label: 'anonymous-api-denial', expression: 'secret-expression', stage: 'anonymous-login-page' }),
    error => error.contextLost === true && !error.message.includes('token=') && !error.message.includes('secret-expression') && error.message.includes('elapsedMs='),
  );
});

test('browser exceptions and command failures have fixed safe descriptions', async () => {
  await assert.rejects(
    evaluateCdp(async () => ({ exceptionDetails: { exception: { description: 'TypeError: Failed to fetch https://private.test/?key=secret' } } }), { label: 'role-api-check', expression: 'private', stage: 'manual-login-complete' }),
    error => error.message.includes('TypeError: Browser request failed.') && !error.message.includes('private.test'),
  );
  await assert.rejects(
    evaluateCdp(async () => { throw new Error('Authorization: secret'); }, { label: 'role-api-check', expression: 'private', stage: 'manual-login-complete' }),
    error => error.message.includes('CDP command failed') && !error.message.includes('secret'),
  );
});
