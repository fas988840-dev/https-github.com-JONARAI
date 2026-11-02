/**
 * JONARAI offline paper engine.
 * Accepts synthetic fixture bars only; no network, broker, order-routing, or live-data code.
 * Educational software QA harness, not a trading recommendation.
 */

const REQUIRED_SOURCE = "SYNTHETIC_FIXTURE";

export function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length < 3) throw new Error("At least 3 bars are required");
  for (const [i, b] of bars.entries()) {
    if (b.source !== REQUIRED_SOURCE) throw new Error(`Bar ${i} rejected: source must be ${REQUIRED_SOURCE}`);
    if (typeof b.time !== "string" || !b.time.trim()) {
      throw new Error(`Bar ${i} has invalid time`);
    }
    for (const k of ["open", "high", "low", "close", "volume", "ema20", "ema50", "volumeRatio", "oiDelta"]) {
      if (b[k] === undefined || !Number.isFinite(Number(b[k]))) throw new Error(`Bar ${i} has invalid ${k}`);
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
  if (!(cfg.stopPct > 0 && cfg.rewardRisk > 0 && cfg.maxHoldBars >= 1)) {
    throw new Error("Invalid risk configuration");
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
      active = {
        entry, entryTime: bar.time, entryIndex: i,
        stop: entry - risk, target: entry + risk * cfg.rewardRisk
      };
    } else skipped++;
  }

  if (active) {
    const last = bars[bars.length - 1];
    const entryFill = active.entry * (1 + cfg.slippagePct);
    const exitFill = last.close * (1 - cfg.slippagePct);
    const netPct = ((exitFill - entryFill) / entryFill) * 100 - 2 * cfg.feePctPerSide * 100;
    trades.push({
      entryTime: active.entryTime, exitTime: last.time,
      entry: round(entryFill), exit: round(exitFill),
      stop: round(active.stop), target: round(active.target),
      heldBars: bars.length - 1 - active.entryIndex,
      reason: "END_OF_DATA", grossPct: round(((exitFill - entryFill) / entryFill) * 100, 4),
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
