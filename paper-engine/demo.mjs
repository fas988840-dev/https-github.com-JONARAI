import { runPaperSimulation } from "./engine.mjs";

const bars = [
  [100,101,99,100,99,98,1.0,0],
  [100,102,100,101,100,99,1.3,10],
  [101,102,100,101,100,99,1.0,0],
  [101,103,100.5,102,101,99,1.4,12],
  [102,102.5,100,101,101,99,1.1,0]
].map(([open,high,low,close,ema20,ema50,volumeRatio,oiDelta],i)=>({
  time:`SYNTH-${i}`,open,high,low,close,ema20,ema50,volumeRatio,oiDelta,
  volume:1000,source:"SYNTHETIC_FIXTURE"
}));

console.log(JSON.stringify(runPaperSimulation(bars), null, 2));
