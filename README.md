# SoroReplay

Capture committed Soroban contract events and regression-test the application handlers that consume them.

Version 0.1.0. A CLI and adapter library with a reproducible fixture contract. It tests downstream behavior; it is not a general indexer or a contract security scanner.

## Quick start

Node.js 22 or later:

```sh
npm ci
npm test
npm run demo
node src/cli.js replay --fixture examples/fixture.json --adapter ./examples/credit-handler.js --expect examples/expected.json
```

The shipped fixture is synthetic offline data. The demo proves that a correct handler passes canonical, duplicate and reverse replay; an intentionally broken handler passes canonical replay but fails duplicate delivery.

## Capture a fixed Testnet window

```sh
node src/cli.js capture --contract C_ADDRESS --start 100 --end 110 --output fixture.json
```

Replace the contract and ledgers. Start is inclusive, end is exclusive. The RPC must identify itself as Stellar Testnet. Its retained-history window is checked first. RPC events are contract-filtered and paginated with bounded requests. Transport failures fall back to system curl over IPv4 when available; TLS verification remains enabled. Credential-bearing endpoint URLs and query parameters are rejected so fixtures do not leak API keys. Duplicate IDs are deduplicated; conflicting duplicates, invalid raw XDR, wrong contracts, incomplete captures and stalled cursors are rejected. Cursor pages omit ledger bounds as required by RPC; the original window remains locally enforced.

History expires from RPC and Testnet resets can remove it. Keep fixtures for regression testing rather than relying on permanent remote availability. An empty but complete capture can be legitimate; it is not evidence of a meaningful demo.

## Test your own handler

Export this interface from a trusted local module:

```js
export default {
  initialState: () => ({ total: '0', seen: [] }),
  apply(state, event) {
    // Validate event.decoded, deduplicate IDs, and return next state.
    return state;
  },
  project: state => ({ total: state.total })
};
```

Write an independent expected JSON state, not one generated from the handler being tested:

```json
{"schemaVersion":1,"orderIndependent":false,"state":{"total":"17"}}
```

```sh
node src/cli.js replay --fixture fixture.json --adapter ./handler.js --expect expected.json --output report.json
```

The default profiles are canonical event order and duplicate delivery. Reverse delivery is opt-in with --profiles canonical,duplicate,reverse and requires orderIndependent:true in the oracle. Order-sensitive applications should define their ordering behavior before enabling it.

Adapters receive raw event metadata plus decoded topics/data. XDR is decoded using the Stellar SDK, with big integers converted to decimal strings and byte arrays encoded explicitly. Project JSON-safe state with monetary quantities as strings. Reports identify differing state paths. A local adapter is executable code, not a sandboxed plugin. Async timeout cannot stop a synchronous infinite loop or undo external side effects; worker-process isolation is future work.

Exit codes: 0 = all profiles passed or capture succeeded; 1 = replay mismatch; 2 = usage, transport, malformed fixture or other exception.

## Reproduce the Testnet demonstration

Requires Rust with wasm32v1-none target and Stellar CLI 27+:

```sh
cargo test --manifest-path contracts/event-fixture/Cargo.toml
node scripts/testnet.js
```

The script verifies the network, builds and deploys a small demonstration contract, funds a fresh test-only account with Friendbot, emits three credit events, captures them, checks an independent expected state and confirms transaction status. No tokens are transferred by the contract. Test-only signing keys live in a temporary directory and are deleted after the run.

Evidence and README details are generated only after all assertions pass. Until a generated Verified Testnet demonstration section appears below, no live deployment is claimed.

## Architecture and next work

- src/capture.js: Testnet RPC capture and pagination.
- src/index.js: raw fixture validation, decoding, ordering and replay.
- examples/: independent fixtures, good and deliberately broken adapters.
- contracts/event-fixture/: event-only demonstration contract.
- docs/ISSUES.md: contributor tasks and acceptance criteria.

References: [RPC getEvents](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents), [contract events](https://developers.stellar.org/docs/build/guides/events).

License: MIT. Maintainer attribution: JamesEjembi.

<!-- TESTNET:START -->
## Verified Testnet demonstration

Verified: 2026-11-08T18:29:38.765Z

- Contract: [CANOOIAND2G65MTG6HUEVJCIHFG5AJAZUE7EACYWD2Q7ZC5DRKT7NPLV](https://stellar.expert/explorer/testnet/contract/CANOOIAND2G65MTG6HUEVJCIHFG5AJAZUE7EACYWD2Q7ZC5DRKT7NPLV)
- Network: Stellar Testnet
- Captured events: 3
- Good handler: canonical, duplicate, and reverse profiles passed.
- Deliberately broken handler: duplicate-delivery defect detected.

Evidence: [latest.json](docs/testnet/latest.json), [raw fixture](docs/testnet/fixture.json), and [independent expected state](docs/testnet/expected.json).

- [f55282f36b1b6aad2ce22716a71c41b13c072461c9ecd755a95fc5233ce57019](https://stellar.expert/explorer/testnet/tx/f55282f36b1b6aad2ce22716a71c41b13c072461c9ecd755a95fc5233ce57019)
- [e1ab1b6af0a78dfc80e7d10a88eb708e528c4ef3870c53c826d303af882ef44c](https://stellar.expert/explorer/testnet/tx/e1ab1b6af0a78dfc80e7d10a88eb708e528c4ef3870c53c826d303af882ef44c)
- [14972b65e3b1da86c910316a9fdab94525792239bf96be87b791e90063c03f13](https://stellar.expert/explorer/testnet/tx/14972b65e3b1da86c910316a9fdab94525792239bf96be87b791e90063c03f13)

This contract emits demonstration events only; it moves no tokens. Testnet resets can remove the contract and history.
<!-- TESTNET:END -->
