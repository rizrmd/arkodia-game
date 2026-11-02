/** Worker-safe depth field. Packed data uses straight alpha: never Canvas2D storage. */
export type FieldBounds = {
  left: number;
  top: number;
  step: number;
  width: number;
  height: number;
};
export type ShadowImage = {
  id: number;
  width: number;
  height: number;
  alpha: Uint8Array;
};
export type ShadowSurface = {
  owner: number;
  image: number;
  frame: [number, number, number, number];
  matrix: [number, number, number, number, number, number];
  anchor: [number, number];
  lift: number;
  ground: boolean;
  cast: boolean;
  alpha: number;
  order: number;
  cap?: number;
  baseline?: number[];
  dynamic?: boolean;
  /** Screen-world x/y and physical height, three vertices per triangle. */
  triangles?: Float32Array;
};
export type ShadowRequest = {
  id: number;
  scene: number;
  bounds: FieldBounds;
  sun: { dx: number; dy: number; strength: number };
  surfaces: ShadowSurface[];
  images: ShadowImage[];
};
export type ShadowResult = {
  id: number;
  scene: number;
  bounds: FieldBounds;
  lightBounds: FieldBounds;
  sun: ShadowRequest["sun"];
  receiver: Uint8Array;
  depth: Uint8Array;
  second: Uint8Array;
  /** R: softened sun coverage; G: receiver mask; B: soft contact coverage. */
  groundShade: Uint8Array;
  samples: number;
  buildMs: number;
};
export function encodeCell(
  out: Uint8Array,
  i: number,
  z: number,
  owner: number,
  alpha: number,
) {
  const h = Math.max(0, Math.min(4095, Math.round(z)));
  out[i] = h >> 4;
  out[i + 1] = ((h & 15) << 4) | (owner >> 8);
  out[i + 2] = owner & 255;
  out[i + 3] = Math.round(alpha * 255);
}
export function decodeCell(a: Uint8Array, i: number) {
  return {
    z: a[i] * 16 + (a[i + 1] >> 4),
    owner: (a[i + 1] & 15) * 256 + a[i + 2],
    alpha: a[i + 3] / 255,
  };
}
type V = { x: number; y: number; z: number };
/** Shared screen-world projection for viewport casters and the editor sundial. */
export function projectSunShadow(v: V, sun: ShadowRequest["sun"]): V {
  return { x: v.x + sun.dx * v.z, y: v.y + (1 + sun.dy) * v.z, z: v.z };
}

