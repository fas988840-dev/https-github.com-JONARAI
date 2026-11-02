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
