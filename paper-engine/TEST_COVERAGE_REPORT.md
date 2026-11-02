# JONARAI Offline Paper Engine — Test Coverage Report

**Scope:** feature/synthetic-paper-engine only.
**Review basis:** current engine.mjs, engine.test.mjs, package scripts, and the latest verified CI run before this report.
**Safety boundary:** synthetic fixtures only; no live data, broker connection, order routing, deployment, or changes to main.

## Executive summary

The suite currently contains **19 named Node.js tests**. The latest verified workflow run for the prior code revision completed successfully with 14 tests; subsequent test additions in the branch cover timestamp gaps/duplicates and summary reconciliation. This report documents source-level coverage and gaps; it does **not** claim the new 19-test suite has already passed CI. Adding this report will trigger the branch workflow, whose result must be checked separately.

Coverage is useful for the basic happy path and several guardrails, but it is not yet comprehensive. Configuration validation, time ordering/format, malformed bar objects, all exit paths in a true multi-trade sequence, and edge-case accounting need additional tests.

## Current coverage inventory

| Area | Existing coverage | Assessment |
|---|---|---|
| Synthetic-only source | Rejects non-synthetic source; asserts output flags | Basic coverage |
| Minimum input length | Rejects fewer than 3 bars | Covered |
| Numeric input validation | Missing/null/string/NaN/infinite cases | Partial: tests one numeric field (close) |
| OHLC integrity | Non-positive prices and inconsistent range | Partial: malformed bar objects not covered |
| Volume fields | Negative volume and volume ratio rejected | Partial: zero/extreme values not tested |
| Duplicate times | Exact duplicate timestamp rejected | Covered for exact duplicates |
| Time gaps | Allows a gap without synthesizing bars | Partial: chronology/format not validated |
| Entry gates | Breakout, EMA trend, volume ratio and OI gate failures | Basic coverage |
| Stop/target ambiguity | Stop wins when both touched | Covered |
| Target exit | Target-only touch | Covered |
| Stop exit | Stop-only case not separately asserted | Gap |
| Time exit | Max holding bars | Covered at a small configured limit |
| End-of-data exit | Open position closed at final bar | Covered |
| Fees/slippage | Costs reduce net result | Partial: no exact arithmetic/config validation |
| Summary metrics | Counts, win rate, net return, average; empty summary | Partial: flat trades/rounding not tested |
| Multiple trades | Test named sequential exits | Incomplete: expects only one END_OF_DATA trade |
| Demo | Workflow runs deterministic demo | Weak: currently outputs zero trades |

## Gaps and recommended additional tests

### P0 — correctness and input safety

1. **Malformed bar structure:** null bar, non-object bar, missing time/source, arrays or objects in numeric fields. Require controlled validation errors rather than incidental TypeErrors.
2. **Timestamp semantics:** reject invalid/blank timestamps, out-of-order timestamps, and duplicate timestamps; define accepted format (ISO-8601 or documented fixture format). Current code checks only non-empty strings and exact duplicates.
3. **Configuration validation:** reject NaN/Infinity, zero or negative stopPct, invalid rewardRisk, fractional/zero/negative maxHoldBars, negative fees/slippage, and invalid volumeRatioMin. Current checks are partial and do not validate all numeric settings.
4. **Stop-only exit:** construct a bar touching stop but not target; assert STOP, exit price, held bars and classification.
5. **True multiple-trade reconciliation:** create at least two sequential trades with different reasons (e.g. TARGET then STOP), then verify order, counts and summary. Current test with this name only expects one END_OF_DATA trade.
6. **Flat result accounting:** construct a zero-net trade and verify FLAT classification and whether summary should expose a flat count.

### P1 — accounting and boundary behavior

7. Assert exact gross/net calculations for fees and slippage, including entry/exit fills and rounding.
8. Test threshold boundaries: close equal to previous high; EMA20 equal to EMA50; volume ratio exactly at minimum; OI delta exactly zero.
9. Test max-hold boundary at one bar and exact configured count; verify stop/target priority on the time-exit bar.
10. Test end-of-data immediately after entry and verify held bars and final-bar accounting.
11. Test very large finite numbers and tiny positive prices for overflow/precision issues.
12. Test skipped-bar accounting and document whether entry bars and bars while a position is open are excluded.

### P2 — maintainability and reproducibility

13. Add a coverage-oriented test command using Node's built-in test coverage support; set a threshold only after measuring a baseline.
14. Add deterministic assertions to the demo so success also proves the expected scenario; current demo can succeed with zero trades.
15. Add table-driven malformed-value tests for every numeric input field, not only close.

## Important implementation observations

- validateBars accesses b.time before confirming b is a non-null object; malformed elements can throw TypeError.
- Timestamps are arbitrary non-empty strings. Chronological ordering and parseability are not enforced.
- Configuration validation checks stopPct > 0, rewardRisk > 0, and maxHoldBars >= 1, but does not explicitly require finite values or integer holding bars; fee/slippage and volume threshold are not validated.
- Summary netReturnPct is the sum of per-trade net percentages, not compounded portfolio return. Keep this explicit in documentation.
- Summary has wins and losses but no flat count, although individual trades can be classified FLAT.
- The demo's previously verified output showed zero trades. This is not a CI failure, but it is weak evidence for the trade/exit reporting path.

## Suggested next acceptance criteria

- All P0 cases have deterministic tests.
- At least two sequential trades with different exit reasons reconcile correctly.
- Invalid configuration is rejected with clear errors.
- Timestamp ordering/format policy is explicit and tested.
- Demo asserts at least one expected trade in a dedicated fixture scenario.
- CI passes on Node.js 24 / Ubuntu 24.04.
- No live data, broker integration, order routing, deployment, or edits to main.

**Conclusion:** the current 19-test suite is an initial regression layer, not complete validation of the simulation engine. Prioritize P0 gaps before broader scenario testing.