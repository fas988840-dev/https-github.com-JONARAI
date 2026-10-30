import test from "node:test";
import assert from "node:assert/strict";
import { assertServiceToken, cleanQuery, createGatewayClient, normalizeSnapshot, pickExactContract, publicError, quoteFresh } from "../src/core.mjs";

test("service token accepts Node IncomingMessage headers", () => {
  assert.doesNotThrow(() => assertServiceToken({ headers: { authorization: "Bearer secret" } }, "secret"));
  assert.throws(
    () => assertServiceToken({ headers: { authorization: "Bearer wrong" } }, "secret"),
    /Unauthorized/,
  );
});

test("cleanQuery rejects blanks and normalizes whitespace", () => {
  assert.throws(() => cleanQuery("   "), /query is required/);
  assert.equal(cleanQuery("  Apple   Inc  "), "Apple Inc");
});

test("pickExactContract returns only an exact ticker and never falls back", () => {
  const rows = [{ symbol: "SPXL", conid: 2 }, { symbol: "SPX", conid: 1 }];
  assert.equal(pickExactContract(rows, "spx").conid, 1);
  assert.equal(pickExactContract([{ symbol: "SPXL", conid: 2 }], "SPX"), null);
  assert.equal(pickExactContract([{ symbol: "Apple Inc", conid: 3 }], "AAPL"), null);
  assert.equal(pickExactContract(rows, "   "), null);
});

test("snapshot normalization keeps executable top of book", () => {
  const quote = normalizeSnapshot({ conid: 416904, "31": "7,637.76", "84": "7637.5", "86": "7638.0", _updated: 1000 });
  assert.deepEqual({ last: quote.last, bid: quote.bid, ask: quote.ask }, { last: 7637.76, bid: 7637.5, ask: 7638 });
});

test("freshness rejects stale or future timestamps", () => {
  assert.equal(quoteFresh(9900, 10000, 200), true);
  assert.equal(quoteFresh(9000, 10000, 200), false);
  assert.equal(quoteFresh(11000, 10000, 200), false);
});

test("Gateway client attaches a bounded request timeout", async () => {
  let seenSignal;
  const gateway = createGatewayClient({
    baseUrl: "https://gateway.example/v1/api",
    timeoutMs: 1234,
    fetchImpl: async (_url, options) => {
      seenSignal = options.signal;
      return { ok: true, json: async () => ({ connected: true }) };
    },
  });
  await gateway("/iserver/auth/status");
  assert.ok(seenSignal instanceof AbortSignal);
  assert.equal(seenSignal.aborted, false);
});

test("Gateway timeout is classified without exposing transport details", async () => {
  const gateway = createGatewayClient({
    baseUrl: "https://gateway.example/v1/api",
    fetchImpl: async () => { throw Object.assign(new Error("secret host detail"), { name: "TimeoutError" }); },
  });
  await assert.rejects(gateway("/iserver/auth/status"), (error) => error.code === "GATEWAY_TIMEOUT");
  const safe = publicError(Object.assign(new Error("secret host detail"), { code: "GATEWAY_TIMEOUT" }));
  assert.equal(safe.status, 504);
  assert.equal(safe.payload.message, "Upstream service timed out");
  assert.equal(JSON.stringify(safe).includes("secret host detail"), false);
});

test("unknown upstream errors are sanitized", () => {
  const safe = publicError(Object.assign(new Error("internal URL and token"), { code: "IBKR_GATEWAY_ERROR", status: 500 }));
  assert.equal(safe.status, 502);
  assert.equal(safe.payload.code, "BRIDGE_UPSTREAM_ERROR");
  assert.equal(JSON.stringify(safe).includes("internal URL"), false);
});
