# CLAUDE.md

## Project

JONARAI is an SPX/SPXW intraday 0DTE market-intelligence and decision-support platform.

## Source of Truth

Before implementation, read:

1. `docs/JONARAI_MASTER_SPEC.md`
2. The approved phase-specific specification.
3. Any open issue or pull-request acceptance criteria.

If a required document is missing, report the blocker and stop. Do not invent trading rules.

## Non-Negotiable Rules

- Work only on the explicitly assigned phase.
- Keep the deterministic trading core separate from API, persistence, UI, and LLM commentary.
- The default execution mode is `ANALYSIS_ONLY`.
- Never present JONARAI Score as probability of profit.
- Never guarantee profit or a 93–100% win rate.
- Prefer `NO_TRADE` when critical data or risk validation is uncertain.
- Never fabricate prices, Greeks, flow, gamma, fills, test results, or provider responses.
- Never silently fall back to mock data outside tests.
- Keep mock, replay, paper, and live environments explicit and isolated.
- Preserve UTC timestamps, provider timestamps, received timestamps, processed timestamps, data provenance, and configuration versions.
- Use exact monetary/strike/expiration representations where precision matters.
- Do not commit credentials, tokens, private keys, or production datasets.
- Do not enable broker execution without explicit owner approval.
- Do not change approved trading logic silently.
- Add deterministic tests for every core state transition and hard veto.
- Update documentation whenever implementation behavior changes.

## Pull Request Rules

- One approved phase per pull request.
- Keep the PR narrowly scoped.
- Include tests with core code.
- Run formatting, linting, type checking, unit tests, integration tests, and build steps applicable to the phase.
- Report commands and actual results; do not claim checks that did not run.
- Do not self-merge.
- Stop after the requested phase and wait for independent review.

## Required Completion Report

1. Summary
2. Files Created
3. Files Modified
4. Architecture Decisions
5. Assumptions
6. Tests Added
7. Test Results
8. Known Limitations
9. Risks / Issues
10. Recommended Next Step

For substantial changes, also include:

- DATA FLOW
- DEPENDENCIES
- FAILURE MODES
