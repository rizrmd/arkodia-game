"""Render the production lighting shader with EGL/GLES3, without a browser.

Requires an EGL surfaceless software driver (e.g. Mesa llvmpipe).
SHADOW_GL_LIB_DIR optionally points to libEGL.so.1 and libGLESv2.so.2.
Run: python3 ops/check-shadow-contact.py [path/to/world-lighting.ts]
"""
import ctypes as C
import json
import os
from pathlib import Path
import re
import sys
import subprocess

libdir = os.environ.get("SHADOW_GL_LIB_DIR", "")
egl = C.CDLL(str(Path(libdir) / "libEGL.so.1") if libdir else "libEGL.so.1")
gl = C.CDLL(str(Path(libdir) / "libGLESv2.so.2") if libdir else "libGLESv2.so.2")
I, U, F, P = C.c_int, C.c_uint, C.c_float, C.c_void_p


def bind(lib, name, result, *args):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = result, args
    return fn


get_display = bind(egl, "eglGetPlatformDisplay", P, U, P, C.POINTER(C.c_ssize_t))
display = get_display(0x31DD, None, (C.c_ssize_t * 1)(0x3038))
assert bind(egl, "eglInitialize", U, P, P, P)(display, None, None), "EGL initialize"
assert bind(egl, "eglBindAPI", U, U)(0x30A0), "GLES API"
config, count = P(), I()
attrs = (I * 13)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8, 0x3038)
assert bind(egl, "eglChooseConfig", U, P, C.POINTER(I), C.POINTER(P), I, C.POINTER(I))(
    display, attrs, C.byref(config), 1, C.byref(count)) and count.value, "EGL config"
surface = bind(egl, "eglCreatePbufferSurface", P, P, P, C.POINTER(I))(
    display, config, (I * 5)(0x3057, 256, 0x3056, 256, 0x3038))
context = bind(egl, "eglCreateContext", P, P, P, P, C.POINTER(I))(
    display, config, None, (I * 3)(0x3098, 3, 0x3038))
assert bind(egl, "eglMakeCurrent", U, P, P, P, P)(display, surface, surface, context), "EGL context"
print("Renderer:", bind(gl, "glGetString", C.c_char_p, U)(0x1F01).decode())

