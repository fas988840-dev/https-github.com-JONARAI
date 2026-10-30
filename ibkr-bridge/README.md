# JONARAI IBKR Bridge

Read-only HTTPS adapter between JONARAI and an authenticated IBKR Web API / Client Portal Gateway session.

## Safety contract

- Paper/data mode only.
- No order, modify, cancel, or account endpoints are exposed.
- Every request requires `Authorization: Bearer <BRIDGE_API_TOKEN>`.
- Missing, stale, or incomplete critical data always returns `NO_TRADE`.

## Runtime

Set `IBKR_GATEWAY_URL` to the locally reachable authenticated Gateway API URL and set a long random `BRIDGE_API_TOKEN`. Terminate public TLS in a reverse proxy and expose only this bridge, never the Gateway itself.

The repository includes a root `render.yaml` for deploying the bridge. Render still needs a network-reachable authenticated IBKR Gateway URL; the ChatGPT IBKR connector session cannot be reused by this service. Keep `IBKR_GATEWAY_URL` private and never expose the Gateway directly to the public internet.

The individual-account brokerage session still requires IBKR authentication and may require reauthentication/2FA. A single username cannot maintain competing brokerage sessions.

## Endpoints

- `GET /health`
- `GET /api/search?query=SPX`
- `GET /api/analyze?query=SPX`

The current first slice validates session state, symbol discovery, top-of-book snapshots, freshness, and fail-closed behavior. Options contract discovery and Greeks remain intentionally blocked until tested against the deployed authenticated Gateway.
