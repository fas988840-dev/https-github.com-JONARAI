/**
 * JONARAI offline paper engine.
 * Accepts synthetic fixture bars only; no network, broker, order-routing, or live-data code.
 * Educational software QA harness, not a trading recommendation.
 */

const REQUIRED_SOURCE = "SYNTHETIC_FIXTURE";

export function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length < 3) throw new Error("At least 3 bars are required");
  const seenTimes = new Set();
  let previousTime = null;
  for (const [i, b] of bars.entries()) {
    if (b === null || typeof b !== "object" || Array.isArray(b)) {
      throw new Error(`Bar ${i} must be an object`);
    }
    if (typeof b.time === "string" && seenTimes.has(b.time)) {
      throw new Error(`Bar ${i} has duplicate time`);
    }
    seenTimes.add(b.time);
    if (typeof b.time !== "string" || !b.time.trim()) {
      throw new Error(`Bar ${i} has invalid time`);
    }
    if (previousTime !== null && b.time <= previousTime) {
      throw new Error(`Bar ${i} time is not strictly increasing`);
    }
    previousTime = b.time;
    if (b.source !== REQUIRED_SOURCE) throw new Error(`Bar ${i} rejected: source must be ${REQUIRED_SOURCE}`);
    for (const k of ["open", "high", "low", "close", "volume", "ema20", "ema50", "volumeRatio", "oiDelta"]) {
      if (typeof b[k] !== "number" || !Number.isFinite(b[k])) {
        throw new Error(`Bar ${i} has invalid ${k}`);
      }
    }
    if ([b.open, b.high, b.low, b.close].some(price => price <= 0)) {
      throw new Error(`Bar ${i} has non-positive OHLC price`);
    }
    if (b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close, b.high)) {
      throw new Error(`Bar ${i} has inconsistent OHLC`);
    }
    if (b.volume < 0 || b.volumeRatio < 0) throw new Error(`Bar ${i} has negative volume data`);
  }
  return true;
}

