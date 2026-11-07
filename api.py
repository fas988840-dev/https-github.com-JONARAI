from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import json, os, random
from datetime import datetime

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

STATE_FILE = "paper_state.json"

def load_state():
    if not os.path.exists(STATE_FILE):
        return {
            "open_position": None,
            "trading_paused": False,
            "last_result": None,
            "closed_trades": [],
            "price_history": []
        }
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def simulate_price(entry):
    change = random.uniform(-0.07, 0.11)
    return round(max(0.1, entry * (1 + change)), 2)

def trailing_stop(entry, current):
    pnl_pct = (current - entry) / entry
    stop = entry * 0.60
    stop_type = "INITIAL"
    if pnl_pct >= 0.30:
        stop = entry
        stop_type = "BREAKEVEN"
    if pnl_pct >= 0.50:
        stop = entry * 1.20
        stop_type = "LOCK_20"
    return {
        "stop": round(stop, 2),
        "type": stop_type,
        "pnl%": round(pnl_pct * 100, 1),
        "hit": current <= stop
    }

@app.get("/")
def root():
    return FileResponse("dashboard.html")

@app.get("/status")
def status():
    return load_state()

@app.post("/run")
def run():
    state = load_state()

    if state.get("trading_paused"):
        return {"ok": False, "message": "التداول موقوف", "state": state}

    if state.get("open_position"):
        pos = state["open_position"]
        new_price = simulate_price(pos.get("current", pos["entry"]))
        pos["current"] = new_price
        trail = trailing_stop(pos["entry"], new_price)
        pos["stop"] = trail["stop"]
        pos["stop_type"] = trail["type"]
        pos["pnl"] = trail["pnl%"]

        state["price_history"].append({"price": new_price, "time": datetime.utcnow().isoformat()})

        if trail["hit"] or random.random() < 0.18:
            result = "WIN" if trail["pnl%"] > 0 else "LOSS"
            state["closed_trades"].append({
                "result": result,
                "pnl%": trail["pnl%"],
                "entry": pos["entry"],
                "exit": new_price,
                "time": datetime.utcnow().isoformat()
            })
            state["open_position"] = None
            state["last_result"] = result
            if result == "LOSS":
                state["trading_paused"] = True
        else:
            state["open_position"] = pos
    else:
        entry = round(random.uniform(2.0, 4.2), 2)
        state["open_position"] = {
            "entry": entry,
            "current": entry,
            "direction": "CALL",
            "stop": round(entry * 0.60, 2),
            "stop_type": "INITIAL",
            "pnl": 0,
            "time": datetime.utcnow().isoformat()
        }
        state["price_history"] = [{"price": entry, "time": datetime.utcnow().isoformat()}]

    save_state(state)
    return {"ok": True, "state": state}

@app.post("/resume")
def resume():
    state = load_state()
    state["trading_paused"] = False
    save_state(state)
    return {"ok": True, "message": "تم إعادة التفعيل"}
