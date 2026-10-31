import { Application, Container, Text } from "pixi.js";
import { parseScene, type Scene } from "./scene";
import {
  createSceneNode,
  resizeScene,
  sceneEnvironmentMetrics,
  sceneGround,
  type SceneNode,
} from "./renderer";
/** Read the exported scene unchanged. A viewport resize fits the canonical world, never rewrites coordinates. */
export async function loadAuthoredScene(
  app: Application,
  url: string,
  inline?: string,
) {
  const status = new Text({
    text: "Loading scene…",
    style: { fill: 0xffffff, fontSize: 18 },
  });
  status.position.set(24, 24);
  app.stage.addChild(status);
  let scene: Scene | undefined;
  const nodes: SceneNode[] = [];
  let time = 0,
    error = "";
  const root = new Container();
  let view: unknown;
  Object.defineProperty(window, "__ARKODIA_AUTHORED_SCENE__", {
    configurable: true,
    get: () => ({
      setState: (instanceId: string, stateId: string, valueId: string) => {
        const node = nodes.find((n) => n.label === instanceId);
        if (!node?.states.setState(stateId, valueId)) return false;
        const instance = scene?.instances.find((o) => o.id === instanceId);
        if (instance) instance.stateValues = node.states.current;
        node.sceneTick(time);
        return true;
      },
      state: error ? "error" : scene ? "ready" : "loading",
      error,
      scene,
      time,
      view,
      nodes: nodes.map((n) => n.sceneMetrics()),
      environment: scene ? sceneEnvironmentMetrics(root, scene, time) : null,
    }),
  });
  try {
    let data = inline;
    if (data === undefined) {
      const address = new URL(url, location.href);
      if (!["http:", "https:"].includes(address.protocol))
        throw Error("Scene requires an HTTP URL");
      const response = await fetch(address, {
        credentials: "omit",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw Error(`Scene HTTP ${response.status}`);
      data = await response.text();
    }
    if (data.length > 10 * 1024 * 1024) throw Error("Scene exceeds budget");
    const parsed = parseScene(JSON.parse(data));
    sceneGround(root, parsed);
    for (const o of parsed.instances.filter((o) => o.visible)) {
      const node = await createSceneNode(o);
      nodes.push(node);
      root.addChild(node);
    }
    time = parsed.playback?.time ?? 0;
    for (const n of nodes) n.sceneTick(time);
    app.stage.addChild(root);
    const resize = () => {
      view = resizeScene(root, app.screen.width, app.screen.height, parsed);
    };
    resize();
    app.renderer.on("resize", resize);
    app.ticker.add((t) => {
      if (parsed.playback?.playing ?? true)
        time += Math.min(t.deltaMS / 1000, 0.05);
      for (const n of nodes) n.sceneTick(time);
    });
    scene = parsed;
    status.destroy();
    app.canvas.setAttribute("aria-label", "Authored scene runtime");
    app.canvas.setAttribute("aria-busy", "false");
  } catch (e) {
    error = String(e);
    status.text = `Unable to load scene: ${error}`;
    root.destroy({ children: true });
    app.canvas.setAttribute("aria-busy", "false");
  }
}
