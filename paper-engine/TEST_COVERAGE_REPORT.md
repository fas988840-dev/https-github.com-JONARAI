# JONARAI Offline Paper Engine — Test Coverage Report

**Scope:** `feature/synthetic-paper-engine` only.  
**Verified revision:** `38c4e0767778946072346cf7347b7bfa43f85ebe`  
**CI run:** [41541165446](https://github.com/fas988840-dev/https-github.com-JONARAI/actions/runs/41541165446)  
**Safety boundary:** synthetic fixtures only; no live data, broker connection, order routing, deployment, or changes to `main`.

## Executive summary

The latest GitHub Actions run completed with **SUCCESS**. All **19/19 tests passed**, and the deterministic fixture demo completed successfully. This supersedes the earlier failed runs documented below.

## Latest CI verification

- Branch: `feature/synthetic-paper-engine`
- Commit: `38c4e0767778946072346cf7347b7bfa43f85ebe`
- Runner: Ubuntu 24.04
- Node.js: 24.22.1
- Test command: `npm test`
- Result: **19 tests, 19 passed, 0 failed**
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
| Numeric input validation | Missing/null/string/NaN/infinite cases for close | Partial: not table-driven across every numeric field |
| OHLC integrity | Non-positive prices and inconsistent ranges | Partial: malformed bar objects not covered |
| Volume fields | Negative volume and volume ratio rejected | Partial: boundary/extreme values not tested |
| Duplicate times | Exact duplicate timestamp rejected | Covered for exact duplicates |
| Time gaps | Allows a gap without fabricating bars | Partial: chronological ordering/format policy not enforced |
| Entry gates | Breakout, EMA trend, volume ratio and OI failures | Basic coverage |
| Stop/target ambiguity | Stop wins when both touched | Covered |
| Target exit | Target-only touch | Covered |
| Stop exit | Stop-only case is now exercised in sequential test | Covered |
| Time exit | Maximum holding bars | Covered at a small configured limit |
| End-of-data exit | Open position closed at final bar | Covered |
| Fees/slippage | Costs reduce net result | Partial: no full exact-arithmetic/config matrix |
| Summary metrics | Counts, win rate, net return, average; empty summary | Partial: flat trades/rounding not tested |
| Multiple trades | Two sequential trades with TARGET then STOP; count reconciliation | Covered |
| Demo | Workflow executes deterministic demo successfully | Execution covered; scenario assertions could be stronger |

## Remaining gaps and recommended tests

### P0 — correctness and input safety

1. **Malformed bar structure:** null bar, non-object bar, missing time/source, arrays or objects in numeric fields. Require controlled validation errors rather than incidental TypeErrors.
2. **Timestamp semantics:** reject invalid/blank timestamps and out-of-order timestamps; define accepted format (ISO-8601 or documented fixture format). Current code checks non-empty strings and exact duplicates but does not enforce chronology.
3. **Configuration validation:** reject NaN/Infinity, zero or negative stopPct, invalid rewardRisk, fractional/zero/negative maxHoldBars, negative fees/slippage, and invalid volumeRatioMin. Current checks are partial.
4. **Flat result accounting:** construct a zero-net trade and verify FLAT classification and whether summary should expose a flat count.

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

- All P0 cases have deterministic tests.
- At least two sequential trades with different exit reasons reconcile correctly. **Met by the latest passing test.**
- Invalid configuration is rejected with clear errors.
- Timestamp ordering/format policy is explicit and tested.
- Demo asserts an expected trade in a dedicated fixture scenario, if required by the demo contract.
- CI passes on Node.js 24 / Ubuntu 24.04. **Met by run 41541165446.**
- No live data, broker integration, order routing, deployment, or edits to `main`.

## Historical CI note

The earlier run `41540966258` failed because the sequential-exit test fixture contained inconsistent OHLC values. The fixture was corrected in the verified revision above. The earlier 18/19 result is retained here as debugging history only; it is **not** the current CI status.

**Current conclusion:** the 19-test regression suite and deterministic demo both pass in the latest verified CI run. This is a useful baseline, not proof of complete engine validation; the remaining gaps above still require dedicated tests.
