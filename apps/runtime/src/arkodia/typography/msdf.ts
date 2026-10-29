import {
  Assets,
  BitmapText,
  Matrix,
  Shader,
  UniformGroup,
  colorBitGl,
  compileHighShaderGlProgram,
  generateTextureBatchBitGl,
  getBatchSamplersUniformGroup,
  roundPixelsBitGl,
  type Renderer,
} from "pixi.js";
import { FONTS, type FontKey } from "./tokens";

// MSDF text effects in the glyph shader: vertical gradient fill, outline, outer glow and a soft-shadow pass, all from the
// distance field, so they stay sharp at any scale. Pixi's stock MSDF shader only outputs coverage.
// Per-text settings live in this map; the hook below copies them into each text's shader before it draws.
export interface Fx {
  mode: "fill" | "shadow";
  fill: [number, number, number]; // RGB colours: top, middle, bottom (equal for a solid fill)
  alpha: number;
  outline: [number, number, number, number]; // RGB + alpha, width in screen px
  outlineWidth: number;
  glow: [number, number, number, number];
  glowWidth: number;
  softness: number; // shadow pass: blur radius in screen px
  baseline: number; // local y of the first baseline
  lineHeight: number; // local line advance
  cap: number; // local cap height (gradient runs cap top → baseline)
  ascent: number; // local distance above a baseline that still belongs to its line
}
export const fxOf = new WeakMap<BitmapText, Fx>();

const vertex = `
 uniform mat3 uTransformMatrix;uniform vec4 uColor;uniform float uRound;
 out vec2 vLocal;`;
const fragment = `
 in vec2 vLocal;
 uniform float uDistance;uniform float uMode;uniform vec3 uFill0;uniform vec3 uFill1;uniform vec3 uFill2;uniform float uAlpha;
 uniform vec4 uOutline;uniform float uOutlineW;uniform vec4 uGlow;uniform float uGlowW;uniform float uSoft;
 uniform vec4 uLines;`;
const fragmentMain = `
 float med=max(min(outColor.r,outColor.g),min(max(outColor.r,outColor.g),outColor.b));
 float d=uDistance*(med-.5);             // signed distance to the glyph edge in device px, positive inside
 vec4 c;
 if(uMode>.5){
  float a=smoothstep(-uSoft,uSoft*.4+.5,d+uOutlineW);
  c=vec4(uFill0,1.)*a*uAlpha;
 }else{
  float r=vLocal.y-uLines.x,k=floor((r+uLines.w)/uLines.y),t=clamp((r-k*uLines.y+uLines.z)/uLines.z,0.,1.);
  vec3 fill=t<.5?mix(uFill0,uFill1,t*2.):mix(uFill1,uFill2,t*2.-1.);
  float fa=clamp(d+.5,0.,1.);
  fa=pow(fa,mix(1.,1./1.6,dot(fill,vec3(.299,.587,.114))));  // keep light-on-dark stems from thinning
  float oa=uOutlineW>0.?clamp(d+uOutlineW+.5,0.,1.)*uOutline.a:0.;
  c=vec4(fill,1.)*fa+vec4(uOutline.rgb,1.)*oa*(1.-fa);
  if(uGlowW>0.){float g=clamp(1.-(-d-uOutlineW)/uGlowW,0.,1.);c+=vec4(uGlow.rgb,1.)*g*g*uGlow.a*(1.-c.a);}
  c*=uAlpha;
 }
 outColor=c;`;
const fxBit = {
  name: "msdf-fx",
  vertex: {
    header: vertex,
    main: "vColor *= uColor; modelMatrix *= uTransformMatrix; vLocal = aPosition;",
    end: "if(uRound == 1.) { gl_Position.xy = roundPixels(gl_Position.xy, uResolution); }",
  },
  fragment: { header: fragment, main: fragmentMain },
};

