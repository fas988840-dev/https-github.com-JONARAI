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
    ...Array.from({length:3}, (_,i)=>({...fixture[2],time:["09:40","09:45","09:50"][i],high:101.5,low:100.5,close:101}))
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


test("accepts a time gap without fabricating intermediate bars", () => {
  const bars = [
    {...fixture[0], time:"09:30"},
    {...fixture[1], time:"09:35"},
    {...fixture[2], time:"10:15"}
  ];
  const result = runPaperSimulation(bars);
  assert.equal(result.barsProcessed, 3);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].exitTime, "10:15");
});

test("rejects duplicate bar timestamps", () => {
  const bars = fixture.map(x => ({...x}));
  bars[2].time = bars[1].time;
  assert.throws(() => validateBars(bars), /duplicate time/);
});

test("supports multiple sequential simulated exit types and reconciles counts", () => {
  const bars = [
    {...fixture[0], time:"09:30"},
    {...fixture[1], time:"09:35"},
    // First position reaches its target without touching its stop.
    {...fixture[2], time:"09:40", high:102.1, low:100.8, close:102},
    // A fresh breakout after the first position has closed.
    {...fixture[1], time:"09:45", open:102.1, high:102.8, low:102, close:102.5},
    // Second position reaches its stop, but not its target.
    {...fixture[2], time:"09:50", open:102.2, high:102.7, low:101.8, close:102}
  ];
  const result = runPaperSimulation(bars);
  assert.deepEqual(result.trades.map(t => t.reason), ["TARGET", "STOP"]);
  assert.equal(result.trades.length, 2);
  assert.equal(result.summary.trades, 2);
  assert.equal(result.summary.wins, result.trades.filter(t => t.result === "WIN").length);
  assert.equal(result.summary.losses, result.trades.filter(t => t.result === "LOSS").length);
  assert.equal(result.summary.wins + result.summary.losses, result.summary.trades);
});

test("summary reconciles win rate, net return and average trade", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high:102.1, low:100.8, close:102}
  ];
  const result = runPaperSimulation(bars);
  const {trades, summary} = result;
  const wins = trades.filter(t => t.result === "WIN").length;
  const losses = trades.filter(t => t.result === "LOSS").length;
  const total = Number(trades.reduce((sum,t)=>sum+t.netPct,0).toFixed(4));
  assert.equal(summary.trades, trades.length);
  assert.equal(summary.wins, wins);
  assert.equal(summary.losses, losses);
  assert.equal(summary.winRatePct, Number((wins / trades.length * 100).toFixed(2)));
  assert.equal(summary.netReturnPct, total);
  assert.equal(summary.averageTradePct, Number((total / trades.length).toFixed(4)));
});

test("empty simulation summary uses zero-valued metrics", () => {
  const bars = fixture.slice(0,3).map(x=>({...x, close:100, volumeRatio:1, oiDelta:0}));
  const result = runPaperSimulation(bars);
  assert.equal(result.summary.trades, 0);
  assert.equal(result.summary.wins, 0);
  assert.equal(result.summary.losses, 0);
  assert.equal(result.summary.winRatePct, 0);
  assert.equal(result.summary.netReturnPct, 0);
  assert.equal(result.summary.averageTradePct, 0);
});


test("rejects malformed bar structures and required fields with controlled errors", () => {
  for (const badBar of [null, undefined, [], "bar", 42]) {
    const bars = fixture.map(x => ({...x}));
    bars[1] = badBar;
    assert.throws(() => validateBars(bars), /must be an object/);
  }
  for (const field of ["time", "source"]) {
    const bars = fixture.map(x => ({...x}));
    delete bars[1][field];
    assert.throws(() => validateBars(bars), field === "time" ? /invalid time/ : /source must be/);
  }
  for (const value of [[], {}, new Number(2)]) {
    const bars = fixture.map(x => ({...x}));
    bars[1].volume = value;
    assert.throws(() => validateBars(bars), /invalid volume/);
  }
});

