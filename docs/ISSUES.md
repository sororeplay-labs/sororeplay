# Proposed contributor issues

These are drafts, not published GitHub issues.

1. **Worker isolation for adapters.** Execute each profile in a worker process, enforce hard wall-clock limits, and terminate synchronous infinite loops. Acceptance: a blocking adapter fails predictably without hanging the CLI; no claim of a security sandbox.
2. **Persisted idempotency adapter.** Add a SQLite-backed consumer example and replay across process restarts. Acceptance: duplicated delivery after restart does not change projected balances.
3. **Event schema migration fixtures.** Exercise a real contract-version change against old/new consumers. Acceptance: document exactly which event changes are compatible and which produce a useful regression report.
4. **Checkpoint export and resume.** Record capture provenance and ensure resumed runs keep the same ledger boundary. Acceptance: overlap is deduplicated, conflicts fail, incomplete capture cannot be replayed as complete.
5. **Real application integration.** Add an adapter for an independently maintained Stellar application with permission and sanitized public events. Acceptance: catches a documented regression or verifies a reviewed fix.
6. **JUnit output and TypeScript declarations.** Preserve state-difference paths and profile failure details. Acceptance: example CI consumes the report and type-checks a small adapter.
