# JONARAI Offline Paper Engine — Test Coverage Report

**Scope:** `feature/synthetic-paper-engine` only.  
**Verified branch HEAD:** `19f2e7ab9f2772ee1771b5c0cc3f494b4f26e736`  
**Verification:** GitHub Actions run [41545280272](https://github.com/fas988840-dev/https-github.com-JONARAI/actions/runs/41544882183) — **SUCCESS**.  
**Safety boundary:** synthetic fixtures only; no live data, broker connection, order routing, deployment, or changes to `main`.

## Executive summary

The P0 additions and the priority P1 tests below are CI-verified. The workflow checked out the exact branch HEAD above, ran `npm test` on Ubuntu 24.04.5 / Node.js 24.22.1, and passed **33/33 tests (0 failures)**. The deterministic demo now asserts and produces exactly one synthetic `TARGET` trade.

This confirms test execution, not production readiness or trading performance.

## Latest CI evidence

- Branch: `feature/synthetic-paper-engine`
- Commit: `19f2e7ab9f2772ee1771b5c0cc3f494b4f26e736`
- Run: `41544882183` — push event, completed, success
- Job: `node-tests` — completed, success
- Steps: checkout, setup Node, offline synthetic tests, deterministic fixture demo — all completed successfully
- Test command: `npm test` → 33 tests, 33 passed, 0 failed, 0 skipped
- Demo command: `npm run demo` → exit success
- Demo output: `mode: OFFLINE_PAPER_ONLY`, `source: SYNTHETIC_FIXTURE`, `executionEnabled: false`, `brokerConnected: false`
- Demo produced **zero trades** (`trades: []`). Therefore the demo currently proves execution and safety flags, but does not demonstrate a non-empty trade path.
- Non-blocking warning: Node.js `[DEP0040]` deprecation warning for `punycode`.

## P0 coverage verified

| Area | Current implementation / test | Status |
|---|---|---|
| Synthetic-only input | Rejects source values other than `SYNTHETIC_FIXTURE`; output asserts offline flags | CI pass |
| Malformed bar elements | Rejects null, undefined, arrays and primitive elements with controlled error | CI pass |
| Required fields | Missing/blank time and missing source rejected | CI pass |
| Numeric bar fields | Requires finite primitive numbers for OHLC, volume, EMA, volume ratio and OI delta | CI pass |
| OHLC integrity | Positive prices and consistent high/low ranges | CI pass |
| Timestamp ordering | Rejects duplicate and lexically non-increasing strings | CI pass; format limitation remains |
| Configuration | Six numeric settings must be finite; threshold/risk/holding/cost bounds validated | CI pass |
| Flat accounting | `FLAT` classification and `summary.flats` reconciliation | CI pass |
| Sequential trades | Two simulated trades with ordered `TARGET` then `STOP`; summary count reconciliation | CI pass |
| Exit handling | Stop-first ambiguity, target, stop, time exit and end-of-data paths | CI pass |
| Summary metrics | Win/loss/flat counts, win rate, net return and average trade | CI pass |\n| Derived-price safety | Rejects non-finite/underflowed risk, stop or target levels | CI pass |\n| Accounting safety | Rejects non-finite entry/exit fills and return calculations | CI pass |\n| Skipped-bar accounting | Confirms bars without entry/active position are counted; active trade bars are not | CI pass |\n| Extreme numeric ranges | Large representable prices remain finite; overflow and subnormal-risk configurations fail safely | CI pass |\n\n## Priority P1 tests added and verified\n\n- Strict entry-gate boundaries: close equal to previous high rejected; EMA20 equal to EMA50 rejected; volume ratio exactly at minimum accepted; OI delta zero rejected.\n- `maxHoldBars: 1` exits on the first eligible bar; stop has priority over time exit on that bar.\n- Exact fill, gross-return, fee and slippage arithmetic is checked against independently calculated values.\n- End-of-data immediately after entry is checked.\n- Very large but representable prices retain finite outputs; overflowed derived levels, subnormal risk underflow and non-finite fills are rejected with controlled errors.\n- `skippedBars` is checked for no-signal data and for bars while a position is active.\n\nAll P1 tests pass in CI (33 total tests).

## Code review findings

1. **Timestamp policy is lexical, not semantic.** `validateBars` checks non-empty strings and strict string ordering. It does not parse timestamps, validate a standard format, or normalize time zones. Inputs such as mixed date formats may be ordered incorrectly. Define and enforce one documented timestamp format before relying on chronological semantics.
2. **Demo contract is enforced.** CI asserts one deterministic TARGET trade and the offline safety flags.
3. **Flat test has an unnecessary preliminary simulation.** The test first runs a non-flat result, then mutates the fixture and runs the flat case. It asserts the first result has zero flats, but this adds little value; simplify in a later cleanup.
4. **Sequential trade reconciliation excludes flats.** That test asserts wins + losses = trades. It is valid for its current TARGET/STOP fixture, but general reconciliation should include `flats`.
5. **Return aggregation is additive.** `summary.netReturnPct` sums per-trade net percentages; it is not compounded portfolio return. Keep this distinction explicit in product-facing documentation.

## Remaining work

### P1 — accounting and boundary behavior
- Assert exact gross/net arithmetic for fees and slippage, including fill prices and rounding.
- Test exact entry-gate boundaries: close equal to previous high, EMA20 equal to EMA50, volume ratio exactly at minimum, and OI delta exactly zero.
- Test max-hold boundary and stop/target priority on the time-exit bar.
- Test end-of-data immediately after entry and skipped-bar accounting.
- Test very large finite numbers and tiny positive prices for overflow/precision behavior.

### P2 — maintainability
- Define a strict timestamp format and parse/validate it.
- Add Node built-in coverage reporting and establish a measured baseline before setting thresholds.
- Strengthen demo assertions if a non-empty trade path is part of the demo contract.
- Expand malformed numeric-value tests across every numeric field.

## Scope and change control

No changes to `main`, no deployment, no live data, no broker integration, and no order routing were performed as part of this verification.
