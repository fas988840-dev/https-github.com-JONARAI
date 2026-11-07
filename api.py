"""
JONARAI API - Final
- Serves Arabic dashboard
- Paper loop control
- State persistence
- Safe fallback if full agent stack is missing
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from datetime import datetime
import os
import json

app = FastAPI(
    title="JONARAI API",
    version="1.0.0",
    description="Paper trading control API for JONARAI"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, "paper_state.json")
DASHBOARD_FILE = os.path.join(BASE_DIR, "dashboard.html")


def default_state():
    return {
        "open_position": None,
        "trading_paused": False,
        "last_trade_result": None,
        "closed_trades": [],
        "last_run": None,
        "last_mode": None,
        "last_error": None,
    }


def load_state():
    if not os.path.exists(STATE_FILE):
        state = default_state()
        save_state(state)
        return state

    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = default_state()
        save_state(data)
        return data

    base = default_state()
    base.update(data)
    return base


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def run_demo_fallback(state):
    state["last_run"] = datetime.utcnow().isoformat()
    state["last_mode"] = "demo_fallback"
    state["last_error"] = None

    if state.get("trading_paused"):
        save_state(state)
        return state

    if state.get("open_position"):
        pos = state["open_position"]
        entry = float(pos.get("entry_price", 0) or 0)
        current = float(pos.get("current_price", entry) or entry)
        current = round(current * 0.98, 4)
        pos["current_price"] = current
        state["open_position"] = pos

        if entry > 0 and current <= entry * 0.60:
            pnl = round(current - entry, 4)
            closed = {
                **pos,
                "exit_price": current,
                "pnl": pnl,
                "result": "LOSS",
                "exit_reason": "Stop 40%",
                "exit_time": datetime.utcnow().isoformat(),
                "status": "CLOSED",
            }
            state["closed_trades"].append(closed)
            state["open_position"] = None
            state["last_trade_result"] = "LOSS"
            state["trading_paused"] = True

        save_state(state)
        return state

    state["open_position"] = {
        "direction": "CALL",
        "symbol": "SPY",
        "strike": 580,
        "expiration": "2026-11-07",
        "type": "CALL",
        "entry_price": 2.40,
        "current_price": 2.40,
        "highest_price": 2.40,
        "lowest_price": 2.40,
        "initial_stop_price": 1.44,
        "entry_time": datetime.utcnow().isoformat(),
        "status": "OPEN",
        "source": "demo_fallback",
    }
    save_state(state)
    return state


@app.get("/")
def root():
    if os.path.exists(DASHBOARD_FILE):
        return FileResponse(DASHBOARD_FILE, media_type="text/html")
    return {
        "ok": True,
        "message": "JONARAI API is running",
        "docs": "/docs",
        "endpoints": ["/status", "/state", "/run-loop", "/resume", "/pause", "/closed-trades", "/health"],
    }


@app.get("/status")
def status():
    state = load_state()
    return {
        "ok": True,
        "trading_paused": bool(state.get("trading_paused", False)),
        "has_open_position": state.get("open_position") is not None,
        "last_trade_result": state.get("last_trade_result"),
        "open_position": state.get("open_position"),
        "last_run": state.get("last_run"),
        "last_mode": state.get("last_mode"),
        "last_error": state.get("last_error"),
    }


@app.get("/state")
def get_state():
    return load_state()


@app.post("/run-loop")
def run_loop():
    state = load_state()
    try:
        from paper_loop import main as run_paper_loop
        run_paper_loop()
        state = load_state()
        state["last_run"] = datetime.utcnow().isoformat()
        state["last_mode"] = "full"
        state["last_error"] = None
        save_state(state)
        return JSONResponse({
            "ok": True,
            "mode": "full",
            "message": "تم تشغيل الحلقة الكاملة",
            "state": state,
        })
    except Exception as e:
        err = f"{type(e).__name__}: {str(e)}"
        state = run_demo_fallback(state)
        state["last_error"] = err
        save_state(state)
        return JSONResponse({
            "ok": True,
            "mode": "demo_fallback",
            "message": "الحلقة الكاملة غير متاحة حالياً، تم تشغيل الوضع التجريبي",
            "warning": err,
            "state": state,
        })


@app.post("/resume")
def resume_trading():
    state = load_state()
    state["trading_paused"] = False
    state["last_run"] = datetime.utcnow().isoformat()
    save_state(state)
    return {
        "ok": True,
        "message": "تم إعادة تفعيل التداول",
        "state": state,
    }


@app.post("/pause")
def pause_trading():
    state = load_state()
    state["trading_paused"] = True
    state["last_run"] = datetime.utcnow().isoformat()
    save_state(state)
    return {
        "ok": True,
        "message": "تم إيقاف التداول يدوياً",
        "state": state,
    }


@app.get("/closed-trades")
def closed_trades():
    state = load_state()
    return {
        "ok": True,
        "count": len(state.get("closed_trades", [])),
        "trades": state.get("closed_trades", []),
    }


@app.post("/reset-state")
def reset_state():
    state = default_state()
    save_state(state)
    return {
        "ok": True,
        "message": "تمت إعادة ضبط الحالة",
        "state": state,
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "JONARAI API",
        "time": datetime.utcnow().isoformat() + "Z",
        "state_file": os.path.exists(STATE_FILE),
        "dashboard_file": os.path.exists(DASHBOARD_FILE),
    }