let program: ReturnType<typeof compileHighShaderGlProgram> | undefined;
class MsdfFxShader extends Shader {
  constructor(maxTextures: number) {
    program ??= compileHighShaderGlProgram({
      name: "msdf-fx",
      bits: [
        colorBitGl,
        generateTextureBatchBitGl(maxTextures),
        fxBit,
        roundPixelsBitGl,
      ],
    });
    super({
      glProgram: program,
      resources: {
        batchSamplers: getBatchSamplersUniformGroup(maxTextures),
        localUniforms: new UniformGroup({
          uColor: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
          uTransformMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
          uDistance: { value: 4, type: "f32" },
          uRound: { value: 0, type: "f32" },
          uMode: { value: 0, type: "f32" },
          uFill0: { value: new Float32Array(3), type: "vec3<f32>" },
          uFill1: { value: new Float32Array(3), type: "vec3<f32>" },
          uFill2: { value: new Float32Array(3), type: "vec3<f32>" },
          uAlpha: { value: 1, type: "f32" },
          uOutline: { value: new Float32Array(4), type: "vec4<f32>" },
          uOutlineW: { value: 0, type: "f32" },
          uGlow: { value: new Float32Array(4), type: "vec4<f32>" },
          uGlowW: { value: 0, type: "f32" },
          uSoft: { value: 1, type: "f32" },
          uLines: { value: new Float32Array([0, 1, 1, 1]), type: "vec4<f32>" },
        }),
      },
    });
  }
  // deviceScale: device px per design px, so effect widths follow the layout scale and devicePixelRatio.
  apply(fx: Fx, deviceScale: number) {
    const u = this.resources.localUniforms.uniforms,
      w = deviceScale;
    u.uMode = fx.mode === "shadow" ? 1 : 0;
    u.uAlpha = fx.alpha;
    u.uSoft = Math.max(0.5, fx.softness * w);
    u.uFill0 = rgb(fx.fill[0]);
    u.uFill1 = rgb(fx.fill[1]);
    u.uFill2 = rgb(fx.fill[2]);
    u.uOutline = new Float32Array([...rgb(fx.outline[0]), fx.outline[3]]);
    u.uOutlineW = fx.outlineWidth * w;
    u.uGlow = new Float32Array([...rgb(fx.glow[0]), fx.glow[3]]);
    u.uGlowW = fx.glowWidth * w;
    u.uLines = new Float32Array([
      fx.baseline,
      fx.lineHeight,
      fx.cap,
      fx.ascent,
    ]);
  }
}
const rgb = (c: number) =>
  new Float32Array([
    ((c >> 16) & 255) / 255,
    ((c >> 8) & 255) / 255,
    (c & 255) / 255,
  ]);

interface BitmapPipe {
  getSdfShader(): Shader;
  _updateDistanceField(t: BitmapText): void;
  _getGpuBitmapText(t: BitmapText): { context: { customShader?: Shader } };
}
// Route every MSDF BitmapText through MsdfFxShader. Pixi derives the edge width (uDistance) from the text's world
// transform only, which leaves the anti-aliased edge `resolution` device pixels wide: text softens as devicePixelRatio
// rises. Multiplying by the renderer resolution keeps a one-device-pixel edge at DPR 1, 2, 3 and 2.625.
export function installMsdfFx(
  renderer: Renderer,
  options: { fixResolution?: boolean } = {},
) {
  const pipe = (renderer.renderPipes as unknown as { bitmapText: BitmapPipe })
    .bitmapText;
  const update = pipe._updateDistanceField.bind(pipe);
  pipe.getSdfShader = () =>
    new MsdfFxShader(renderer.limits.maxBatchableTextures);
  pipe._updateDistanceField = (text: BitmapText) => {
    update(text);
    const shader = pipe._getGpuBitmapText(text).context.customShader;
    if (!(shader instanceof MsdfFxShader)) return;
    const u = shader.resources.localUniforms.uniforms,
      res = options.fixResolution === false ? 1 : renderer.resolution;
    u.uDistance *= res;
    const fx = fxOf.get(text);
    if (fx) shader.apply(fx, res * worldScale(text));
  };
}
const worldScale = (t: BitmapText) => {
  const { a, b, c, d } = t.groupTransform;
  return (Math.hypot(a, b) + Math.hypot(c, d)) / 2;
};
