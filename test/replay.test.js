import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, compareEventIds, decodeEvent, validateFixture, replay, differences } from '../src/index.js';
import { fixture, expected, event } from '../examples/make-fixture.js';
import good from '../examples/credit-handler.js';
import broken from '../examples/broken-handler.js';

test('SDK decodes raw XDR topics and payload', () => {
  assert.deepEqual(decodeEvent(fixture.events[0]), { topics: ['credit', 'alice'], data: { amount: 4 } });
});
test('good handler passes canonical duplicate and explicitly order-independent replay', async () => {
  const result = await replay(fixture, good, expected, { profiles: ['canonical', 'duplicate', 'reverse'] });
  assert.equal(result.passed, 3);
  assert.equal(result.results[1].deliveries, 6);
});
test('deliberate idempotency defect is exposed with a precise state diff', async () => {
  const result = await replay(fixture, broken, expected);
  assert.equal(result.results[0].passed, true);
  assert.equal(result.results[1].passed, false);
  assert.ok(result.results[1].differences.some(d => d.path === '$.balances.alice' && d.actual === '20'));
});
test('replay sorts shuffled raw fixture into original event order', async () => {
  const shuffled = { ...fixture, events: [...fixture.events].reverse() };
  const sequence = { initialState: () => [], apply: (state, e) => [...state, e.id], project: state => state };
  const result = await replay(shuffled, sequence, { schemaVersion: 1, state: fixture.events.map(e => e.id) }, { profiles: ['canonical'] });
  assert.equal(result.failed, 0);
});
test('duplicate IDs, malformed XDR, wrong contracts and out-of-window records fail closed', () => {
  for (const mutate of [f => f.events.push(f.events[0]), f => f.events[0].value = 'invalid', f => f.events[0].contractId = 'Cbad', f => f.events[0].ledger = 101, f => f.complete = false, f => f.events[0].inSuccessfulContractCall = false]) {
    const f = structuredClone(fixture); mutate(f); assert.throws(() => validateFixture(f));
  }
});
test('event ID comparison uses integers beyond JavaScript safe numeric range', () => {
  assert.ok(compareEventIds({ id: '9999999999999999999-10' }, { id: '9999999999999999999-2' }) > 0);
});
test('unknown profiles and unapproved reorder checks are rejected', async () => {
  await assert.rejects(replay(fixture, good, { ...expected, orderIndependent: false }, { profiles: ['reverse'] }), /orderIndependent/);
  await assert.rejects(replay(fixture, good, expected, { profiles: ['shuffle'] }), /Unknown/);
});
test('async handler timeout and thrown errors produce failed results', async () => {
  const slow = { ...good, apply: () => new Promise(() => {}) };
  const report = await replay(fixture, slow, expected, { profiles: ['canonical'], timeoutMs: 10 });
  assert.equal(report.failed, 1);
  assert.match(report.results[0].error, /timeout/);
});
test('adapters cannot mutate fixture or expected state oracle', async () => {
  const before = canonical(fixture);
  const adapter = { ...good, apply: (state, e) => { e.value = 'changed'; return state; } };
  assert.equal((await replay(fixture, adapter, expected)).failed, 2);
  assert.equal(canonical(fixture), before);
});
test('diff handles missing and unexpected state fields', () => {
  assert.deepEqual(differences({ a: '1' }, { b: '2' }).map(d => d.path), ['$.a', '$.b']);
  assert.doesNotThrow(() => validateFixture({ ...fixture, events: [event(4, 'alice', 1)] }));
});
test('fixture event IDs must agree with ledger metadata', () => {
  const f = structuredClone(fixture);
  f.events[0].id = '0000000000000000001-0000000000';
  assert.throws(() => validateFixture(f), /metadata/);
});
test('undefined projections are rejected instead of passing a missing oracle', async () => {
  const result = await replay(fixture, { ...good, project: () => undefined }, expected);
  assert.equal(result.failed, 2);
  assert.match(result.results[0].error, /JSON-safe/);
});
