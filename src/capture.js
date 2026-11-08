import { StrKey } from '@stellar/stellar-sdk';
import { canonical, compareEventIds, validateFixture } from './index.js';
import { resilientFetch } from './transport.js';

export const TESTNET = 'Test SDF Network ; September 2015';
export const TESTNET_RPC = 'https://soroban-testnet.stellar.org';

export async function rpcCall(endpoint, method, params = {}, { fetcher = resilientFetch, allowLocal = false } = {}) {
  const url = new URL(endpoint);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(allowLocal && loopback && url.protocol === 'http:')) || url.username || url.password || url.hash || url.search) throw new Error('Use a credential-free HTTPS RPC endpoint without query parameters');
  const response = await fetcher(url.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error('RPC HTTP ' + response.status);
  // Limit body size before JSON parsing.
  let length = 0;
  const chunks = [];
  for await (const chunk of response.body ?? []) {
    length += chunk.length;
    if (length > 16777216) throw new Error('RPC response exceeds 16 MiB');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const body = JSON.parse(text);
  if (body.error) throw new Error('RPC ' + method + ': ' + body.error.code + ' ' + body.error.message);
  if (body.result === undefined) throw new Error('Missing RPC result');
  return body.result;
}

/** Capture a fixed [startLedger, endLedger) window. Never return a partial fixture. */
export async function capture({ endpoint = TESTNET_RPC, contractId, startLedger, endLedger, pageSize = 100, maxPages = 100, ...transport }) {
  if (!StrKey.isValidContract(contractId)) throw new Error('Invalid contract ID');
  if (!Number.isSafeInteger(startLedger) || !Number.isSafeInteger(endLedger) || startLedger < 1 || endLedger <= startLedger) throw new Error('Invalid half-open ledger window');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 10000 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) throw new Error('Invalid pagination bounds');
  const call = (method, params) => rpcCall(endpoint, method, params, transport);
  const network = await call('getNetwork', {});
  if (network.passphrase !== TESTNET) throw new Error('Capture MVP is restricted to Stellar Testnet');
  const health = await call('getHealth', {});
  if (health.status !== 'healthy' || !Number.isSafeInteger(health.oldestLedger) || !Number.isSafeInteger(health.latestLedger)) throw new Error('Unhealthy or malformed RPC health response');
  if (startLedger < health.oldestLedger || endLedger > health.latestLedger + 1) throw new Error('Requested window is outside retained RPC history');
  const found = new Map();
  let cursor;
  const cursors = new Set();
  let complete = false;
  for (let page = 0; page < maxPages; page++) {
    const params = { filters: [{ type: 'contract', contractIds: [contractId] }], pagination: { limit: pageSize, ...(cursor ? { cursor } : {}) } };
    if (!cursor) Object.assign(params, { startLedger, endLedger });
    const result = await call('getEvents', params);
    if (!Array.isArray(result.events) || !Number.isSafeInteger(result.latestLedger)) throw new Error('Malformed event collection');
    let reachedEnd = false;
    for (const event of result.events) {
      if (event.ledger >= endLedger) { reachedEnd = true; continue; }
      if (found.has(event.id) && canonical(found.get(event.id)) !== canonical(event)) throw new Error('Conflicting duplicate event ID');
      found.set(event.id, event);
      if (found.size > 100000) throw new Error('Capture exceeds event limit');
    }
    // Cursor requests omit the original bounds: filter the frozen window locally.
    if (reachedEnd || result.events.length < pageSize) {
      if (result.latestLedger < endLedger - 1) throw new Error('RPC has not reached the end of the requested window');
      complete = true;
      break;
    }
    if (typeof result.cursor !== 'string' || !result.cursor || cursors.has(result.cursor)) throw new Error('Missing or stalled event cursor');
    cursors.add(result.cursor);
    cursor = result.cursor;
  }
  if (!complete) throw new Error('Pagination cap reached; no complete fixture was produced');
  const fixture = { schemaVersion: 1, source: 'stellar-testnet-rpc', capturedAt: new Date().toISOString(), rpc: endpoint, networkPassphrase: network.passphrase, contractId, startLedger, endLedger, complete: true, events: [...found.values()].sort(compareEventIds) };
  validateFixture(fixture);
  return fixture;
}