test("rejects blank and out-of-order timestamps", () => {
  const blank = fixture.map(x => ({...x}));
  blank[1].time = "  ";
  assert.throws(() => validateBars(blank), /invalid time/);
  const outOfOrder = fixture.map(x => ({...x}));
  outOfOrder[2].time = "09:34";
  assert.throws(() => validateBars(outOfOrder), /strictly increasing/);
});

test("rejects invalid configuration values across every setting", () => {
  const invalidCases = [
    [{volumeRatioMin: NaN}, /volumeRatioMin must be a finite number/],
    [{volumeRatioMin: -1}, /volumeRatioMin must be >= 0/],
    [{stopPct: Infinity}, /stopPct must be a finite number/],
    [{stopPct: 0}, /stopPct must be > 0/],
    [{stopPct: -0.1}, /stopPct must be > 0/],
    [{rewardRisk: NaN}, /rewardRisk must be a finite number/],
    [{rewardRisk: 0}, /rewardRisk must be > 0/],
    [{maxHoldBars: 1.5}, /maxHoldBars must be a positive integer/],
    [{maxHoldBars: 0}, /maxHoldBars must be a positive integer/],
    [{maxHoldBars: Infinity}, /maxHoldBars must be a finite number/],
    [{feePctPerSide: -0.01}, /feePctPerSide must be in/],
    [{feePctPerSide: NaN}, /feePctPerSide must be a finite number/],
    [{slippagePct: -0.01}, /slippagePct must be in/],
    [{slippagePct: 1}, /slippagePct must be in/]
  ];
  for (const [config, message] of invalidCases) {
    assert.throws(() => runPaperSimulation(fixture, config), message);
  }
});

test("classifies zero-net outcomes as FLAT and reconciles flat count", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high: 101.5, low: 100.5, close: 101}
  ];
  const result = runPaperSimulation(bars, {feePctPerSide: 0, slippagePct: 0});
  // Entry and final close are both 101.1 only when the last close matches entry.
  bars[2].close = 101.1;
  const flat = runPaperSimulation(bars, {feePctPerSide: 0, slippagePct: 0});
  assert.equal(flat.trades[0].result, "FLAT");
  assert.equal(flat.summary.flats, 1);
  assert.equal(flat.summary.trades, flat.summary.wins + flat.summary.losses + flat.summary.flats);
  assert.equal(result.summary.flats, 0);
});


test("entry gate boundaries are strict except volume minimum", () => {
  const cases = [
    {patch: {close: 101}, expected: 0}, // equal to previous high: no breakout
    {patch: {ema20: 99}, expected: 0}, // equal EMAs: no trend
    {patch: {volumeRatio: 1.2}, expected: 1}, // threshold is inclusive
    {patch: {oiDelta: 0}, expected: 0} // OI must be strictly positive
  ];
  for (const {patch, expected} of cases) {
    const bars = fixture.slice(0, 3).map(x => ({...x}));
    bars[1] = {...bars[1], ...patch};
    const result = runPaperSimulation(bars);
    assert.equal(result.summary.trades, expected);
  }
});

test("maxHoldBars one exits on the first bar after entry", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high: 101.5, low: 100.5, close: 101}
  ];
  const result = runPaperSimulation(bars, {maxHoldBars: 1});
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].reason, "TIME_EXIT");
  assert.equal(result.trades[0].heldBars, 1);
});

test("stop takes priority over time exit on the max-hold bar", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high: 101.5, low: 100, close: 100.5}
  ];
  const result = runPaperSimulation(bars, {maxHoldBars: 1});
  assert.equal(result.trades[0].reason, "STOP");
  assert.equal(result.trades[0].heldBars, 1);
});

