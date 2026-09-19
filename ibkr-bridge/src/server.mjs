import http from "node:http";
import {
  assertServiceToken,
  cleanQuery,
  createGatewayClient,
  noTradeDecision,
  pickExactContract,
  quoteFresh,
  searchContracts,
  sessionStatus,
  snapshot,
} from "./core.mjs";

const port = Number(process.env.PORT || 8788);
const token = process.env.BRIDGE_API_TOKEN || "";
const gateway = createGatewayClient({ baseUrl: process.env.IBKR_GATEWAY_URL || "https://localhost:5000/v1/api" });

function send(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function route(request, response) {
  assertServiceToken(request, token);
  const url = new URL(request.url, "http://bridge.local");
  if (request.method !== "GET") return send(response, 405, { status: "error", code: "READ_ONLY_BRIDGE" });

  if (url.pathname === "/health") {
    const session = await sessionStatus(gateway);
    return send(response, session.authenticated && session.connected ? 200 : 503, {
      status: session.authenticated && session.connected ? "ok" : "degraded",
      mode: "PAPER_DATA_ONLY",
      execution_enabled: false,
      session,
    });
  }

  if (url.pathname === "/api/search") {
    const query = cleanQuery(url.searchParams.get("query"));
    const results = await searchContracts(gateway, query);
    return send(response, 200, { status: "ok", query, results });
  }

  if (url.pathname === "/api/analyze") {
    const query = cleanQuery(url.searchParams.get("query"));
    const session = await sessionStatus(gateway);
    if (!session.authenticated || !session.connected) {
      return send(response, 503, { status: "error", code: "IBKR_SESSION_REQUIRED", message: "IBKR brokerage session is not ready" });
    }
    const matches = await searchContracts(gateway, query);
    const contract = pickExactContract(matches, query);
    if (!contract?.conid) return send(response, 404, { status: "error", code: "SYMBOL_NOT_FOUND", message: "No matching contract" });
    const [quote] = await snapshot(gateway, [contract.conid]);
    const reasons = [];
    if (!quote || !quoteFresh(quote.updated_at)) reasons.push("السعر متأخر أو غير مكتمل");
    reasons.push("سلسلة الخيارات الكاملة وGreeks تحتاج تهيئة Contract Discovery");
    reasons.push("Options Flow/Sweeps غير متصل");
    reasons.push("المعايرة التاريخية وWalk-Forward غير مكتملين");
    return send(response, 200, {
      status: "ok",
      source: "IBKR Web API Bridge",
      fetched_at: new Date().toISOString(),
      symbol: contract.symbol,
      name: contract.name,
      quote,
      options: [],
      integrity: {
        market_snapshot: Boolean(quote),
        quote_fresh: Boolean(quote && quoteFresh(quote.updated_at)),
        options_chain: false,
        bid_ask: Boolean(quote?.bid && quote?.ask),
        greeks: false,
        flow: false,
        calibrated_gate: false,
        reasons,
      },
      decision: noTradeDecision(reasons),
    });
  }

  return send(response, 404, { status: "error", code: "NOT_FOUND" });
}

http.createServer((request, response) => {
  route(request, response).catch((error) => send(response, error.status || 500, {
    status: "error",
    code: error.code || "BRIDGE_ERROR",
    message: error.message,
  }));
}).listen(port, "0.0.0.0", () => {
  console.log(`JONARAI IBKR bridge listening on ${port} (read-only)`);
});
