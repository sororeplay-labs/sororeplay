import { StrKey, xdr, scValToNative } from '@stellar/stellar-sdk';

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function jsonNative(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { bytesBase64: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(jsonNative);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonNative(item)]));
  return value;
}

export function decodeEvent(event) {
  const decode = value => jsonNative(scValToNative(xdr.ScVal.fromXDR(value, 'base64')));
  return { topics: event.topic.map(decode), data: decode(event.value) };
}

export function validateFixture(fixture) {
  if (fixture?.schemaVersion !== 1 || !StrKey.isValidContract(fixture.contractId)) throw new Error('Invalid fixture version or contract ID');
  if (typeof fixture.networkPassphrase !== 'string' || !fixture.networkPassphrase) throw new Error('Missing network passphrase');
  if (!Number.isSafeInteger(fixture.startLedger) || !Number.isSafeInteger(fixture.endLedger) || fixture.startLedger < 1 || fixture.endLedger <= fixture.startLedger) throw new Error('Invalid half-open ledger window');
  if (!Array.isArray(fixture.events) || fixture.events.length > 100000) throw new Error('Expected at most 100,000 events');
  const seen = new Set();
  for (const event of fixture.events) {
    if (!event || typeof event.id !== 'string' || !/^\d+-\d+$/.test(event.id)) throw new Error('Invalid event ID');
    if (seen.has(event.id)) throw new Error('Fixture contains duplicate event ID: ' + event.id);
    seen.add(event.id);
    if (event.contractId !== fixture.contractId || event.type !== 'contract') throw new Error('Event contract/type does not match fixture');
    if (!Number.isSafeInteger(event.ledger) || event.ledger < fixture.startLedger || event.ledger >= fixture.endLedger) throw new Error('Event outside ledger window');
    if ((BigInt(event.id.split('-')[0]) >> 32n) !== BigInt(event.ledger)) throw new Error('Event ID ledger does not match event metadata');
    if (!/^[a-f0-9]{64}$/.test(event.txHash)) throw new Error('Invalid event transaction hash');
    if (!Array.isArray(event.topic) || event.topic.length > 4 || event.topic.some(t => typeof t !== 'string') || typeof event.value !== 'string') throw new Error('Invalid raw event shape');
    if (event.inSuccessfulContractCall === false) throw new Error('Unsuccessful call event cannot be replayed as committed');
    decodeEvent(event); // Validate XDR rather than trusting a separately supplied decoded payload.
  }
  if (fixture.complete !== true) throw new Error('Incomplete capture cannot be replayed');
  return fixture;
}

export function compareEventIds(a, b) {
  const [at, ai] = a.id.split('-').map(BigInt);
  const [bt, bi] = b.id.split('-').map(BigInt);
  return at < bt ? -1 : at > bt ? 1 : ai < bi ? -1 : ai > bi ? 1 : 0;
}

export function differences(expected, actual, path = '$') {
  if (canonical(expected) === canonical(actual)) return [];
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual)) {
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap(key => differences(expected[key], actual[key], path + '.' + key));
  }
  return [{ path, expected: expected === undefined ? { missing: true } : expected, actual: actual === undefined ? { missing: true } : actual }];
}

/** Adapter: {initialState(), apply(state, event), project(state)}. Use only trusted adapters. */
export async function replay(fixture, adapter, expectations, { profiles = ['canonical', 'duplicate'], timeoutMs = 2000 } = {}) {
  validateFixture(fixture);
  if (!adapter || !['initialState', 'apply', 'project'].every(name => typeof adapter[name] === 'function')) throw new Error('Invalid adapter interface');
  if (!expectations || expectations.schemaVersion !== 1 || !Object.hasOwn(expectations, 'state')) throw new Error('Expected an independently authored state oracle');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid timeout');
  if (!Array.isArray(profiles) || !profiles.length || profiles.some(p => !['canonical', 'duplicate', 'reverse'].includes(p))) throw new Error('Unknown replay profile');
  const events = [...fixture.events].sort(compareEventIds);
  const results = [];
  for (const profile of profiles) {
    if (profile === 'reverse' && !expectations.orderIndependent) throw new Error('Reverse replay requires an explicit orderIndependent expectation');
    const deliveries = profile === 'duplicate' ? events.flatMap(e => [e, e]) : profile === 'reverse' ? [...events].reverse() : events;
    let timer;
    try {
      const work = async () => {
        let state = await adapter.initialState();
        for (const event of deliveries) state = await adapter.apply(state, { ...structuredClone(event), decoded: decodeEvent(event) });
        const actual = await adapter.project(state);
        // Require JSON-safe projected state; all monetary bigints must be explicit strings.
        if (JSON.stringify(actual) === undefined) throw new Error('Adapter projection must be JSON-safe');
        const diff = differences(expectations.state, actual);
        return { profile, passed: diff.length === 0, deliveries: deliveries.length, actual, differences: diff };
      };
      results.push(await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Adapter timeout')), timeoutMs); })]));
    } catch (error) {
      results.push({ profile, passed: false, error: error.message });
    } finally { clearTimeout(timer); }
  }
  return { schemaVersion: 1, mode: 'fixture replay', contractId: fixture.contractId, eventCount: events.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
}
