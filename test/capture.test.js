import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, TESTNET, rpcCall } from '../src/capture.js';
import { contractId, event } from '../examples/make-fixture.js';

function mock(pages, overrides = {}) {
  const requests = []; let i = 0;
  return { requests, fetcher: async (_, init) => {
    const request = JSON.parse(init.body); requests.push(request);
    const result = request.method === 'getNetwork' ? { passphrase: overrides.network ?? TESTNET } : request.method === 'getHealth' ? { status: 'healthy', oldestLedger: 50, latestLedger: 110 } : pages[i++];
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  } };
}
const options = { contractId, startLedger: 100, endLedger: 101 };
test('capture binds contract and frozen ledger window and records raw events', async () => {
  const m = mock([{ events: [event(0, 'alice', 4)], latestLedger: 110 }]);
  const result = await capture({ ...options, fetcher: m.fetcher });
  assert.equal(result.complete, true);
  assert.equal(result.events.length, 1);
  assert.deepEqual(m.requests[2].params.filters[0].contractIds, [contractId]);
});
test('cursor requests omit ledger bounds and deduplicate identical records', async () => {
  const e = event(0, 'alice', 4);
  const m = mock([{ events: [e], cursor: 'first', latestLedger: 110 }, { events: [e], cursor: 'second', latestLedger: 110 }, { events: [], latestLedger: 110 }]);
  const f = await capture({ ...options, pageSize: 1, fetcher: m.fetcher });
  assert.equal(f.events.length, 1);
  assert.equal(m.requests[3].params.startLedger, undefined);
  assert.equal(m.requests[3].params.endLedger, undefined);
  assert.equal(m.requests[3].params.pagination.cursor, 'first');
});
test('pagination cap and conflicting duplicate IDs never produce partial success', async () => {
  const e = event(0, 'alice', 4);
  const m = mock([{ events: [e], cursor: 'first', latestLedger: 110 }]);
  await assert.rejects(capture({ ...options, pageSize: 1, maxPages: 1, fetcher: m.fetcher }), /cap/);
  const conflict = mock([{ events: [e], cursor: 'first', latestLedger: 110 }, { events: [{ ...e, value: event(0, 'alice', 99).value }], cursor: 'second', latestLedger: 110 }]);
  await assert.rejects(capture({ ...options, pageSize: 1, fetcher: conflict.fetcher }), /Conflicting/);
});
test('cursor pages cannot leak events beyond original window', async () => {
  const m = mock([{ events: [event(0, 'alice', 4)], cursor: 'first', latestLedger: 110 }, { events: [{ ...event(1, 'bob', 7), ledger: 101 }], cursor: 'second', latestLedger: 110 }]);
  assert.equal((await capture({ ...options, pageSize: 1, fetcher: m.fetcher })).events.length, 1);
});
test('mainnet endpoints and expired history are refused', async () => {
  await assert.rejects(capture({ ...options, fetcher: mock([], { network: 'Public Global Stellar Network ; September 2015' }).fetcher }), /Testnet/);
  await assert.rejects(capture({ ...options, startLedger: 1, fetcher: mock([]).fetcher }), /retained/);
});
test('RPC errors and unsafe endpoints are surfaced', async () => {
  await assert.rejects(rpcCall('http://example.com', 'getHealth'), /HTTPS/);
  await assert.rejects(rpcCall('https://rpc.example', 'getHealth', {}, { fetcher: async () => new Response(JSON.stringify({ error: { code: -1, message: 'bad request' } })) }), /bad request/);
});
