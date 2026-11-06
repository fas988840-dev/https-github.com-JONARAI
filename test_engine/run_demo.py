import asyncio, json
from orchestrator import load_fixture, run_all
if __name__ == "__main__":
    print(json.dumps(asyncio.run(run_all(load_fixture())), ensure_ascii=False, indent=2))