export function runPaperSimulation(bars, config = {}) {
  validateBars(bars);
  const cfg = {
    volumeRatioMin: 1.2,
    stopPct: 0.006,
    rewardRisk: 1.5,
    maxHoldBars: 18,
    feePctPerSide: 0.0005,
    slippagePct: 0.0005,
    ...config
  };
  const numericConfig = ["volumeRatioMin", "stopPct", "rewardRisk", "maxHoldBars", "feePctPerSide", "slippagePct"];
  for (const key of numericConfig) {
    if (typeof cfg[key] !== "number" || !Number.isFinite(cfg[key])) {
      throw new Error(`Invalid configuration: ${key} must be a finite number`);
    }
  }
  if (cfg.volumeRatioMin < 0) throw new Error("Invalid configuration: volumeRatioMin must be >= 0");
  if (cfg.stopPct <= 0) throw new Error("Invalid configuration: stopPct must be > 0");
  if (cfg.rewardRisk <= 0) throw new Error("Invalid configuration: rewardRisk must be > 0");
  if (!Number.isInteger(cfg.maxHoldBars) || cfg.maxHoldBars < 1) {
    throw new Error("Invalid configuration: maxHoldBars must be a positive integer");
  }
  if (cfg.feePctPerSide < 0 || cfg.feePctPerSide >= 1) {
    throw new Error("Invalid configuration: feePctPerSide must be in [0, 1)");
  }
  if (cfg.slippagePct < 0 || cfg.slippagePct >= 1) {
    throw new Error("Invalid configuration: slippagePct must be in [0, 1)");
  }

  const trades = [];
  let active = null;
  let skipped = 0;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i], prev = bars[i - 1];

    if (active) {
      const heldBars = i - active.entryIndex;
      const stopHit = bar.low <= active.stop;
      const targetHit = bar.high >= active.target;
      let exitPrice = null, reason = null;

      // Conservative ambiguity handling: stop wins if stop and target occur in one bar.
      if (stopHit) { exitPrice = active.stop; reason = "STOP"; }
      else if (targetHit) { exitPrice = active.target; reason = "TARGET"; }
      else if (heldBars >= cfg.maxHoldBars) { exitPrice = bar.close; reason = "TIME_EXIT"; }

      if (reason) {
        const entryFill = active.entry * (1 + cfg.slippagePct);
        const exitFill = exitPrice * (1 - cfg.slippagePct);
        const grossPct = (exitFill - entryFill) / entryFill;
        const netPct = grossPct - (2 * cfg.feePctPerSide);
        if (![entryFill, exitFill, grossPct, netPct].every(Number.isFinite)) {
          throw new Error("Non-finite trade accounting result");
        }
        trades.push({
          entryTime: active.entryTime, exitTime: bar.time,
          entry: round(entryFill), exit: round(exitFill),
          stop: round(active.stop), target: round(active.target),
          heldBars, reason, grossPct: round(grossPct * 100, 4),
          netPct: round(netPct * 100, 4),
          result: netPct > 0 ? "WIN" : netPct < 0 ? "LOSS" : "FLAT",
          source: REQUIRED_SOURCE
        });
        active = null;
      }
      continue;
    }

    const breakout = bar.close > prev.high;
    const trend = bar.ema20 > bar.ema50;
    const volumeOk = bar.volumeRatio >= cfg.volumeRatioMin;
    const oiOk = bar.oiDelta > 0;
    if (breakout && trend && volumeOk && oiOk) {
      const entry = bar.close;
      const risk = entry * cfg.stopPct;
      const stop = entry - risk;
      const target = entry + risk * cfg.rewardRisk;
      if (![risk, stop, target].every(Number.isFinite) || risk <= 0 || stop <= 0 || target <= entry) {
        throw new Error("Unrepresentable derived price levels for entry");
      }
      active = {
        entry, entryTime: bar.time, entryIndex: i,
        stop, target
      };
    } else skipped++;
  }

  if (active) {
    const last = bars[bars.length - 1];
    const entryFill = active.entry * (1 + cfg.slippagePct);
    const exitFill = last.close * (1 - cfg.slippagePct);
    const grossPct = ((exitFill - entryFill) / entryFill) * 100;
    const netPct = grossPct - 2 * cfg.feePctPerSide * 100;
    if (![entryFill, exitFill, grossPct, netPct].every(Number.isFinite)) {
      throw new Error("Non-finite end-of-data accounting result");
    }
    trades.push({
      entryTime: active.entryTime, exitTime: last.time,
      entry: round(entryFill), exit: round(exitFill),
      stop: round(active.stop), target: round(active.target),
      heldBars: bars.length - 1 - active.entryIndex,
      reason: "END_OF_DATA", grossPct: round(grossPct, 4),
      netPct: round(netPct, 4), result: netPct > 0 ? "WIN" : netPct < 0 ? "LOSS" : "FLAT",
      source: REQUIRED_SOURCE
    });
  }

  const wins = trades.filter(t => t.result === "WIN").length;
  const losses = trades.filter(t => t.result === "LOSS").length;
  const netReturns = trades.map(t => t.netPct);
  return {
    mode: "OFFLINE_PAPER_ONLY",
    source: REQUIRED_SOURCE,
    executionEnabled: false,
    brokerConnected: false,
    barsProcessed: bars.length,
    trades,
    summary: {
      trades: trades.length, wins, losses,
      flats: trades.filter(t => t.result === "FLAT").length,
      winRatePct: trades.length ? round(wins / trades.length * 100, 2) : 0,
      netReturnPct: round(netReturns.reduce((a, b) => a + b, 0), 4),
      averageTradePct: trades.length ? round(netReturns.reduce((a, b) => a + b, 0) / trades.length, 4) : 0,
      skippedBars: skipped
    }
  };
}

function round(n, digits = 4) {
  return Number(n.toFixed(digits));
}
