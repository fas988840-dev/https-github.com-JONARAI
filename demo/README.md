# JONARAI MVP Demo

An Arabic RTL, read-only educational MVP interface.

## Run
Open `index.html` in a modern browser. No build step is required.

## Robot button
The AI monitor toggle starts/stops a local UI demonstration only. It does not connect to IBKR, fetch market data, generate actionable trading signals, or submit/modify/cancel orders. It is not an automated trading switch or a trading bot.

## Data and subscriptions
No paid market-data subscription is activated by this demo. Before any provider integration, the account owner must independently review provider coverage, exchange entitlements, fees, and redistribution terms. Never place credentials or API keys in browser code.

## Integrity
- Market values remain blank until a provider and timestamps are verified.
- Missing or stale data keeps the gate closed and state at `NO TRADE`.
- SPX/SPXW chain, Greeks, IV, OI, and flow must be validated separately.
- This prototype does not connect to a brokerage account and has no order-execution capability.
