# JONARAI

This repository is currently a governed project skeleton with an experimental, read-only IBKR bridge on the `codex/read-only-ibkr-bridge` branch.

## Current isolated prototype

The Arabic static interface prototype is in [`demo/`](./demo/). It intentionally displays no market values and has no brokerage execution capability. It is not a production trading application.

## Repository status

- `main`: governance files only; no complete application source at this time.
- `codex/read-only-ibkr-bridge`: preliminary read-only bridge; not proof of a live IBKR session.
- `demo/arabic-dashboard-v0`: isolated Arabic UI prototype branch.

## Important

Never treat placeholder or fixture data as live market data. Do not connect the existing production website to this repository until the actual application source, build settings, and deployment target have been verified.
