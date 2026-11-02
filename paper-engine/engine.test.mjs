import test from "node:test";
import assert from "node:assert/strict";
import { runPaperSimulation, validateBars } from "./engine.mjs";

const fixture = [
  {time:"09:30",open:100,high:101,low:99,close:100,volume:1000,ema20:99,ema50:98,volumeRatio:1,oiDelta:0,source:"SYNTHETIC_FIXTURE"},
  {time:"09:35",open:100,high:102,low:100,close:101.1,volume:1200,ema20:100,ema50:99,volumeRatio:1.3,oiDelta:10,source:"SYNTHETIC_FIXTURE"},
  {time:"09:40",open:101,high:102,low:100,close:101,volume:900,ema20:100,ema50:99,volumeRatio:1,oiDelta:0,source:"SYNTHETIC_FIXTURE"},
  {time:"09:45",open:101,high:103,low:100.5,close:102,volume:1400,ema20:101,ema50:99,volumeRatio:1.4,oiDelta:12,source:"SYNTHETIC_FIXTURE"},
  {time:"09:50",open:102,high:102.5,low:100,close:101,volume:1100,ema20:101,ema50:99,volumeRatio:1.1,oiDelta:0,source:"SYNTHETIC_FIXTURE"}
];

test("rejects any non-synthetic source", () => {
  const bad = fixture.map(x => ({...x}));
  bad[1].source = "LIVE";
  assert.throws(() => validateBars(bad), /source must be SYNTHETIC_FIXTURE/);
});

test("opens only when breakout, trend, volume and OI gates pass", () => {
  const result = runPaperSimulation(fixture);
  assert.equal(result.mode, "OFFLINE_PAPER_ONLY");
  assert.equal(result.brokerConnected, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.summary.trades, 1);
  assert.equal(result.trades[0].source, "SYNTHETIC_FIXTURE");
});

test("uses stop-first when stop and target are touched in same bar", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high:110, low:90, close:101}
  ];
  const result = runPaperSimulation(bars);
  assert.equal(result.trades[0].reason, "STOP");
});

test("records end-of-data close for an open simulated position", () => {
  const bars = [fixture[0], fixture[1], {...fixture[2], high:101.5, low:100.5, close:101}];
  const result = runPaperSimulation(bars);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].reason, "END_OF_DATA");
});

test("applies max holding-bar time exit", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    ...Array.from({length:3}, (_,i)=>({...fixture[2],time:`t${i}`,high:101.5,low:100.5,close:101}))
  ];
  const result = runPaperSimulation(bars, {maxHoldBars:2});
  assert.equal(result.trades[0].reason, "TIME_EXIT");
});


test("rejects missing, null, string, NaN and infinite numeric fields", () => {
  for (const value of [undefined, null, "", "101", NaN, Infinity, -Infinity]) {
    const bars = fixture.map(x => ({...x}));
    if (value === undefined) delete bars[1].close;
    else bars[1].close = value;
    assert.throws(() => validateBars(bars), /invalid close/);
  }
});

test("rejects zero or negative OHLC prices", () => {
  for (const value of [0, -1]) {
    const bars = fixture.map(x => ({...x}));
    bars[1].low = value;
    assert.throws(() => validateBars(bars), /non-positive OHLC price|inconsistent OHLC/);
  }
});

test("rejects inconsistent OHLC ranges", () => {
  const bars = fixture.map(x => ({...x}));
  bars[1].high = 100.5;
  assert.throws(() => validateBars(bars), /inconsistent OHLC/);
});

test("rejects negative volume and volume ratio", () => {
  for (const field of ["volume", "volumeRatio"]) {
    const bars = fixture.map(x => ({...x}));
    bars[1][field] = -0.1;
    assert.throws(() => validateBars(bars), /negative volume data/);
  }
});

test("requires at least three bars", () => {
  assert.throws(() => validateBars(fixture.slice(0, 2)), /At least 3 bars/);
});

test("does not create a trade when any entry gate fails", () => {
  for (const patch of [
    {close: 100.5},
    {ema20: 98},
    {volumeRatio: 1.19},
    {oiDelta: 0}
  ]) {
    const bars = fixture.slice(0, 3).map(x => ({...x}));
    bars[1] = {...bars[1], ...patch};
    const result = runPaperSimulation(bars);
    assert.equal(result.summary.trades, 0);
  }
});

test("records a target exit when only the target is touched", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high: 102.1, low: 100.8, close: 102}
  ];
  const result = runPaperSimulation(bars);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].reason, "TARGET");
});

test("includes fees and slippage in the reported net result", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high: 101.5, low: 100.5, close: 101}
  ];
  const withCosts = runPaperSimulation(bars);
  const withoutCosts = runPaperSimulation(bars, {feePctPerSide: 0, slippagePct: 0});
  assert.ok(withCosts.trades[0].netPct < withoutCosts.trades[0].netPct);
});

test("never reports live execution or broker connectivity", () => {
  const result = runPaperSimulation(fixture);
  assert.equal(result.mode, "OFFLINE_PAPER_ONLY");
  assert.equal(result.source, "SYNTHETIC_FIXTURE");
  assert.equal(result.brokerConnected, false);
  assert.equal(result.executionEnabled, false);
  assert.ok(result.trades.every(trade => trade.source === "SYNTHETIC_FIXTURE"));
});
