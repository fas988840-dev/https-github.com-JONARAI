# JONARAI Synthetic Paper Engine

An isolated, offline QA harness. It processes explicitly tagged synthetic OHLC fixtures only.

## Safety boundary
- No network clients, broker SDKs, IBKR endpoints, credentials, or order-routing functions.
- Any bar without `source: "SYNTHETIC_FIXTURE"` is rejected.
- Output always declares `OFFLINE_PAPER_ONLY`, `brokerConnected: false`, and `executionEnabled: false`.
- This is a software test harness, not a live trading system or performance forecast.

## Rules under test
- Entry: close breaks above previous bar high AND EMA20 > EMA50 AND volume ratio >= 1.2 AND OI delta > 0.
- Exit: stop, target (1.5R default), or time exit after 18 bars (90 minutes for 5-minute fixture bars).
- If stop and target are both touched within one bar, stop is assumed first (conservative OHLC ambiguity policy).
- Fee and slippage assumptions are configurable and included in net return.

## Run
```sh
npm test
npm run demo
```

All values in the demo are invented fixtures. A backtest win rate is descriptive of the fixture only and must not be interpreted as a real-world success probability.
