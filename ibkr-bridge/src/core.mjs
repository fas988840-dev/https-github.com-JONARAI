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
  const wanted = query.toUpperCase();
  const flat = Array.isArray(rows) ? rows : [];
  return flat.find((row) => String(row.symbol || "").toUpperCase() === wanted)
    || flat.find((row) => String(row.companyName || row.description || "").toUpperCase().includes(wanted))
    || flat[0]
    || null;
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

export function createGatewayClient({ baseUrl, fetchImpl = fetch, insecureTls = false }) {
  if (!baseUrl) throw new Error("IBKR_GATEWAY_URL is required");
  const base = baseUrl.replace(/\/$/, "");
  return async function gateway(path, { method = "GET", params, body } = {}) {
    const url = new URL(base + path);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetchImpl(url, {
      method,
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      // Node's built-in fetch does not expose a portable per-request TLS bypass.
      // Keep the flag in diagnostics; terminate trusted TLS in the local gateway/proxy.
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `IBKR gateway returned ${response.status}`);
      error.status = response.status;
      error.code = response.status === 401 ? "IBKR_SESSION_REQUIRED" : "IBKR_GATEWAY_ERROR";
      throw error;
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
