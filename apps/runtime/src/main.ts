import "pixi.js/unsafe-eval";
const buildingCatalog = new URLSearchParams(location.search).get("buildingCatalog");
if (buildingCatalog) {
  const { Application } = await import("pixi.js");
  const { loadBuildingScene } = await import("./building-catalog");
  const app = new Application();
  await app.init({resizeTo:window,background:0x24282c,preference:"webgl",antialias:true});
  document.body.appendChild(app.canvas);
  await loadBuildingScene(app, buildingCatalog);
} else
// The previous published foundation scene remains available for regression evidence.
if (new URLSearchParams(location.search).get("channel") === "runtime-demo")
  await import("./demo");
else await import("./stronghold-main");
