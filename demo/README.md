# JONARAI Arabic Demo

This directory is an isolated, static UI prototype. It is not the production website and does not connect to IBKR, a market-data vendor, a broker account, or an order-routing service.

## Run locally

Open `index.html` in a modern browser. No build step or package installation is required.

## Safety and data-integrity contract

- All market metrics are intentionally blank.
- No synthetic price, options chain, Greeks, gamma exposure, volume, or trade signal is presented as live data.
- The data-integrity gate remains closed until a real provider is configured and its symbol, timestamp, entitlement, delay, and coverage are validated.
- No order-entry, account, payment, or brokerage execution controls are included.
- This prototype is for interface review only.

## Before any real-data integration

1. Select a licensed options-data provider and confirm SPX/SPXW coverage, Greeks, historical data, rate limits, redistribution rights, and total cost.
2. Define a server-side adapter and typed normalized schema; keep credentials server-side.
3. Validate timestamps, exchange calendar, stale-data thresholds, missing strikes, crossed markets, and provider outages.
4. Add automated contract tests with recorded fixtures clearly marked as fixtures.
5. Keep broker connectivity read-only in the demo environment.
6. Run a full data-quality and operational test suite before enabling any live-data display.

## Deployment

Do not point the existing Netlify production site at this directory. Deploy only to a separate staging site after its owner confirms the site and build settings.