test("cost accounting matches explicit fill and fee arithmetic", () => {
  const bars = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high: 102.1, low: 100.8, close: 102}
  ];
  const feePctPerSide = 0.001;
  const slippagePct = 0.002;
  const result = runPaperSimulation(bars, {feePctPerSide, slippagePct});
  const entryFill = 101.1 * (1 + slippagePct);
  const exitFill = 101.1 + (101.1 * 0.006 * 1.5);
  const slippedExit = exitFill * (1 - slippagePct);
  const grossPct = (slippedExit - entryFill) / entryFill * 100;
  const netPct = grossPct - 2 * feePctPerSide * 100;
  assert.equal(result.trades[0].entry, Number(entryFill.toFixed(4)));
  assert.equal(result.trades[0].exit, Number(slippedExit.toFixed(4)));
  assert.equal(result.trades[0].grossPct, Number(grossPct.toFixed(4)));
  assert.equal(result.trades[0].netPct, Number(netPct.toFixed(4)));
});

test("end-of-data immediately after entry closes with zero held bars", () => {
  const bars = fixture.slice(0, 2).concat([{...fixture[1], time: "09:40", close: 101.1, high: 102, low: 101, open: 101.1}]);
  const result = runPaperSimulation(bars);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].reason, "END_OF_DATA");
  assert.equal(result.trades[0].heldBars, 1);
  assert.equal(result.trades[0].exitTime, "09:40");
});


test("rejects finite extreme prices when derived risk levels overflow", () => {
  const bars = fixture.map(x => ({...x}));
  bars[1] = {...bars[1], close: 1.79e308, high: 1.79e308, low: 1.78e308, open: 1.78e308};
  assert.throws(() => runPaperSimulation(bars), /Unrepresentable derived price levels/);
});

test("rejects subnormal prices when risk underflows to zero", () => {
  const bars = fixture.map(x => ({...x}));
  assert.throws(() => runPaperSimulation(bars, {stopPct: Number.MIN_VALUE}), /Unrepresentable derived price levels/);
});

test("rejects non-finite accounting results caused by extreme configuration", () => {
  const bars = [
    {...fixture[0], open: 1.2e308, high: 1.21e308, low: 1.19e308, close: 1.2e308},
    {...fixture[1], open: 1.2e308, high: 1.22e308, low: 1.2e308, close: 1.211e308},
    {...fixture[2], open: 1.211e308, high: 1.25e308, low: 1.21e308, close: 1.23e308}
  ];
  assert.throws(() => runPaperSimulation(bars, {slippagePct: 0.9}), /Non-finite trade accounting result/);
});

test("skippedBars counts only bars evaluated without an entry or active position", () => {
  const noSignals = fixture.slice(0, 3).map(x => ({...x, volumeRatio: 1, oiDelta: 0}));
  const noTrade = runPaperSimulation(noSignals);
  assert.equal(noTrade.summary.trades, 0);
  assert.equal(noTrade.summary.skippedBars, 2);

  const signalThenExit = [
    {...fixture[0]},
    {...fixture[1]},
    {...fixture[2], high: 102.1, low: 100.8, close: 102},
    {...fixture[2], time: "09:45", high: 101.5, low: 100.5, close: 101}
  ];
  const withTrade = runPaperSimulation(signalThenExit);
  assert.equal(withTrade.trades.length, 1);
  assert.equal(withTrade.trades[0].reason, "TARGET");
  assert.equal(withTrade.summary.skippedBars, 1);
});

test("large but representable prices retain finite trade outputs", () => {
  const bars = [
    {...fixture[0], open: 1e100, high: 1.01e100, low: 0.99e100, close: 1e100},
    {...fixture[1], open: 1e100, high: 1.02e100, low: 1e100, close: 1.011e100},
    {...fixture[2], open: 1.011e100, high: 1.04e100, low: 1.01e100, close: 1.03e100}
  ];
  const result = runPaperSimulation(bars);
  assert.equal(result.trades.length, 1);
  for (const value of Object.values(result.trades[0]).filter(v => typeof v === "number")) {
    assert.ok(Number.isFinite(value));
  }
});
