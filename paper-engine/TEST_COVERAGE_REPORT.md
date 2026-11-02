# JONARAI Offline Paper Engine — Test Coverage Report

**Scope:** `feature/synthetic-paper-engine` only.  
**Last verified CI revision:** `38c4e0767778946072346cf7347b7bfa43f85ebe`  
**P0 implementation:** present on `feature/synthetic-paper-engine`; post-change CI status is pending verification.  
**CI run:** [41541165446](https://github.com/fas988840-dev/https-github.com-JONARAI/actions/runs/41541165446)  
**Safety boundary:** synthetic fixtures only; no live data, broker connection, order routing, deployment, or changes to `main`.

## Executive summary

The last verified GitHub Actions run completed with **SUCCESS**: **19/19 tests passed**, and the deterministic fixture demo completed successfully. Four additional P0 tests and corresponding validation changes are now present on this branch; their post-change CI result has not yet been confirmed, so 19/19 must not be treated as the current test count.

## Latest CI verification

- Branch: `feature/synthetic-paper-engine`
- Commit: `38c4e0767778946072346cf7347b7bfa43f85ebe`
- Runner: Ubuntu 24.04
- Node.js: 24.22.1
- Test command: `npm test`
- Result at that revision: **19 tests, 19 passed, 0 failed**  
- Post-P0 test inventory: **23 test cases** in `engine.test.mjs`; CI verification for these additions is pending.
- The previously failing test, `supports multiple sequential simulated exit types and reconciles counts`, now passes.
- Demo command: `npm run demo`
- Demo result: **success**; output identifies `mode: OFFLINE_PAPER_ONLY` and `source: SYNTHETIC_FIXTURE`.
- All workflow steps completed successfully.

### Fix applied

The sequential-exit test was redesigned to assert two actual sequential simulated trades with different exit reasons:

1. First trade exits with `TARGET`.
2. A new breakout opens a second trade, which exits with `STOP`.

The test asserts the ordered reasons, exactly two trades, and reconciliation between trade outcomes and summary win/loss counts.

The first attempt at this fixture failed validation because its second entry bar had inconsistent OHLC values. The fixture was corrected by setting its open to `102.2`, consistent with its high, low, and close. The engine implementation was not changed to work around the fixture error.

### Non-blocking warning

The logs include Node.js deprecation warning `[DEP0040]` for the `punycode` module. It did not fail the test command or demo, and the workflow concluded successfully. It is a dependency/runtime warning, not a test failure.

## Current coverage inventory

| Area | Existing coverage | Assessment |
|---|---|---|
| Synthetic-only source | Rejects non-synthetic source; asserts offline safety flags | Basic coverage |
| Minimum input length | Rejects fewer than 3 bars | Covered |
| Numeric input validation | Existing close checks plus malformed object/array/boxed-number check for volume | Improved; malformed-type coverage remains representative rather than exhaustive across all numeric fields |
| OHLC integrity | Non-positive prices, inconsistent ranges, malformed bar element rejection | Covered for malformed bar element shapes; additional malformed-property matrix remains useful |
| Volume fields | Negative volume and volume ratio rejected | Partial: boundary/extreme values not tested |
| Duplicate times/order | Exact duplicate and strictly increasing timestamp strings | Covered for duplicates and ordering; timestamp format is still not parsed/standardized |
| Time gaps | Allows a gap without fabricating bars | Partial: chronological ordering/format policy not enforced |
| Entry gates | Breakout, EMA trend, volume ratio and OI failures | Basic coverage |
| Stop/target ambiguity | Stop wins when both touched | Covered |
| Target exit | Target-only touch | Covered |
| Stop exit | Stop-only case is now exercised in sequential test | Covered |
| Time exit | Maximum holding bars | Covered at a small configured limit |
| End-of-data exit | Open position closed at final bar | Covered |
| Fees/slippage | Costs reduce net result | Partial: no full exact-arithmetic/config matrix |
| Summary metrics | Counts, win rate, net return, average, empty summary, explicit flat count | Flat classification/count covered by new test; CI pending |
| Multiple trades | Two sequential trades with TARGET then STOP; count reconciliation | Covered |
| Demo | Workflow executes deterministic demo successfully | Execution covered; scenario assertions could be stronger |

## Remaining gaps and recommended tests

### P0 — correctness and input safety

1. **Malformed bar structure:** null, undefined, array, primitive bar elements are rejected with controlled errors; missing time/source and malformed numeric volume types are tested. Broader malformed-field coverage remains useful. **Implementation and tests added; CI pending.**
2. **Timestamp semantics:** blank and non-increasing timestamp strings are rejected. The engine currently enforces lexical ordering, not full timestamp parsing; a consistent format policy remains to be documented. **Implementation and tests added; CI pending.**
3. **Configuration validation:** all six numeric settings are required to be finite; volumeRatioMin must be non-negative; stopPct/rewardRisk positive; maxHoldBars a positive integer; fees/slippage in [0, 1). **Implementation and table-driven tests added; CI pending.**
4. **Flat result accounting:** zero-net trade is classified FLAT and summary exposes `flats`; reconciliation test added. **Implementation and test added; CI pending.**

### P1 — accounting and boundary behavior

5. Assert exact gross/net calculations for fees and slippage, including entry/exit fills and rounding.
6. Test threshold boundaries: close equal to previous high; EMA20 equal to EMA50; volume ratio exactly at minimum; OI delta exactly zero.
7. Test max-hold boundary at one bar and exact configured count; verify stop/target priority on the time-exit bar.
8. Test end-of-data immediately after entry and verify held bars and final-bar accounting.
9. Test very large finite numbers and tiny positive prices for overflow/precision issues.
10. Test skipped-bar accounting and document whether entry bars and bars while a position is open are excluded.

### P2 — maintainability and reproducibility

11. Add a coverage-oriented test command using Node's built-in test coverage support; set a threshold only after measuring a baseline.
12. Add explicit assertions to the demo scenario so success also verifies a non-empty expected trade path, if that is the intended demo contract.
13. Add table-driven malformed-value tests for every numeric input field, not only close.

## Important implementation observations

- `validateBars` accesses bar properties before confirming each bar is a non-null object; malformed elements may throw an incidental TypeError.
- Timestamps are arbitrary non-empty strings. Chronological ordering and parseability are not enforced.
- Configuration validation checks `stopPct > 0`, `rewardRisk > 0`, and `maxHoldBars >= 1`, but does not explicitly require finite values or integer holding bars; fee/slippage and volume threshold are not fully validated.
- Summary `netReturnPct` is the sum of per-trade net percentages, not compounded portfolio return. Keep this explicit in documentation.
- Summary has wins and losses but no flat count, although individual trades can be classified `FLAT`.

## Suggested acceptance criteria

- All P0 cases have deterministic tests. **Implementation added for the four listed P0 gaps; post-change CI is still pending.**
- At least two sequential trades with different exit reasons reconcile correctly. **Met by the latest passing test.**
- Invalid configuration is rejected with clear errors. **Implemented; CI pending.**
- Timestamp ordering is enforced and tested lexically; full format parsing remains open.
- Demo asserts an expected trade in a dedicated fixture scenario, if required by the demo contract.
- CI passes on Node.js 24 / Ubuntu 24.04. **Met by run 41541165446.**
- No live data, broker integration, order routing, deployment, or edits to `main`.

## Historical CI note

The earlier run `41540966258` failed because the sequential-exit test fixture contained inconsistent OHLC values. The fixture was corrected in the verified revision above. The earlier 18/19 result is retained here as debugging history only; it is **not** the current CI status.

**Current conclusion:** the last confirmed CI baseline is 19/19 plus a successful demo. The branch now contains 23 test cases and P0 validation changes, but their CI run and logs have not yet been verified. Do not treat the new P0 work as CI-passing until a fresh successful Actions run is inspected.
