import "pixi.js/unsafe-eval";
// The previous published foundation scene remains available for regression evidence.
if (new URLSearchParams(location.search).get("channel") === "runtime-demo")
  await import("./demo");
else await import("./stronghold-main");
