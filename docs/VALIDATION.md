# Validation — November 8, 2026

- Node.js 24.15.0: 21 JavaScript tests passed, including pagination bounds, malformed fixtures, exact ID ordering, duplicate-delivery defects, handler timeouts and transport fallback.
- Synthetic offline demo: correct handler passes canonical, duplicate and reverse profiles. Deliberately broken handler fails duplicate replay with expected balance diffs.
- CLI replay: correct adapter exits 0; deliberately broken adapter exits 1.
- Rust 1.96.1 / soroban-sdk 27.0.6: 3 contract tests passed (event topics and payload, zero amount rejection, unauthorized actor rejection).
- Release Wasm build succeeded for wasm32v1-none.
- Live Stellar Testnet verification succeeded on November 8, 2026: contract CANOOIAND2G65MTG6HUEVJCIHFG5AJAZUE7EACYWD2Q7ZC5DRKT7NPLV emitted three events, each from a transaction confirmed SUCCESS by RPC. Raw events, expected state, transaction hashes and the replay report are saved in docs/testnet/.
- The captured Testnet fixture passed canonical, duplicate and reverse replay; the deliberately broken handler failed duplicate replay. A separate CLI replay of the saved live fixture also passed all three profiles.
- npm dependency audit at installation reported zero known vulnerabilities; this is not a security audit.
- Remote CI and repository publication have not occurred.

No production readiness, external application adoption, or independent security audit is claimed. Duplicate and reverse delivery are offline perturbations, including when the source fixture comes from Testnet.