shader_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "src/authored-scene/world-lighting.ts"
source = shader_path.read_text()
fragment = re.search(r"const fragment = `([\s\S]*?)`;", source).group(1)
vertex = re.search(r"const vertex = `([\s\S]*?)`;", source).group(1)
# Use the installed Pixi's real preprocessing and GLSL version selection.
# A forced ES300 header previously hid WebGL1-incompatible builtins.
processed = json.loads(subprocess.check_output(
    ["node", "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { DOMAdapter, GlProgram } from 'pixi.js';
DOMAdapter.set({ ...DOMAdapter.get(), createCanvas: () => ({getContext: () => null}) });
const shader = GlProgram.from(JSON.parse(readFileSync(0, 'utf8')));
console.log(JSON.stringify({vertex: shader.vertex, fragment: shader.fragment}));
"""],
    input=json.dumps({"vertex": vertex, "fragment": fragment, "name": "contact-regression"}).encode(),
    cwd=next((p for p in shader_path.resolve().parents if (p / "node_modules/pixi.js").exists()),
             Path(__file__).resolve().parents[1]),
))
vertex, fragment = processed["vertex"], processed["fragment"]
assert "#version 300 es" not in fragment, "test must cover the production ES100 path"
create_shader = bind(gl, "glCreateShader", U, U)
shader_source = bind(gl, "glShaderSource", None, U, I, C.POINTER(C.c_char_p), P)
compile_shader = bind(gl, "glCompileShader", None, U)
get_shader = bind(gl, "glGetShaderiv", None, U, U, C.POINTER(I))
shader_log = bind(gl, "glGetShaderInfoLog", None, U, I, P, P)


def compile_stage(kind, text):
    shader = create_shader(kind)
    data = C.c_char_p(text.encode())
    shader_source(shader, 1, C.byref(data), None)
    compile_shader(shader)
    status = I()
    get_shader(shader, 0x8B81, C.byref(status))
    log = C.create_string_buffer(16384)
    shader_log(shader, len(log), None, log)
    assert status.value, log.value.decode()
    return shader


program = bind(gl, "glCreateProgram", U)()
attach = bind(gl, "glAttachShader", None, U, U)
attach(program, compile_stage(0x8B31, vertex))
attach(program, compile_stage(0x8B30, fragment))
bind(gl, "glLinkProgram", None, U)(program)
status = I()
bind(gl, "glGetProgramiv", None, U, U, C.POINTER(I))(program, 0x8B82, C.byref(status))
log = C.create_string_buffer(16384)
bind(gl, "glGetProgramInfoLog", None, U, I, P, P)(program, len(log), None, log)
assert status.value, log.value.decode()
bind(gl, "glUseProgram", None, U)(program)
# Exercise the production vertex shader, including its attribute/uniform layout.
buffer = U()
bind(gl, "glGenBuffers", None, I, C.POINTER(U))(1, C.byref(buffer))
bind(gl, "glBindBuffer", None, U, U)(0x8892, buffer.value)
positions = (F * 6)(0, 0, 2, 0, 0, 2)
bind(gl, "glBufferData", None, U, C.c_ssize_t, P, U)(0x8892, C.sizeof(positions), positions, 0x88E4)
attribute = bind(gl, "glGetAttribLocation", I, U, C.c_char_p)(program, b"aPosition")
bind(gl, "glEnableVertexAttribArray", None, U)(attribute)
bind(gl, "glVertexAttribPointer", None, U, I, U, U, I, P)(attribute, 2, 0x1406, 0, 0, None)

loc = bind(gl, "glGetUniformLocation", I, U, C.c_char_p)
u1i = bind(gl, "glUniform1i", None, I, I)
u1f = bind(gl, "glUniform1f", None, I, F)
u2f = bind(gl, "glUniform2f", None, I, F, F)
u4f = bind(gl, "glUniform4f", None, I, F, F, F, F)


def uniform(name, *values):
    location = loc(program, name.encode())
    {1: u1f, 2: u2f, 4: u4f}[len(values)](location, *values)


uniform("uAmbient", 1, 1, 1, 0)
uniform("uInverseA", 1/16, 0, 0, 1/16)
uniform("uOutputFrame", 0, 0, 256, 256)
uniform("uInputSize", 256, 256, 1/256, 1/256)
uniform("uOutputTexture", 256, 256, 1, 0)
uniform("uInverseT", 0, 0)
uniform("uLightCount", 0)
textures = {}
for unit, name in enumerate(["uTexture", "uGroundShade", "uDynamicGroundShade", "uReceiver",
                             "uDepth", "uSecond", "uDynamicReceiver", "uDynamicDepth", "uDynamicSecond"]):
    texture = U()
    bind(gl, "glGenTextures", None, I, C.POINTER(U))(1, C.byref(texture))
    textures[name] = (unit, texture.value)
    u1i(loc(program, name.encode()), unit)
active_texture = bind(gl, "glActiveTexture", None, U)
bind_texture = bind(gl, "glBindTexture", None, U, U)
parameter = bind(gl, "glTexParameteri", None, U, U, I)
image = bind(gl, "glTexImage2D", None, U, I, I, I, I, I, U, U, P)


def upload(name, data, n=8):
    unit, texture = textures[name]
    active_texture(0x84C0 + unit)
    bind_texture(0x0DE1, texture)
    for key in [0x2801, 0x2800]:
        parameter(0x0DE1, key, 0x2601 if "GroundShade" in name else 0x2600)
    for key in [0x2802, 0x2803]:
        parameter(0x0DE1, key, 0x812F)
    image(0x0DE1, 0, 0x1908, n, n, 0, 0x1908, 0x1401, (C.c_ubyte * len(data)).from_buffer_copy(data))


def packed(z, owner, alpha=255):
    return bytes([z >> 4, ((z & 15) << 4) | (owner >> 8), owner & 255, alpha])


def field(fn, n=8):
    return b"".join(fn(x, y) for y in range(n) for x in range(n))


def reset():
    for name in textures:
        upload(name, bytes([255] * 4) if name == "uTexture" else bytes(8 * 8 * 4),
               1 if name == "uTexture" else 8)
    uniform("uBounds", 0, 0, 16, 16)
    uniform("uLightBounds", 0, 0, 16, 16)
    uniform("uDynamicBounds", 0, 0, 16, 16)
    uniform("uSun", 0, -1, 1, 0)
    uniform("uDynamicSun", 0, -1, 0, 0)
    uniform("uShadowSteps", 2, 2)


def render():
    bind(gl, "glViewport", None, I, I, I, I)(0, 0, 256, 256)
    bind(gl, "glDrawArrays", None, U, I, I)(4, 0, 3)
    out = (C.c_ubyte * (256 * 256 * 4))()
    bind(gl, "glReadPixels", None, I, I, I, I, U, U, P)(0, 0, 256, 256, 0x1908, 0x1401, out)
    assert bind(gl, "glGetError", U)() == 0, "GLES error"
    return bytes(out)


def red(pixels, x, y):
    return pixels[(y * 256 + x) * 4]


# Optional real-asset worker fixture: render the production pass directly.
if os.environ.get("SHADOW_SCENE_FIXTURE"):
    import base64, struct, zlib
    fixture = json.loads(Path(os.environ["SHADOW_SCENE_FIXTURE"]).read_text())
    reset()
    uniform("uInverseA", 1, 0, 0, 1)
    uniform("uBounds", 0, 0, 256, 256)
    uniform("uLightBounds", 0, 0, 256, 256)
    uniform("uSun", *fixture["sun"], 0)
    uniform("uShadowSteps", 1, 1)
    for name, data in fixture["textures"].items():
        upload(name, base64.b64decode(data), 256)
    pixels = render()
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    rows = b"".join(b"\0" + pixels[y*256*4:(y+1)*256*4] for y in range(256))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 256, 256, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    target = Path(os.environ["SHADOW_SCENE_OUTPUT"])
    target.write_bytes(png)
    print(json.dumps({"output": str(target), "shader": str(shader_path)}))
    sys.exit(0)

# A diagonal sprite foot with a shadow directly outside it. The original shader
# gives only 171 or 255 here; filtered contacts must have intermediate coverage.
reset()
upload("uReceiver", field(lambda x, y: packed(0, 271) if x + y < 8 else bytes(4)))
upload("uDepth", field(lambda x, y: packed(1, 271) if x + y < 8 else packed(60, 271)))
upload("uGroundShade", field(lambda x, y: bytes([255, 255 if x + y < 8 else 0, 0, 0])))
diagonal = render()
levels = {red(diagonal, x, y) for y in range(32, 224) for x in range(32, 224)}
assert len(levels) > 15, ("contact still binary", levels)
assert red(diagonal, 48, 48) == 255, "self shadow inside sprite"
assert red(diagonal, 208, 208) < 180, "ground shadow outside sprite"
max_jump = max(abs(red(diagonal, x + 1, 112) - red(diagonal, x, 112)) for x in range(32, 223))
assert max_jump < 12, ("contact edge discontinuity", max_jump)

# Exact owner IDs must survive across the 8-bit boundary; a different owner
# in second depth still casts on this receiver after excluding its own depth.
reset()
upload("uReceiver", field(lambda x, y: packed(20, 256)))
upload("uDepth", field(lambda x, y: packed(21, 256)))
upload("uGroundShade", field(lambda x, y: bytes([255, 255, 0, 0])))
assert red(render(), 128, 128) == 255, "self owner must be excluded"
upload("uSecond", field(lambda x, y: packed(60, 255, 128)))
assert 210 <= red(render(), 128, 128) <= 215, "translucent second caster lost"
upload("uSecond", field(lambda x, y: packed(22, 255)))
assert red(render(), 128, 128) == 255, "height bias changed"
upload("uSecond", field(lambda x, y: packed(24, 255)))
assert red(render(), 128, 128) < 180, "raised receiver lost other caster"

# A genuinely higher part of the SAME object must shade its base/root.
reset()
upload("uReceiver", field(lambda x, y: packed(0, 271)))
upload("uDepth", field(lambda x, y: packed(60, 271)))
upload("uGroundShade", field(lambda x, y: bytes([255, 255, 0, 0])))
assert red(render(), 128, 128) < 180, "canopy shadow discarded on own root"
upload("uDepth", field(lambda x, y: packed(1, 271)))
assert red(render(), 128, 128) == 255, "same-surface acne"
uniform("uSun", 0, -1, 0, 0)
uniform("uDynamicSun", 0, -1, 1, 0)
upload("uDynamicDepth", field(lambda x, y: packed(60, 271)))
assert red(render(), 128, 128) < 180, "dynamic own-root shadow discarded"

# A projected blocker boundary on a continuous raised receiver must also be
# filtered, rather than only softening the receiver footprint itself.
reset()
upload("uReceiver", field(lambda x, y: packed(20, 271)))
upload("uDepth", field(lambda x, y: packed(60, 513) if x + y < 8 else bytes(4)))
upload("uGroundShade", field(lambda x, y: bytes([0, 255, 0, 0])))
projected = render()
assert len({red(projected, x, 112) for x in range(32, 224)}) > 15, "projected depth edge still binary"
assert red(projected, 32, 32) < 180 and red(projected, 208, 208) == 255

# Static and dynamic casters combine after selecting the highest receiver.
reset()
upload("uReceiver", field(lambda x, y: packed(20, 271)))
upload("uDepth", field(lambda x, y: packed(40, 513)))
upload("uGroundShade", field(lambda x, y: bytes([255, 255, 0, 0])))
upload("uDynamicReceiver", field(lambda x, y: packed(50, 1025)))
uniform("uDynamicSun", 0, -1, 1, 0)
assert red(render(), 128, 128) == 255, "static caster incorrectly shadows a higher dynamic receiver"
upload("uDynamicDepth", field(lambda x, y: packed(51, 1025)))
assert red(render(), 128, 128) == 255, "dynamic receiver casts on itself"
upload("uDynamicSecond", field(lambda x, y: packed(75, 2049)))
assert red(render(), 128, 128) < 180, "second dynamic caster lost"

# Dynamic receiver field with a different origin and resolution.
reset()
uniform("uSun", 0, -1, 0, 0)
uniform("uDynamicSun", 0, -1, 1, 0)
uniform("uDynamicBounds", -1, -1, 18, 18)
uniform("uShadowSteps", 2, 1.5)
upload("uDynamicReceiver", field(lambda x, y: packed(0, 4095) if x + y < 9 else bytes(4), 12), 12)
upload("uDynamicDepth", field(lambda x, y: packed(1, 4095) if x + y < 9 else packed(60, 4095), 12), 12)
upload("uDynamicGroundShade", field(lambda x, y: bytes([255, 255 if x + y < 9 else 0, 0, 0]), 12), 12)
dynamic = render()
assert red(dynamic, 32, 32) == 255, "dynamic self shadow"
assert red(dynamic, 208, 208) < 180, "dynamic ground shadow lost"
assert len({red(dynamic, x, 80) for x in range(32, 224)}) > 15, "dynamic contacts still binary"
uniform("uDynamicSun", 0, -1, 0, 0)
assert all(v == 255 for v in render()), "night retains shadow"

# Empty fields must not clamp a border caster into view.
reset()
assert all(v == 255 for v in render()), "empty scene darkened"
upload("uGroundShade", field(lambda x, y: bytes([255, 0, 0, 0])))
uniform("uBounds", 4, 4, 8, 8)
outside = render()
assert red(outside, 16, 16) == 255, "out-of-bounds shadow"
assert red(outside, 128, 128) < 180, "ground fast path lost"

print(json.dumps({"shader": str(shader_path), "contactLevels": len(levels),
                  "maxAdjacentPixelJump": max_jump,
                  "checks": ["diagonal contact antialiasing", "same-surface rejection", "own-canopy occlusion", "second caster",
                             "translucency", "raised receiver/bias", "projected blocker edge",
                             "static/dynamic overlap", "dynamic offset/resolution",
                             "night", "empty fields", "bounds", "ground fast path"]}, indent=2))
bind(egl, "eglMakeCurrent", U, P, P, P, P)(display, None, None, None)
bind(egl, "eglDestroyContext", U, P, P)(display, context)
bind(egl, "eglDestroySurface", U, P, P)(display, surface)
bind(egl, "eglTerminate", U, P)(display)
