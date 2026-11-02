import {
  BufferImageSource,
  Container,
  Filter,
  GlProgram,
  Matrix,
  Rectangle,
  RenderLayer,
  Sprite,
  Texture,
  TilingSprite,
  UniformGroup,
} from "pixi.js";
import { DAY_MS, daylightAt, sunAt } from "./daylight";
import type {
  ShadowImage,
  ShadowRequest,
  ShadowResult,
  ShadowSurface,
} from "./shadow-field";

export type SurfaceGeometry = {
  ground?: boolean;
  cast?: boolean;
  lift?: number;
  cap?: number;
  baseline?: number[];
  /** Dynamic posed triangles in the sprite parent's coordinates. */
  triangles?: () => Float32Array;
  replaceChildren?: boolean;
  parentSpace?: boolean;
  dynamic?: boolean;
  revision?: () => string | number;
};
const geometry = new WeakMap<Container, SurfaceGeometry>();
const ignored = new WeakSet<Container>();
const emissive = new WeakSet<Container>();
export function copyLightingGeometry(source: Container, copy: Container) {
  const value = geometry.get(source);
  if (value) geometry.set(copy, value);
  if (ignored.has(source)) ignored.add(copy);
  if (emissive.has(source)) emissive.add(copy);
}
export const markWorldEmission = (node: Container) => {
  emissive.add(node);
  ignored.add(node);
};
export const setLightingGeometry = (
  node: Container,
  value: SurfaceGeometry,
) => {
  geometry.set(node, value);
};
export const excludeFromWorldLighting = (node: Container) => {
  ignored.add(node);
};
export type WorldLight = {
  x: number;
  y: number;
  radius: number;
  intensity: number;
};
export type LightingFrame = {
  nowMs: number;
  lighting?: boolean;
  shadows?: boolean;
  width: number;
  height: number;
  lights?: WorldLight[];
};
// Shadow cadence is independent of scene animation.
const DYNAMIC_SHADOW_INTERVAL_MS = 32;
const vertex = `in vec2 aPosition;out vec2 vTextureCoord;out vec2 vScreen;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;vScreen=p;gl_Position=vec4(p.x*2.0/uOutputTexture.x-1.0,p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z,0.,1.);vTextureCoord=aPosition*uOutputFrame.zw*uInputSize.zw;}`;
const fragment = `in vec2 vTextureCoord;in vec2 vScreen;out vec4 finalColor;
uniform sampler2D uGroundShade;uniform sampler2D uDynamicGroundShade;
uniform sampler2D uTexture;uniform sampler2D uReceiver;uniform sampler2D uDepth;uniform sampler2D uSecond;
uniform sampler2D uDynamicReceiver;uniform sampler2D uDynamicDepth;uniform sampler2D uDynamicSecond;uniform vec4 uDynamicBounds;uniform vec4 uDynamicSun;
uniform vec4 uAmbient;uniform vec4 uInverseA;uniform vec2 uInverseT;uniform vec4 uBounds;uniform vec4 uLightBounds;uniform vec4 uSun;
uniform vec4 uLights[32];uniform float uLightCount;uniform vec2 uShadowSteps;
vec3 cell(vec4 c){vec4 b=floor(c*255.+.5);return vec3(b.r*16.+floor(b.g/16.),mod(b.g,16.)*256.+b.b,c.a);}
vec4 texAt(sampler2D tex,vec2 p,vec4 bounds){vec2 uv=(p-bounds.xy)/bounds.zw;if(any(lessThan(uv,vec2(0.)))||any(greaterThanEqual(uv,vec2(1.))))return vec4(0.);return texture(tex,uv);}
// Compare each packed sample before filtering: depth and owner IDs stay exact.
float contactAt(vec2 p){
 vec4 ground=texAt(uGroundShade,p,uBounds);
 vec4 dynamicGround=texAt(uDynamicGroundShade,p,uDynamicBounds);
 if(ground.g==0.&&dynamicGround.g==0.)
   return max(ground.r*uSun.z,dynamicGround.r*uDynamicSun.z);
 vec3 receiver=cell(texAt(uReceiver,p,uBounds));
 vec3 dynamicReceiver=cell(texAt(uDynamicReceiver,p,uDynamicBounds));
 if(dynamicReceiver.z>0.&&dynamicReceiver.x>=receiver.x)receiver=dynamicReceiver;
 float z=receiver.z>0.?receiver.x:0.;
 vec2 lightPoint=p+vec2(uSun.x,1.+uSun.y)*z;
 vec3 blocker=cell(texAt(uDepth,lightPoint,uLightBounds));
 if(blocker.y==receiver.y&&receiver.y>0.)blocker=cell(texAt(uSecond,lightPoint,uLightBounds));
 float shade=blocker.x>z+3.?blocker.z*uSun.z:0.;
 vec2 dynamicPoint=p+vec2(uDynamicSun.x,1.+uDynamicSun.y)*z;
 vec3 dynamicBlocker=cell(texAt(uDynamicDepth,dynamicPoint,uDynamicBounds));
 if(dynamicBlocker.y==receiver.y&&receiver.y>0.)dynamicBlocker=cell(texAt(uDynamicSecond,dynamicPoint,uDynamicBounds));
 if(dynamicBlocker.x>z+3.)shade=max(shade,dynamicBlocker.z*uDynamicSun.z);
 return shade;
}
void main(){
 vec4 color=texture(uTexture,vTextureCoord);
 vec2 p=vec2(dot(uInverseA.xy,vScreen),dot(uInverseA.zw,vScreen))+uInverseT;
 float shade=0.;
 if(uSun.z>0.||uDynamicSun.z>0.){
 vec4 ground=texAt(uGroundShade,p,uBounds);
 vec4 dynamicGround=texAt(uDynamicGroundShade,p,uDynamicBounds);
 float groundShadow=max(ground.r*uSun.z,dynamicGround.r*uDynamicSun.z);
 float contact=max(ground.g,dynamicGround.g);
 shade=groundShadow;
 // Preserve the cheap ground path. At receiver boundaries interpolate four
 // complete comparisons, including receiver selection and self exclusion.
 if(contact>0.){
   vec2 stepSize=vec2(max(uShadowSteps.x,uShadowSteps.y));
   vec2 grid=(p-uBounds.xy)/stepSize-.5;
   vec2 base=(floor(grid)+.5)*stepSize+uBounds.xy;
   vec2 f=fract(grid);
   float filtered=mix(
     mix(contactAt(base),contactAt(base+vec2(stepSize.x,0.)),f.x),
     mix(contactAt(base+vec2(0.,stepSize.y)),contactAt(base+stepSize),f.x),f.y);
   // The linear receiver mask also makes the fast/contact transition smooth.
   shade=mix(groundShadow,filtered,contact);
 }
 // Contact coverage shares the existing filtered texture reads and sun fade.
 // Max avoids double-darkening where directional and contact shadows overlap.
 shade=max(shade,max(ground.b*uSun.z,dynamicGround.b*uDynamicSun.z));
 }
 vec3 illumination=uAmbient.rgb;
 for(int i=0;i<32;i++) {if(float(i)>=uLightCount)break;vec4 light=uLights[i];vec2 d=(p-light.xy)/vec2(1.,.55);float falloff=max(0.,1.-length(d)/max(1.,light.z));illumination+=vec3(1.,.48,.17)*falloff*falloff*light.w*uAmbient.a;}
 vec3 lit=color.rgb*min(vec3(1.3),illumination);
 finalColor=vec4(mix(lit,lit*vec3(.18,.23,.34),min(.65,shade*.4)),color.a);
}`;
function mapTexture(
  data = new Uint8Array(4),
  width = 1,
  height = 1,
  smooth = false,
) {
  const source = new BufferImageSource({
    resource: data,
    width,
    height,
    format: "rgba8unorm",
    alphaMode: "no-premultiply-alpha",
    scaleMode: smooth ? "linear" : "nearest",
    autoGenerateMipmaps: false,
  });
  return new Texture({ source });
}
/** One GPU pass owns ambient for the complete world. No per-object tint queues. */
export function createWorldLighting(
  root: Container,
  options: {
    ground?: Container[];
    emissions?: Container[];
    exclude?: Container[];
  } = {},
) {
  const markGround = (node: Container) => {
    setLightingGeometry(node, {
      ...geometry.get(node),
      ground: true,
      cast: false,
    });
    for (const child of node.children) markGround(child);
  };
  for (const node of options.ground ?? []) markGround(node);
  for (const node of options.exclude ?? []) excludeFromWorldLighting(node);
  const emissions = new Set(options.emissions ?? []);
  for (const node of emissions) {
    excludeFromWorldLighting(node);
    emissive.add(node);
  }
  const emissionLayer = new RenderLayer();
  emissionLayer.label = "world-emissions";
  emissionLayer.zIndex = root.zIndex + 0.01;
  const receiver = mapTexture(),
    depth = mapTexture(),
    second = mapTexture();
  const groundShade = mapTexture(undefined, 1, 1, true),
    dynamicGroundShade = mapTexture(undefined, 1, 1, true);
  const dynamicReceiver = mapTexture(),
    dynamicDepth = mapTexture(),
    dynamicSecond = mapTexture();
  const uniforms = new UniformGroup({
    uAmbient: { value: new Float32Array([1, 1, 1, 0]), type: "vec4<f32>" },
    uInverseA: { value: new Float32Array([1, 0, 0, 1]), type: "vec4<f32>" },
    uInverseT: { value: new Float32Array(2), type: "vec2<f32>" },
    uBounds: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
    uLightBounds: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
    uDynamicBounds: {
      value: new Float32Array([0, 0, 1, 1]),
      type: "vec4<f32>",
    },
    uDynamicSun: { value: new Float32Array(4), type: "vec4<f32>" },
    uSun: { value: new Float32Array(4), type: "vec4<f32>" },
    uLights: { value: new Float32Array(128), type: "vec4<f32>", size: 32 },
    uLightCount: { value: 0, type: "f32" },
    // World units per texel; GLSL ES 1.00 has no textureSize builtin.
    uShadowSteps: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
  });
  const filter = new Filter({
    glProgram: GlProgram.from({
      name: "shared-world-lighting",
      vertex,
      fragment,
    }),
    resources: {
      lightingUniforms: uniforms,
      uGroundShade: groundShade.source,
      uDynamicGroundShade: dynamicGroundShade.source,
      uReceiver: receiver.source,
      uDepth: depth.source,
      uSecond: second.source,
      uDynamicReceiver: dynamicReceiver.source,
      uDynamicDepth: dynamicDepth.source,
      uDynamicSecond: dynamicSecond.source,
    },
    resolution: 1,
    padding: 0,
  });
  root.filters = [...(root.filters ?? []), filter];
  const area = new Rectangle();
  root.filterArea = area;
  let disposed = false,
    worker: Worker | undefined,
    busy = false,
    requestId = 0,
    scene = 0,
    signature = "",
    lastKey = "",
    lastCommit = 0;
  let lastFrame: LightingFrame | undefined,
    current = daylightAt(0),
    lastError = "";
  let committedStrength = 0,
    submittedPhase = 0,
    shadowPhase: number | null = null;
  let dynamicWorker: Worker | undefined,
    dynamicBusy = false,
    dynamicStrength = 0,
    dynamicFrame = -1,
    dynamicCommits = 0,
    dynamicBuildMs = 0,
    dynamicKey = "";
  const sourceVersions = new WeakMap<object, number>();
  // Retain one alpha plane per source revision; workers receive transferable copies.
  const alphaPlanes = new WeakMap<
    object,
    { revision: number; image: ShadowImage }
  >();
  const sourceListeners = new Map<Texture["source"], () => void>();
  const imageRevisionsDynamic = new Map<number, number>();
  const imageIds = new WeakMap<object, number>(),
    imageRevisions = new Map<number, number>();
  let nextImage = 1,
    nextOwner = 1;
  const freeOwners: number[] = [];
  const owners = new WeakMap<Container, number>();
  let sentImages = new Set<number>(),
    dynamicSentImages = new Set<number>();
  const stats = {
    collectionPasses: 0,
    visitedNodes: 0,
    imageReads: 0,
    dynamicRequests: 0,
    requests: 0,
    commits: 0,
    discarded: 0,
    surfaces: 0,
    samples: 0,
    buildMs: 0,
    revision: 0,
  };
  try {
    if (typeof Worker !== "undefined") {
      worker = new Worker(new URL("./shadow-worker.ts", import.meta.url), {
        type: "module",
      });
      dynamicWorker = new Worker(
        new URL("./shadow-worker.ts", import.meta.url),
        { type: "module" },
      );
    }
  } catch (error) {
    lastError = String(error);
  }
  const updateTexture = (
    texture: Texture,
    data: Uint8Array,
    b: { width: number; height: number },
  ) => {
    const source = texture.source as BufferImageSource;
    source.resource = data;
    source.resize(b.width, b.height);
    source.update();
  };
  if (worker) {
    worker.onmessage = ({
      data,
    }: {
      data: ShadowResult & { error?: string };
    }) => {
      busy = false;
      if (disposed) return;
      if (data.error) {
        lastError = data.error;
        lastKey = "";
        return;
      }
      // Transform, geometry and camera invalidations supersede in-flight work.
      if (data.scene !== scene) {
        stats.discarded++;
        lastKey = "";
        return;
      }
      updateTexture(groundShade, data.groundShade, data.bounds);
      updateTexture(receiver, data.receiver, data.bounds);
      updateTexture(depth, data.depth, data.lightBounds);
      updateTexture(second, data.second, data.lightBounds);
      const region = (b: ShadowResult["bounds"]) =>
        new Float32Array([b.left, b.top, b.width * b.step, b.height * b.step]);
      uniforms.uniforms.uBounds = region(data.bounds);
      uniforms.uniforms.uShadowSteps[0] = data.bounds.step;
      uniforms.uniforms.uLightBounds = region(data.lightBounds);
      uniforms.uniforms.uSun = new Float32Array([
        data.sun.dx,
        data.sun.dy,
        lastFrame?.shadows !== false &&
        sunAt(lastFrame?.nowMs ?? 0).strength > 0
          ? data.sun.strength
          : 0,
        0,
      ]);
      committedStrength = data.sun.strength;
      shadowPhase = submittedPhase;
      lastCommit = data.id;
      Object.assign(stats, {
        commits: stats.commits + 1,
        samples: data.samples,
        buildMs: data.buildMs,
        revision: scene,
      });
    };
    worker.onerror = (e) => {
      busy = false;
      lastError = e.message;
    };
  }
  if (dynamicWorker) {
    dynamicWorker.onmessage = ({
      data,
    }: {
      data: ShadowResult & { error?: string };
    }) => {
      dynamicBusy = false;
      if (disposed) return;
      if (data.error) {
        lastError = data.error;
        dynamicKey = "";
        return;
      }
      updateTexture(dynamicGroundShade, data.groundShade, data.bounds);
      updateTexture(dynamicReceiver, data.receiver, data.bounds);
      updateTexture(dynamicDepth, data.depth, data.lightBounds);
      updateTexture(dynamicSecond, data.second, data.lightBounds);
      const b = data.bounds;
      uniforms.uniforms.uShadowSteps[1] = b.step;
      uniforms.uniforms.uDynamicBounds = new Float32Array([
        b.left,
        b.top,
        b.width * b.step,
        b.height * b.step,
      ]);
      dynamicStrength = data.sun.strength;
      uniforms.uniforms.uDynamicSun = new Float32Array([
        data.sun.dx,
        data.sun.dy,
        lastFrame?.shadows !== false &&
        sunAt(lastFrame?.nowMs ?? 0).strength > 0
          ? dynamicStrength
          : 0,
        0,
      ]);
      dynamicCommits++;
      dynamicBuildMs = data.buildMs;
    };
    dynamicWorker.onerror = (e) => {
      dynamicBusy = false;
      lastError = e.message;
      dynamicKey = "";
    };
  }
  const surfaceKeys = new WeakMap<
    Container,
    { values: unknown[]; key: string }
  >();
  const triangleSources = new WeakMap<
    NonNullable<SurfaceGeometry["triangles"]>,
    number
  >();
  let nextTriangleSource = 1;
  const triangleSourceId = (source: SurfaceGeometry["triangles"]) => {
    if (!source) return 0;
    let id = triangleSources.get(source);
    if (!id) {
      id = nextTriangleSource++;
      triangleSources.set(source, id);
    }
    return id;
  };
  const surfaceKey = (node: Container, values: unknown[]) => {
    const previous = surfaceKeys.get(node);
    if (
      previous &&
      previous.values.length === values.length &&
      values.every((v, i) => Object.is(v, previous.values[i]))
    )
      return previous.key;
    const key = JSON.stringify(values);
    surfaceKeys.set(node, { values, key });
    return key;
  };
  const projectedGeometry = new WeakMap<
    Container,
    {
      source: NonNullable<SurfaceGeometry["triangles"]>;
      revision: string | number;
      matrix: number[];
      triangles: Float32Array;
    }
  >();
  const projectTriangles = (
    node: Container,
    source: NonNullable<SurfaceGeometry["triangles"]>,
    revision: string | number | undefined,
    matrix: Matrix,
  ) => {
    const values = [
      matrix.a,
      matrix.b,
      matrix.c,
      matrix.d,
      matrix.tx,
      matrix.ty,
    ];
    const cached = projectedGeometry.get(node);
    if (
      revision !== undefined &&
      cached &&
      cached.source === source &&
      cached.revision === revision &&
      values.every((v, i) => v === cached.matrix[i])
    )
      return cached.triangles.slice();
    const local = source();
    const triangles = local.slice();
    const heightScale = Math.hypot(matrix.c, matrix.d);
    for (let i = 0; i < local.length; i += 3) {
      triangles[i] = matrix.a * local[i] + matrix.c * local[i + 1] + matrix.tx;
      triangles[i + 1] =
        matrix.b * local[i] + matrix.d * local[i + 1] + matrix.ty;
      triangles[i + 2] = local[i + 2] * heightScale;
    }
    // An unversioned callback may animate in place, so it must be evaluated again.
    if (revision !== undefined)
      projectedGeometry.set(node, {
        source,
        revision,
        matrix: values,
        triangles: triangles.slice(),
      });
    return triangles;
  };
  // Scan draw order once, then capture only the batches actually sent to workers.
  // Deferred captures retain this frame's matrices; no second scene walk is needed.
  const collect = (bounds: ShadowRequest["bounds"]) => {
    const batch = () => {
      const surfaces: ShadowSurface[] = [];
      const images: ShadowImage[] = [];
      const keys: string[] = [];
      const captures: (() => void)[] = [];
      const failed = new Set<ShadowSurface>();
      return { surfaces, images, keys, captures, failed };
    };
    stats.collectionPasses++;
    const batches = { static: batch(), dynamic: batch() };
    const rootInverse = root.getGlobalTransform().invert();
    const walk = (
      node: Container,
      inherited: SurfaceGeometry = {},
      alpha = 1,
      layer?: RenderLayer,
    ) => {
      stats.visitedNodes++;
      if (node.parentRenderLayer && node.parentRenderLayer !== layer) return;
      if (
        node.destroyed ||
        !node.visible ||
        !node.renderable ||
        node.alpha <= 0
      )
        return;
      if (emissive.has(node) && !emissions.has(node)) {
        emissions.add(node);
        emissionLayer.attach(node);
      }
      if (ignored.has(node)) return;
      const config = { ...inherited, ...geometry.get(node) },
        opacity = alpha * node.alpha;
      const kind = config.dynamic ? "dynamic" : "static";
      const { surfaces, images, keys, captures } = batches[kind];
      const sent = kind === "dynamic" ? dynamicSentImages : sentImages;
      const versions =
        kind === "dynamic" ? imageRevisionsDynamic : imageRevisions;
      if (config.triangles && config.replaceChildren) {
        let owner = owners.get(node);
        if (!owner) {
          owner = freeOwners.pop() ?? nextOwner++;
          owners.set(node, owner);
          const assigned = owner;
          node.once("destroyed", () => {
            owners.delete(node);
            freeOwners.push(assigned);
          });
        }
        const m = new Matrix()
          .copyFrom(rootInverse)
          .append(
            (config.parentSpace
              ? (node.parent ?? root)
              : node
            ).getGlobalTransform(),
          );
        const geometryRevision = config.revision?.();
        keys.push(
          surfaceKey(node, [
            owner,
            m.a,
            m.b,
            m.c,
            m.d,
            m.tx,
            m.ty,
            geometryRevision,
            opacity,
            config.cast !== false,
            surfaces.length,
            triangleSourceId(config.triangles),
          ]),
        );
        const surface: ShadowSurface = {
          owner,
          image: 0,
          frame: [0, 0, 1, 1],
          matrix: [1, 0, 0, 1, 0, 0],
          anchor: [0, 0],
          lift: 0,
          ground: false,
          cast: config.cast !== false,
          alpha: opacity,
          order: surfaces.length,
          dynamic: config.dynamic,
        };
        surfaces.push(surface);

        const triangleSource = config.triangles;
        captures.push(() => {
          const triangles = projectTriangles(
            node,
            triangleSource,
            geometryRevision,
            m,
          );
          surface.triangles = triangles;
          // Unversioned posed geometry must still invalidate dynamic shadows.
          if (kind === "dynamic") keys.push(triangles.join(","));
        });
        return;
      }
      if (
        node instanceof Sprite &&
        !(node instanceof TilingSprite) &&
        node.texture !== Texture.EMPTY &&
        node.texture !== Texture.WHITE
      ) {
        const tex = node.texture,
          source = tex.source,
          resource = source.resource as CanvasImageSource;
        const matrix = new Matrix()
          .copyFrom(rootInverse)
          .append(node.getGlobalTransform());
        const fw = tex.orig.width,
          fh = tex.orig.height;
        const left =
            matrix.tx - Math.abs(matrix.a) * fw - Math.abs(matrix.c) * fh,
          right = matrix.tx + Math.abs(matrix.a) * fw + Math.abs(matrix.c) * fh;
        const top =
            matrix.ty - Math.abs(matrix.b) * fw - Math.abs(matrix.d) * fh,
          bottom =
            matrix.ty + Math.abs(matrix.b) * fw + Math.abs(matrix.d) * fh;
        if (
          right >= bounds.left &&
          left <= bounds.left + bounds.width * bounds.step &&
          bottom >= bounds.top &&
          top <= bounds.top + bounds.height * bounds.step
        ) {
          let owner = owners.get(node);
          if (!owner) {
            owner = freeOwners.pop() ?? nextOwner++;
            owners.set(node, owner);
            const assigned = owner;
            node.once("destroyed", () => {
              owners.delete(node);
              freeOwners.push(assigned);
            });
          }
          if (owner > 4095) {
            lastError = "Shadow owner limit exceeded";
            return;
          }
          let id = imageIds.get(source);
          if (!id) {
            id = nextImage++;
            imageIds.set(source, id);
            const update = () =>
              sourceVersions.set(source, (sourceVersions.get(source) ?? 0) + 1);
            source.on("update", update);
            source.on("resize", update);
            sourceListeners.set(source, update);
          }
          const revision = sourceVersions.get(source) ?? 0;
          const f = tex.frame;
          const surface: ShadowSurface = {
            owner,
            image: id,
            frame: [f.x, f.y, f.width, f.height],
            matrix: [
              matrix.a,
              matrix.b,
              matrix.c,
              matrix.d,
              matrix.tx,
              matrix.ty,
            ],
            anchor: [node.anchor.x, node.anchor.y],
            lift: config.lift ?? 0,
            ground: config.ground ?? false,
            cast: config.cast !== false,
            alpha: opacity,
            order: surfaces.length,
            cap: config.cap,
            baseline: config.baseline,
          };
          surfaces.push(surface);
          const geometryRevision = config.revision?.();
          keys.push(
            surfaceKey(node, [
              owner,
              id,
              revision,
              ...surface.frame,
              ...surface.matrix,
              ...surface.anchor,
              surface.lift,
              surface.ground,
              surface.cast,
              surface.cap,
              ...(surface.baseline ?? []),
              opacity,
              surface.order,
              geometryRevision,
              triangleSourceId(config.triangles),
            ]),
          );
          const imageId = id;
          captures.push(() => {
            if (!sent.has(imageId) || versions.get(imageId) !== revision) {
              try {
                let cached = alphaPlanes.get(source);
                if (!cached || cached.revision !== revision) {
                  const canvas = document.createElement("canvas");
                  try {
                    canvas.width = source.width;
                    canvas.height = source.height;
                    const ctx = canvas.getContext("2d", {
                      willReadFrequently: true,
                    })!;
                    ctx.drawImage(resource, 0, 0, canvas.width, canvas.height);
                    const pixels = ctx.getImageData(
                      0,
                      0,
                      canvas.width,
                      canvas.height,
                    ).data;
                    const alpha = new Uint8Array(canvas.width * canvas.height);
                    for (let i = 0; i < alpha.length; i++)
                      alpha[i] = pixels[i * 4 + 3];
                    cached = {
                      revision,
                      image: {
                        id: imageId,
                        width: canvas.width,
                        height: canvas.height,
                        alpha,
                      },
                    };
                    alphaPlanes.set(source, cached);
                    stats.imageReads++;
                  } finally {
                    canvas.width = canvas.height = 1;
                  }
                }
                images.push({
                  ...cached.image,
                  alpha: cached.image.alpha.slice(),
                });
                sent.add(imageId);
                versions.set(imageId, revision);
              } catch (error) {
                lastError = `Shadow source read failed: ${String(error)}`;
                batches[kind].failed.add(surface);
                return;
              }
            }
            let triangles: Float32Array | undefined;
            if (config.triangles) {
              const parent = new Matrix()
                .copyFrom(rootInverse)
                .append((node.parent ?? root).getGlobalTransform());
              triangles = projectTriangles(
                node,
                config.triangles,
                geometryRevision,
                parent,
              );
            }

            surface.triangles = triangles;
            if (kind === "dynamic" && triangles) keys.push(triangles.join(","));
          });
        }
      }
      // RenderLayers change draw order but not physical transforms. Each sprite is visited once.
      if (node.sortableChildren) node.sortChildren();
      for (const child of node.children) walk(child, config, opacity);
      if (node instanceof RenderLayer) {
        node.sortRenderLayerChildren();
        for (const child of node.renderLayerChildren) {
          const ancestors: Container[] = [];
          for (let p = child.parent; p && p !== root; p = p.parent)
            ancestors.unshift(p);
          if (
            ancestors.some((p) => !p.visible || p.alpha <= 0 || ignored.has(p))
          )
            continue;
          const inherited = ancestors.reduce(
            (g, p) => ({ ...g, ...geometry.get(p) }),
            {} as SurfaceGeometry,
          );
          walk(
            child,
            inherited,
            ancestors.reduce((a, p) => a * p.alpha, root.alpha),
            node,
          );
        }
      }
    };
    walk(root);
    const finish = (value: ReturnType<typeof batch>) => ({
      signature: () => value.keys.join("|"),
      capture: () => {
        for (const capture of value.captures) capture();
        value.captures.length = 0;
        return {
          surfaces: value.failed.size
            ? value.surfaces.filter((s) => !value.failed.has(s))
            : value.surfaces,
          images: value.images,
          failed: value.failed.size > 0,
        };
      },
    });
    return { static: finish(batches.static), dynamic: finish(batches.dynamic) };
  };
  const controller = {
    filter,
    tick(frame: LightingFrame) {
      if (disposed || root.destroyed) return;
      lastFrame = frame;
      current = daylightAt(frame.nowMs);
      const sun = sunAt(frame.nowMs),
        lit = frame.lighting !== false;
      uniforms.uniforms.uAmbient.set([
        ...(lit ? current.ambient : [1, 1, 1]),
        lit ? current.lightScale : 0,
      ]);
      const inverse = root.getGlobalTransform().invert();
      uniforms.uniforms.uInverseA.set([
        inverse.a,
        inverse.c,
        inverse.b,
        inverse.d,
      ]);
      uniforms.uniforms.uInverseT.set([inverse.tx, inverse.ty]);
      const viewport = [
        [0, 0],
        [frame.width, 0],
        [frame.width, frame.height],
        [0, frame.height],
      ].map(([x, y]) => inverse.apply({ x, y }));
      // Pixi filterArea is LOCAL to the filtered container, including nested camera transforms.
      area.x = Math.min(...viewport.map((p) => p.x));
      area.y = Math.min(...viewport.map((p) => p.y));
      area.width = Math.max(...viewport.map((p) => p.x)) - area.x;
      area.height = Math.max(...viewport.map((p) => p.y)) - area.y;
      if (root.parent && !emissionLayer.parent) {
        root.parent.addChild(emissionLayer);
        for (const node of emissions)
          if (!node.destroyed) emissionLayer.attach(node);
      }
      const discoverEmissions = (node: Container) => {
        if (emissive.has(node) && !emissions.has(node)) {
          emissions.add(node);
          emissionLayer.attach(node);
        }
        for (const child of node.children) discoverEmissions(child);
      };
      discoverEmissions(root);
      const lights = frame.lights ?? [];
      const points = uniforms.uniforms.uLights;
      for (let i = 0; i < Math.min(32, lights.length); i++) {
        const l = lights[i];
        points.set([l.x, l.y, l.radius, l.intensity], i * 4);
      }
      uniforms.uniforms.uLightCount = Math.min(32, lights.length);
      uniforms.uniforms.uSun[2] =
        frame.shadows === false || sun.strength === 0 ? 0 : committedStrength;
      uniforms.uniforms.uDynamicSun[2] =
        frame.shadows === false || sun.strength === 0 ? 0 : dynamicStrength;
      if (!worker || frame.shadows === false || sun.strength === 0) return;
      const corners = viewport;
      const pad = 384,
        left =
          Math.floor((Math.min(...corners.map((p) => p.x)) - pad) / 128) * 128,
        top =
          Math.floor((Math.min(...corners.map((p) => p.y)) - pad) / 128) * 128;
      const w =
          Math.ceil((Math.max(...corners.map((p) => p.x)) + pad) / 128) * 128 -
          left,
        h =
          Math.ceil((Math.max(...corners.map((p) => p.y)) + pad) / 128) * 128 -
          top;
      const step = Math.max(2, Math.ceil(Math.max(w, h) / 1024));
      const bounds = {
        left,
        top,
        step,
        width: Math.ceil(w / step),
        height: Math.ceil(h / step),
      };
      const shadowPhaseKey = Math.round(current.phase * 2400);
      const shadowSun = sunAt((shadowPhaseKey / 2400) * DAY_MS);
      const collected = collect(bounds);
      if (
        dynamicWorker &&
        !dynamicBusy &&
        Math.floor(performance.now() / DYNAMIC_SHADOW_INTERVAL_MS) !==
          dynamicFrame
      ) {
        const moving = collected.dynamic.capture();
        const nextDynamicKey = `${JSON.stringify(bounds)}:${collected.dynamic.signature()}:${shadowPhaseKey}`;
        // A still pose at the same sun/camera produces exactly the same field.
        if (nextDynamicKey !== dynamicKey) {
          let l = Infinity,
            t = Infinity,
            r = -Infinity,
            b = -Infinity;
          const include = (x: number, y: number, z: number) => {
            l = Math.min(l, x, x + sun.dx * z);
            r = Math.max(r, x, x + sun.dx * z);
            t = Math.min(t, y, y + (1 + sun.dy) * z);
            b = Math.max(b, y, y + (1 + sun.dy) * z);
          };
          for (const surface of moving.surfaces) {
            if (surface.triangles) {
              const xyz = surface.triangles;
              for (let i = 0; i < xyz.length; i += 3)
                include(xyz[i], xyz[i + 1], xyz[i + 2]);
            } else {
              const [a, b, c, d, x, y] = surface.matrix,
                [, , w, h] = surface.frame;
              include(
                x - Math.abs(a) * w - Math.abs(c) * h,
                y - Math.abs(b) * w - Math.abs(d) * h,
                0,
              );
              include(
                x + Math.abs(a) * w + Math.abs(c) * h,
                y + Math.abs(b) * w + Math.abs(d) * h,
                h * Math.hypot(c, d),
              );
            }
          }
          // Empty dynamic fields also commit, removing the last actor/gate cleanly.
          if (!Number.isFinite(l)) {
            l = 0;
            t = 0;
            r = 1;
            b = 1;
          }
          l = Math.floor(l) - 8;
          t = Math.floor(t) - 8;
          r = Math.ceil(r) + 8;
          b = Math.ceil(b) + 8;
          const ds = Math.max(1, Math.ceil(Math.max(r - l, b - t) / 512));
          const db = {
            left: l,
            top: t,
            step: ds,
            width: Math.ceil((r - l) / ds),
            height: Math.ceil((b - t) / ds),
          };
          const request: ShadowRequest = {
            id: ++requestId,
            scene: 0,
            bounds: db,
            sun: shadowSun,
            surfaces: moving.surfaces,
            images: moving.images,
          };
          dynamicKey = moving.failed ? "" : nextDynamicKey;
          dynamicBusy = true;
          stats.dynamicRequests++;
          dynamicFrame = Math.floor(
            performance.now() / DYNAMIC_SHADOW_INTERVAL_MS,
          );
          dynamicWorker.postMessage(request, [
            ...request.images.map((i) => i.alpha.buffer),
            ...request.surfaces.flatMap((s) =>
              s.triangles ? [s.triangles.buffer] : [],
            ),
          ]);
        }
      }
      const viewKey = JSON.stringify(bounds),
        nextSignature = viewKey + collected.static.signature();
      const changed = nextSignature !== signature;
      const key = `${nextSignature}:${Math.round(current.phase * 2400)}`;
      if (changed) {
        signature = nextSignature;
        scene++;
      }
      if (busy || key === lastKey) return;
      const next = collected.static.capture();
      stats.surfaces = next.surfaces.length;
      const request: ShadowRequest = {
        id: ++requestId,
        scene,
        bounds,
        sun: shadowSun,
        surfaces: next.surfaces,
        images: next.images,
      };
      busy = true;
      submittedPhase = current.phase;
      lastKey = next.failed ? "" : key;
      stats.requests++;
      worker.postMessage(request, [
        ...request.images.map((i) => i.alpha.buffer),
        ...request.surfaces.flatMap((s) =>
          s.triangles ? [s.triangles.buffer] : [],
        ),
      ]);
    },
    diagnostics: () => ({
      ...stats,
      phase: current.phase,
      shadowPhase,
      ambient: [...current.ambient],
      lastCommit,
      busy,
      dynamicCommits,
      dynamicBusy,
      dynamicBuildMs,
      error: lastError,
    }),
    destroy() {
      if (disposed) return;
      disposed = true;
      worker?.terminate();
      dynamicWorker?.terminate();
      for (const [source, listener] of sourceListeners) {
        source.off("update", listener);
        source.off("resize", listener);
      }
      sourceListeners.clear();
      emissionLayer.detachAll();
      emissionLayer.removeFromParent();
      emissionLayer.destroy();
      if (!root.destroyed)
        root.filters = (root.filters ?? []).filter((f) => f !== filter);
      // Pixi owns group 0 and retains the last pooled filter input there.
      // Release it before renderer teardown destroys the input texture/sampler.
      // Do not destroy the group: other filters share it.
      const inputGroup = filter.groups[0];
      inputGroup?.setResource(Texture.EMPTY.source, 1);
      inputGroup?.setResource(Texture.EMPTY.source.style, 2);
      filter.destroy();
      for (const t of [
        groundShade,
        dynamicGroundShade,
        receiver,
        depth,
        second,
        dynamicReceiver,
        dynamicDepth,
        dynamicSecond,
      ])
        t.destroy(true);
      sentImages = new Set();
      dynamicSentImages = new Set();
    },
  };
  root.once("destroyed", () => controller.destroy());
  return controller;
}
export type WorldLighting = ReturnType<typeof createWorldLighting>;
