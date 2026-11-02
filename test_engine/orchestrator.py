"""Offline synthetic-only orchestrator; adapters are QA contract stubs."""
from __future__ import annotations
import asyncio, json
from pathlib import Path

ROOT = Path(__file__).parent
CATALOG = json.loads((ROOT / "agents.json").read_text(encoding="utf-8"))

class SafetyError(ValueError): pass

def validate_mode(payload):
    if payload.get("data_mode") != "synthetic":
        raise SafetyError("Only synthetic fixtures are accepted")
    forbidden = ("broker_connected", "live_data", "orders_enabled", "execution_enabled")
    if any(payload.get(k) is True for k in forbidden):
        raise SafetyError("Live, broker, and execution flags are prohibited")

def validate_catalog(catalog=CATALOG):
    agents = catalog.get("agents", [])
    ids = [a.get("agent_id") for a in agents]
    if catalog.get("group_count") != 1 or len(agents) != 80 or len(set(ids)) != 80 or any(not x for x in ids):
        raise ValueError("Catalog must contain exactly 80 unique agents in one group")
    return agents

async def _run_agent(agent, payload, semaphore):
    async with semaphore:
        # Contract-level placeholder: no external calls and no market/trade analysis.
        await asyncio.sleep(0)
        return {"agent_id": agent["agent_id"], "domain": agent["domain"],
                "status": "PASS" if payload.get("company", {}).get("ticker") else "WARN",
                "mode": "synthetic", "implementation": "contract_stub"}

async def run_all(payload, concurrency=8):
    validate_mode(payload)
    agents = validate_catalog()
    if concurrency < 1 or concurrency > 32: raise ValueError("concurrency must be 1..32")
    sem = asyncio.Semaphore(concurrency)
    results = await asyncio.gather(*[_run_agent(a, payload, sem) for a in agents])
    results.sort(key=lambda x: x["agent_id"])
    if len(results) != 80 or len({r["agent_id"] for r in results}) != 80:
        raise RuntimeError("Incomplete or duplicate agent results")
    return {"group_id": CATALOG["group_id"], "data_mode": "synthetic",
            "agent_count": len(results), "passed": sum(r["status"] == "PASS" for r in results),
            "results": results}

def load_fixture():
    return json.loads((ROOT / "fixtures/testco.json").read_text(encoding="utf-8"))
