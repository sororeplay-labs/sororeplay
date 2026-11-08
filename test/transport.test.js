import test from 'node:test';
import assert from 'node:assert/strict';
import { curlFetch, resilientFetch } from '../src/transport.js';

test('fallback preserves HTTP failures and does not retry successful connections', async () => {
  const response = new Response('busy', { status: 429 });
  const result = await resilientFetch('https://rpc.example', {}, { fetcher: async () => response, fallback: () => { throw new Error('must not run'); } });
  assert.equal(result.status, 429);
});
test('transport fallback receives POST body intact and logs only error code', async () => {
  const options = { method: 'POST', body: '{"method":"getHealth"}' };
  const logs = [];
  const response = await resilientFetch('https://rpc.example', options, {
    fetcher: async () => { throw new TypeError('private details', { cause: { code: 'ENETUNREACH' } }); },
    fallback: async (url, actual) => { assert.equal(url, 'https://rpc.example'); assert.equal(actual.body, options.body); return new Response('{}'); },
    log: message => logs.push(message)
  });
  assert.equal(response.status, 200);
  assert.match(logs[0], /ENETUNREACH/);
  assert.doesNotMatch(logs[0], /private details/);
});
test('curl transport rejects secret URL parameters HTTP and unsupported methods', () => {
  for (const url of ['http://rpc.example', 'https://name:secret@rpc.example', 'https://rpc.example?apikey=secret', 'https://friendbot.stellar.org?addr=bad']) assert.throws(() => curlFetch(url), /credential-free/);
  assert.throws(() => curlFetch('https://rpc.example', { method: 'DELETE' }), /Unsupported/);
});
