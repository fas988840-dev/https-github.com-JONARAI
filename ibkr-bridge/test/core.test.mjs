import test from "node:test";
import assert from "node:assert/strict";
import { assertServiceToken, cleanQuery, normalizeSnapshot, pickExactContract, quoteFresh } from "../src/core.mjs";

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

test("pickExactContract prefers exact ticker", () => {
  const rows = [{ symbol: "SPXL", conid: 2 }, { symbol: "SPX", conid: 1 }];
  assert.equal(pickExactContract(rows, "spx").conid, 1);
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
