import { runPaperSimulation } from "./engine.mjs";

const bars = [
  [100,101,99,100,99,98,1.0,0],
  [100,102,100,101.2,100,99,1.3,10],
  [101,102,101,101,100,99,1.0,0],
  [101,103,101,102,101,99,1.4,12],
  [102,102.5,100,101,101,99,1.1,0]
].map(([open,high,low,close,ema20,ema50,volumeRatio,oiDelta],i)=>({
  time:`SYNTH-${i}`,open,high,low,close,ema20,ema50,volumeRatio,oiDelta,
  volume:1000,source:"SYNTHETIC_FIXTURE"
}));

const result = runPaperSimulation(bars);
if (result.trades.length !== 1 || result.trades[0].reason !== "TARGET") {
  throw new Error("Demo contract failed: expected exactly one TARGET trade");
}
if (result.mode !== "OFFLINE_PAPER_ONLY" || result.source !== "SYNTHETIC_FIXTURE" ||
    result.executionEnabled !== false || result.brokerConnected !== false) {
  throw new Error("Demo safety contract failed");
}
console.log(JSON.stringify(result, null, 2));
