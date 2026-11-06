# JONARAI 80-Agent Test Engine (isolated)

This branch adds an offline synthetic-data QA harness. It does not modify `main`, deploy a site, connect a broker, fetch market data, or execute orders.

## Run

```bash
python -m unittest discover -s test_engine/tests -t . -v
python test_engine/run_demo.py
python test_engine/web_server.py
```

Open http://127.0.0.1:8000. The UI reads only the bundled synthetic TESTCO fixture. All 80 agents are contract-level validators/stubs; they are not production analytical models.

## Safety boundary

Only `data_mode=synthetic` is accepted. Any other mode raises an error. Broker, order, and live-data flags are rejected. No network client exists in the engine. The local web server binds to loopback only.
