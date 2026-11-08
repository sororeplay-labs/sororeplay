import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capture, rpcCall, TESTNET, TESTNET_RPC } from '../src/capture.js';
import { replay } from '../src/index.js';
import good from '../examples/credit-handler.js';
import broken from '../examples/broken-handler.js';
import { resilientFetch } from '../src/transport.js';

const root = fileURLToPath(new URL('../', import.meta.url));
function command(binary, args, cwd = root) {
  return new Promise((resolve, reject) => execFile(binary, args, { cwd, timeout: 600000, maxBuffer: 8388608 }, (error, stdout, stderr) => {
    if (error) reject(new Error(binary + ' failed: ' + stderr.slice(-2500)));
    else resolve(stdout.trim());
  }));
}

async function main() {
  const call = (method, params) => rpcCall(TESTNET_RPC, method, params, { fetcher: resilientFetch });
  const network = await call('getNetwork');
  assert.equal(network.passphrase, TESTNET);
  const manifest = join(root, 'contracts/event-fixture/Cargo.toml');
  console.log('Building demonstration contract (no token transfers).');
  await command('cargo', ['build', '--manifest-path', manifest, '--target', 'wasm32v1-none', '--release', '--locked']);
  const wasm = join(dirname(manifest), 'target/wasm32v1-none/release/sororeplay_event_fixture.wasm');
  const wasmSha256 = createHash('sha256').update(await readFile(wasm)).digest('hex');
  const temp = await mkdtemp(join(tmpdir(), 'sororeplay-testnet-'));
  const config = join(temp, 'config');
  await mkdir(config, { mode: 0o700 });
  const cli = args => command('stellar', [...args, '--config-dir', config, '--no-cache'], temp);
  const flags = ['--rpc-url', TESTNET_RPC, '--network-passphrase', TESTNET];
  try {
    await cli(['keys', 'generate', 'demo']);
    const account = (await cli(['keys', 'address', 'demo'])).trim();
    if (!/^G[A-Z2-7]{55}$/.test(account)) throw new Error('Invalid public test account');
    console.log('Funding a fresh account using free Testnet Friendbot XLM.');
    const funded = await resilientFetch('https://friendbot.stellar.org/?addr=' + account, { signal: AbortSignal.timeout(20000) });
    if (!funded.ok) throw new Error('Friendbot HTTP ' + funded.status);
    await funded.arrayBuffer();
    await delay(5000);
    console.log('Deploying event-fixture contract.');
    const deployed = await cli(['contract', 'deploy', '--wasm', wasm, '--source', 'demo', ...flags]);
    const contractId = deployed.split(/\s+/).find(value => /^C[A-Z2-7]{55}$/.test(value));
    if (!contractId) throw new Error('No contract ID in deployment output');
    const before = await call('getLatestLedger');
    for (const [name, amount] of [['alice', '4'], ['bob', '7'], ['alice', '6']]) {
      console.log('Emitting test event: ' + name + ' ' + amount);
      await command('stellar', ['contract', 'invoke', '--id', contractId, '--source', 'demo', ...flags, '--config-dir', config, '--no-cache', '--', 'credit', '--actor', account, '--account', name, '--amount', amount], temp);
    }
    const expected = { schemaVersion: 1, orderIndependent: true, state: { balances: { alice: '10', bob: '7' } } };
    let fixture;
    for (let attempt = 0; attempt < 12; attempt++) {
      const latest = await call('getLatestLedger');
      fixture = await capture({ contractId, startLedger: before.sequence, endLedger: latest.sequence + 1, fetcher: resilientFetch });
      if (fixture.events.length >= 3) break;
      await delay(3000);
    }
    assert.equal(fixture.events.length, 3, 'Expected exactly three committed demo events');
    const report = await replay(fixture, good, expected, { profiles: ['canonical', 'duplicate', 'reverse'] });
    assert.equal(report.failed, 0);
    const defect = await replay(fixture, broken, expected);
    assert.equal(defect.results.find(r => r.profile === 'duplicate').passed, false);
    const hashes = [...new Set(fixture.events.map(e => e.txHash))];
    const confirmations = [];
    for (const hash of hashes) {
      const tx = await call('getTransaction', { hash });
      assert.equal(tx.status, 'SUCCESS');
      confirmations.push({ hash, ledger: tx.ledger, explorer: 'https://stellar.expert/explorer/testnet/tx/' + hash });
    }
    const evidence = { verifiedAt: new Date().toISOString(), network: 'testnet', networkPassphrase: TESTNET, rpc: TESTNET_RPC, contractId, wasmSha256, account, fixtureFile: 'fixture.json', report, brokenAdapterDuplicateDetected: true, confirmations, note: 'Credit events are demonstration records, not real token transfers. Duplicate/reverse delivery profiles are offline replays of captured Testnet events.' };
    const docs = join(root, 'docs/testnet');
    await mkdir(docs, { recursive: true });
    for (const [name, data] of [['fixture.json', fixture], ['expected.json', expected], ['latest.json', evidence]]) await writeFile(join(docs, name), JSON.stringify(data, null, 2) + '\n');
    const block = ['<!-- TESTNET:START -->', '## Verified Testnet demonstration', '', 'Verified: ' + evidence.verifiedAt, '', '- Contract: [' + contractId + '](https://stellar.expert/explorer/testnet/contract/' + contractId + ')', '- Network: Stellar Testnet', '- Captured events: 3', '- Good handler: canonical, duplicate, and reverse profiles passed.', '- Deliberately broken handler: duplicate-delivery defect detected.', '', 'Evidence: [latest.json](docs/testnet/latest.json), [raw fixture](docs/testnet/fixture.json), and [independent expected state](docs/testnet/expected.json).', '', ...confirmations.map(t => '- [' + t.hash + '](' + t.explorer + ')'), '', 'This contract emits demonstration events only; it moves no tokens. Testnet resets can remove the contract and history.', '<!-- TESTNET:END -->'].join('\n');
    const readmePath = join(root, 'README.md');
    const previous = await readFile(readmePath, 'utf8');
    const pattern = /<!-- TESTNET:START -->[\s\S]*?<!-- TESTNET:END -->/;
    await writeFile(readmePath, pattern.test(previous) ? previous.replace(pattern, () => block) : previous.trimEnd() + '\n\n' + block + '\n');
    console.log('Verified Testnet evidence and README saved.');
  } finally { await rm(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
