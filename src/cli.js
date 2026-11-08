import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capture } from './capture.js';
import { replay } from './index.js';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  const allowed = command === 'capture' ? ['rpc', 'contract', 'start', 'end', 'output'] : ['fixture', 'adapter', 'expect', 'output', 'profiles'];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2);
    if (!args[i].startsWith('--') || !allowed.includes(key) || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Unknown, duplicate, or incomplete option: ' + args[i]);
    options[key] = args[i + 1];
  }
  let result;
  if (command === 'capture') {
    if (!options.contract || !options.start || !options.end || !options.output) throw new Error('capture requires --contract --start --end --output; --end is exclusive');
    result = await capture({ endpoint: options.rpc, contractId: options.contract, startLedger: Number(options.start), endLedger: Number(options.end) });
  } else if (command === 'replay') {
    if (!options.fixture || !options.adapter || !options.expect) throw new Error('replay requires --fixture --adapter --expect');
    const fixture = JSON.parse(await readFile(options.fixture, 'utf8'));
    const expected = JSON.parse(await readFile(options.expect, 'utf8'));
    const adapter = (await import(pathToFileURL(resolve(options.adapter)).href)).default;
    result = await replay(fixture, adapter, expected, { profiles: options.profiles?.split(',') });
    if (result.failed) process.exitCode = 1;
  } else {
    console.log('Commands:\n  capture --contract C... --start LEDGER --end EXCLUSIVE_LEDGER --output fixture.json\n  replay --fixture fixture.json --adapter ./handler.js --expect expected.json [--profiles canonical,duplicate,reverse] [--output report.json]');
    if (command) process.exitCode = 2;
    return;
  }
  if (options.output) await writeFile(options.output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 2; });
