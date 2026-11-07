from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import json, os, random
from datetime import datetime

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_PG = True
except ImportError:
    HAS_PG = False

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DATABASE_URL = os.getenv("DATABASE_URL")
STATE_FILE = "paper_state.json"

def get_conn():
    if not DATABASE_URL or not HAS_PG:
        return None
    return psycopg2.connect(DATABASE_URL, sslmode="require")

def init_db():
    conn = get_conn()
    if not conn:
        return
    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS paper_state (
                    id SERIAL PRIMARY KEY,
                    open_position JSONB,
                    trading_paused BOOLEAN DEFAULT FALSE,
                    last_result TEXT,
                    closed_trades JSONB DEFAULT '[]',
                    price_history JSONB DEFAULT '[]',
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("INSERT INTO paper_state (open_position) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM paper_state)")
        conn.commit()

def load_state():
    conn = get_conn()
    if conn:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT open_position, trading_paused, last_result, closed_trades, price_history FROM paper_state ORDER BY id DESC LIMIT 1")
                row = cur.fetchone()
                if row:
                    return {
                        "open_position": row["open_position"],
                        "trading_paused": row["trading_paused"],
                        "last_result": row["last_result"],
                        "closed_trades": row["closed_trades"] or [],
                        "price_history": row["price_history"] or []
                    }
    # Fallback JSON
    if not os.path.exists(STATE_FILE):
        return {"open_position": None, "trading_paused": False, "last_result": None, "closed_trades": [], "price_history": []}
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_state(state):
    conn = get_conn()
    if conn:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE paper_state SET
                        open_position = %s,
                        trading_paused = %s,
                        last_result = %s,
                        closed_trades = %s,
                        price_history = %s,
                        updated_at = NOW()
                    WHERE id = (SELECT id FROM paper_state ORDER BY id DESC LIMIT 1)
                """, (
                    json.dumps(state.get("open_position")),
                    state.get("trading_paused", False),
                    state.get("last_result"),
                    json.dumps(state.get("closed_trades", [])),
                    json.dumps(state.get("price_history", []))
                ))
            conn.commit()
        return
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
    return {"stop": round(stop, 2), "type": stop_type, "pnl%": round(pnl_pct * 100, 1), "hit": current <= stop}

@app.on_event("startup")
def startup():
    init_db()

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
                "result": result, "pnl%": trail["pnl%"], "entry": pos["entry"],
                "exit": new_price, "time": datetime.utcnow().isoformat()
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
            "entry": entry, "current": entry, "direction": "CALL",
            "stop": round(entry * 0.60, 2), "stop_type": "INITIAL", "pnl": 0,
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
