const DEFAULT_FIELDS = "31,84,85,86,88,7059";

export function assertServiceToken(request, token) {
  if (!token) throw Object.assign(new Error("BRIDGE_API_TOKEN is not configured"), { status: 503, code: "CONFIGURATION_REQUIRED" });
  const supplied = typeof request.headers?.get === "function"
    ? request.headers.get("authorization") || ""
    : request.headers?.authorization || request.headers?.Authorization || "";
  if (supplied !== `Bearer ${token}`) throw Object.assign(new Error("Unauthorized"), { status: 401, code: "UNAUTHORIZED" });
}

export function cleanQuery(value) {
  const query = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!query) throw Object.assign(new Error("query is required"), { status: 400, code: "INVALID_QUERY" });
  return query;
}

export function pickExactContract(rows, query) {
  const wanted = String(query || "").trim().toUpperCase();
  if (!wanted || !Array.isArray(rows)) return null;
  return rows.find((row) => String(row?.symbol || "").trim().toUpperCase() === wanted) || null;
}

export function publicError(error) {
  const known = {
    INVALID_QUERY: { status: 400, message: "Invalid request" },
    UNAUTHORIZED: { status: 401, message: "Unauthorized" },
    CONFIGURATION_REQUIRED: { status: 503, message: "Service configuration required" },
    IBKR_SESSION_REQUIRED: { status: 503, message: "IBKR session is not ready" },
    GATEWAY_TIMEOUT: { status: 504, message: "Upstream service timed out" },
  };
  const code = known[error?.code] ? error.code : "BRIDGE_UPSTREAM_ERROR";
  const fallback = { status: 502, message: "Upstream service unavailable" };
  const selected = known[code] || fallback;
  return {
    status: selected.status,
    payload: { status: "error", code, message: selected.message },
  };
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSnapshot(row = {}) {
  return {
    conid: numeric(row.conid),
    last: numeric(row["31"]),
    bid: numeric(row["84"]),
    bid_size: numeric(row["85"]),
    ask: numeric(row["86"]),
    ask_size: numeric(row["88"]),
    last_size: numeric(row["7059"]),
    updated_at: numeric(row._updated),
    raw: row,
  };
}

export function quoteFresh(updatedAt, now = Date.now(), maxAgeMs = 15000) {
  return Number.isFinite(updatedAt) && updatedAt > 0 && now - updatedAt >= 0 && now - updatedAt <= maxAgeMs;
}

export function createGatewayClient({ baseUrl, fetchImpl = fetch, timeoutMs = 8000 }) {
  if (!baseUrl) throw new Error("IBKR_GATEWAY_URL is required");
  const base = baseUrl.replace(/\/$/, "");
  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.min(Math.max(Math.trunc(timeoutMs), 1000), 30000)
    : 8000;
  return async function gateway(path, { method = "GET", params, body } = {}) {
    const url = new URL(base + path);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(boundedTimeoutMs),
      });
    } catch (cause) {
      if (cause?.name === "TimeoutError" || cause?.name === "AbortError") {
        throw Object.assign(new Error("Gateway request timed out"), { code: "GATEWAY_TIMEOUT" });
      }
      throw Object.assign(new Error("Gateway request failed"), { code: "IBKR_GATEWAY_ERROR" });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error("Gateway returned an unsuccessful response"), {
        code: response.status === 401 ? "IBKR_SESSION_REQUIRED" : "IBKR_GATEWAY_ERROR",
      });
    }
    return payload;
  };
}

export async function sessionStatus(gateway) {
  const status = await gateway("/iserver/auth/status");
  return {
    authenticated: Boolean(status.authenticated),
    connected: Boolean(status.connected),
    competing: Boolean(status.competing),
    raw: status,
  };
}

export async function searchContracts(gateway, query) {
  const rows = await gateway("/iserver/secdef/search", { params: { symbol: query, name: "true" } });
  return (Array.isArray(rows) ? rows : []).slice(0, 20).map((row) => ({
    symbol: row.symbol || null,
    name: row.companyName || row.description || row.symbol || null,
    conid: numeric(row.conid),
    description: row.description || null,
    sections: Array.isArray(row.sections) ? row.sections : [],
  }));
}

export async function snapshot(gateway, conids, fields = DEFAULT_FIELDS) {
  const ids = conids.filter(Number.isFinite);
  if (!ids.length) return [];
  await gateway("/iserver/marketdata/snapshot", { params: { conids: ids.join(","), fields } });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const rows = await gateway("/iserver/marketdata/snapshot", { params: { conids: ids.join(",") } });
  return (Array.isArray(rows) ? rows : []).map(normalizeSnapshot);
}

export function noTradeDecision(reasons) {
  return {
    state: "NO_TRADE",
    entry_enabled: false,
    score: null,
    reason: reasons.join(" · ") || "المعايرة التاريخية وFlow غير مكتملين",
  };
}

export { DEFAULT_FIELDS };