function raster(
  a: V,
  b: V,
  c: V,
  bounds: FieldBounds,
  write: (i: number, z: number) => void,
) {
  const { left, top, step, width, height } = bounds;
  const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - left) / step)),
    x1 = Math.min(
      width - 1,
      Math.ceil((Math.max(a.x, b.x, c.x) - left) / step),
    );
  const y0 = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - top) / step)),
    y1 = Math.min(
      height - 1,
      Math.ceil((Math.max(a.y, b.y, c.y) - top) / step),
    );
  const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(den) < 1e-9) return;
  const invDen = 1 / den;
  const ux = (b.y - c.y) * invDen,
    uy = (c.x - b.x) * invDen;
  const vx = (c.y - a.y) * invDen,
    vy = (a.x - c.x) * invDen;
  const px = left + (x0 + 0.5) * step - c.x;
  for (let y = y0; y <= y1; y++) {
    const py = top + (y + 0.5) * step - c.y;
    const u0 = ux * px + uy * py,
      v0 = vx * px + vy * py;
    for (let x = x0; x <= x1; x++) {
      // Affine barycentrics avoid two divisions for every rasterized cell.
      const offset = (x - x0) * step;
      const u = u0 + ux * offset,
        v = v0 + vx * offset,
        w = 1 - u - v;
      if (u >= -1e-5 && v >= -1e-5 && w >= -1e-5)
        write((y * width + x) * 4, a.z * u + b.z * v + c.z * w);
    }
  }
}
/** Blur coverage only, never packed depth/owner bytes. O(width * height), in worker. */
export function buildGroundShade(
  receiver: Uint8Array,
  depth: Uint8Array,
  width: number,
  height: number,
  groundOwners: ReadonlySet<number>,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const coverage = new Uint8Array(width * height);
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x,
        i = p * 4;
      if (receiver[i + 3]) {
        const z = receiver[i] * 16 + (receiver[i + 1] >> 4);
        const owner = (receiver[i + 1] & 15) * 256 + receiver[i + 2];
        // Bilinear G conservatively selects exact lookup at object boundaries.
        if (z > 0 || !groundOwners.has(owner)) out[i + 1] = 255;
      }
      if (depth[i + 3] && depth[i] * 16 + (depth[i + 1] >> 4) > 3) {
        coverage[p] = depth[i + 3];
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) return out;
  // Restrict convolution to occupied shadow bounds, especially for small actors.
  left = Math.max(0, left - 1);
  right = Math.min(width - 1, right + 1);
  const horizontal = new Uint16Array(width * height);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = y * width + x;
      horizontal[i] =
        (x > 0 ? coverage[i - 1] : 0) +
        2 * coverage[i] +
        (x + 1 < width ? coverage[i + 1] : 0);
    }
  }
  top = Math.max(0, top - 1);
  bottom = Math.min(height - 1, bottom + 1);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = y * width + x;
      out[i * 4] = Math.round(
        ((y > 0 ? horizontal[i - width] : 0) +
          2 * horizontal[i] +
          (y + 1 < height ? horizontal[i + width] : 0)) /
          16,
      );
    }
  }
  return out;
}
export function buildShadowField(
  request: ShadowRequest,
  images: Map<number, ShadowImage>,
): ShadowResult {
  const start = performance.now();
  for (const img of request.images) images.set(img.id, img);
  const { bounds, sun } = request;
  // Padding includes offscreen casters and their maximum projected height.
  const lightBounds = { ...bounds };
  const n = bounds.width * bounds.height;
  const receiver = new Uint8Array(n * 4),
    depth = new Uint8Array(n * 4),
    second = new Uint8Array(n * 4);
  const frontOrder = new Int32Array(n).fill(-2147483648);
  const contacts: {
    x: number;
    y: number;
    rx: number;
    ry: number;
    z: number;
    owner: number;
    alpha: number;
  }[] = [];
  let samples = 0;
  const triangle = (a: V, b: V, c: V, s: ShadowSurface, alpha: number) => {
    raster(a, b, c, bounds, (i, z) => {
      if (
        s.order > frontOrder[i / 4] ||
        (s.order === frontOrder[i / 4] &&
          z >= receiver[i] * 16 + (receiver[i + 1] >> 4))
      ) {
        frontOrder[i / 4] = s.order;
        encodeCell(receiver, i, z, s.owner, alpha);
      }
    });
    if (!s.cast || !sun.strength) return;
    const project = (v: V) => projectSunShadow(v, sun);
    raster(project(a), project(b), project(c), lightBounds, (i, z) => {
      const oldZ = depth[i] * 16 + (depth[i + 1] >> 4),
        oldOwner = (depth[i + 1] & 15) * 256 + depth[i + 2];
      if (z > oldZ || !depth[i + 3]) {
        if (oldOwner !== s.owner) {
          second[i] = depth[i];
          second[i + 1] = depth[i + 1];
          second[i + 2] = depth[i + 2];
          second[i + 3] = depth[i + 3];
        }
        encodeCell(depth, i, z, s.owner, alpha);
      } else if (oldOwner !== s.owner) {
        const otherZ = second[i] * 16 + (second[i + 1] >> 4);
        if (z > otherZ || !second[i + 3])
          encodeCell(second, i, z, s.owner, alpha);
      }
    });
    samples++;
  };
  for (const s of request.surfaces) {
    if (s.owner > 4095) throw Error("Shadow owner limit exceeded");
    if (s.triangles) {
      for (let i = 0; i < s.triangles.length; i += 9) {
        const v = (j: number): V => ({
          x: s.triangles![j],
          y: s.triangles![j + 1],
          z: s.triangles![j + 2],
        });
        triangle(v(i), v(i + 3), v(i + 6), s, s.alpha);
      }
      continue;
    }
    const image = images.get(s.image);
    if (!image) continue;
    const [fx, fy, fw, fh] = s.frame,
      [a, b, c, d, tx, ty] = s.matrix;
    const vertical = Math.hypot(c, d),
      horizontal = Math.hypot(a, b);
    const cols = Math.max(
        1,
        Math.ceil((fw * horizontal) / Math.max(2, bounds.step)),
      ),
      rows = Math.max(1, Math.ceil((fh * vertical) / Math.max(2, bounds.step)));
    const baseline =
      s.baseline ??
      Array.from({ length: cols + 1 }, (_, col) => {
        const x = Math.min(
          image.width - 1,
          Math.max(0, Math.floor(fx + (fw * col) / cols)),
        );
        for (
          let y = Math.min(image.height - 1, Math.ceil(fy + fh) - 1);
          y >= fy;
          y--
        )
          if (image.alpha[y * image.width + x] > 160) return (y + 1 - fy) / fh;
        return s.anchor[1];
      });
    // Keep alpha-ground outliers (branches, falling snow) from raising the footprint.
    const low = Math.max(...baseline),
      foot = baseline.indexOf(low),
      ground =
        s.baseline ??
        baseline.map((v, i) =>
          Math.max(
            v,
            low -
              (((Math.abs(i - foot) / Math.max(1, baseline.length - 1)) * fw) /
                fh) *
                0.5 -
              0.02,
          ),
        );
    const point = (u: number, v: number): V => {
      const lx = (u - s.anchor[0]) * fw,
        ly = (v - s.anchor[1]) * fh;
      const k = Math.min(
          ground.length - 2,
          Math.floor(u * (ground.length - 1)),
        ),
        t = u * (ground.length - 1) - k;
      const g = ground[k] * (1 - t) + ground[k + 1] * t;
      const z =
        s.lift +
        (s.ground
          ? 0
          : Math.min(s.cap ?? 4095, Math.max(0, (g - v) * fh * vertical)));
      return { x: a * lx + c * ly + tx, y: b * lx + d * ly + ty, z };
    };
    // Reuse the alpha walk to find the actual base, rather than canopy width.
    let footLeft = Infinity,
      footRight = -Infinity,
      footY = -Infinity,
      footAlpha = 0;
    const contactBand = Math.min(fh * vertical * 0.1, 16);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const u = (x + 0.5) / cols,
          v = (y + 0.5) / rows;
        const ix = Math.max(
            0,
            Math.min(image.width - 1, Math.floor(fx + u * fw)),
          ),
          iy = Math.max(0, Math.min(image.height - 1, Math.floor(fy + v * fh)));
        const alpha = (image.alpha[iy * image.width + ix] / 255) * s.alpha;
        if (alpha < 0.08) continue;
        const v0 = point(x / cols, y / rows),
          v1 = point((x + 1) / cols, y / rows),
          v2 = point((x + 1) / cols, (y + 1) / rows),
          v3 = point(x / cols, (y + 1) / rows);
        if (
          !s.ground &&
          s.cast &&
          sun.strength &&
          (s.cap ?? 4095) > 3 &&
          v >= low - 0.1 &&
          Math.min(v2.z, v3.z) <= s.lift + contactBand
        ) {
          footLeft = Math.min(footLeft, v2.x, v3.x);
          footRight = Math.max(footRight, v2.x, v3.x);
          footY = Math.max(footY, v2.y, v3.y);
          footAlpha = Math.max(footAlpha, alpha);
        }
        triangle(v0, v1, v2, s, alpha);
        triangle(v0, v2, v3, s, alpha);
      }
    if (footRight > footLeft) {
      const rx = Math.max(bounds.step, (footRight - footLeft) * 0.6);
      const ry = Math.max(
        bounds.step,
        Math.min(rx * 0.35, fh * vertical * 0.06),
      );
      contacts.push({
        x: (footLeft + footRight) / 2,
        y: footY - ry * 0.35,
        rx,
        ry,
        z: s.lift,
        owner: s.owner,
        alpha: footAlpha * 0.55,
      });
    }
  }
  const groundOwners = new Set(
    request.surfaces
      .filter((s) => s.ground && !s.cast && s.lift === 0)
      .map((s) => s.owner),
  );
  const groundShade = request.surfaces.length
    ? buildGroundShade(
        receiver,
        depth,
        bounds.width,
        bounds.height,
        groundOwners,
      )
    : new Uint8Array(n * 4);
  // B is already linearly sampled by the existing pass. Never alter packed
  // depths/owners or add fake casters to work around the near-ground bias.
  for (const c of contacts) {
    // Lift can mean either elevated terrain or an airborne sprite. Require
    // support beside elevated feet before adding even same-owner contact.
    if (c.z > 3) {
      let supported = false;
      for (let tap = 0; tap < 8; tap++) {
        const angle = (tap * Math.PI) / 4;
        const x = Math.floor(
          (c.x + Math.cos(angle) * (c.rx + bounds.step) - bounds.left) /
            bounds.step,
        );
        const y = Math.floor(
          (c.y + Math.sin(angle) * (c.ry + bounds.step) - bounds.top) /
            bounds.step,
        );
        if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) continue;
        const i = (y * bounds.width + x) * 4;
        const owner = (receiver[i + 1] & 15) * 256 + receiver[i + 2];
        const z = receiver[i] * 16 + (receiver[i + 1] >> 4);
        if (receiver[i + 3] && owner !== c.owner && Math.abs(z - c.z) <= 3)
          supported = true;
      }
      if (!supported) continue;
    }
    const x0 = Math.max(
      0,
      Math.floor((c.x - c.rx - bounds.left) / bounds.step),
    );
    const x1 = Math.min(
      bounds.width - 1,
      Math.ceil((c.x + c.rx - bounds.left) / bounds.step),
    );
    const y0 = Math.max(0, Math.floor((c.y - c.ry - bounds.top) / bounds.step));
    const y1 = Math.min(
      bounds.height - 1,
      Math.ceil((c.y + c.ry - bounds.top) / bounds.step),
    );
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (bounds.left + (x + 0.5) * bounds.step - c.x) / c.rx;
        const dy = (bounds.top + (y + 0.5) * bounds.step - c.y) / c.ry;
        const falloff = 1 - dx * dx - dy * dy;
        if (falloff <= 0) continue;
        const i = (y * bounds.width + x) * 4;
        const z = receiver[i + 3]
          ? receiver[i] * 16 + (receiver[i + 1] >> 4)
          : 0;
        const owner = (receiver[i + 1] & 15) * 256 + receiver[i + 2];
        // Elevated props need a receiver at their base. Do not shade unrelated
        // raised surfaces; allow a short band on the caster's own visible roots.
        if (Math.abs(z - c.z) > (owner === c.owner ? c.ry * 2 + 3 : 3))
          continue;
        groundShade[i + 2] = Math.max(
          groundShade[i + 2],
          Math.round(255 * c.alpha * falloff * falloff),
        );
      }
  }
  return {
    id: request.id,
    scene: request.scene,
    bounds,
    lightBounds,
    sun,
    receiver,
    depth,
    second,
    groundShade,
    samples,
    buildMs: performance.now() - start,
  };
}
