## Stronghold first increment

The default channel is now `stronghold-original`. It restores original loading artwork, remembered Rift Runner / Amber Warden selection and fresh Stronghold exploration. See [the detailed parity checklist](../../docs/runtime/stronghold/parity.md) and [adapter/verification notes](../../docs/runtime/stronghold/increment.md). The earlier foundation consumer remains at `?channel=runtime-demo` for regression evidence. The v1 profile described below is specific to that earlier channel; it does not describe or silently accept the new explicit v2 presentation adapter.

# Standalone Pixi runtime

A separate application in `arkodia-game/apps/runtime`. All visible controls, loading, error and scene UI are Pixi objects. HTML only hosts the canvas. No React, legacy gameplay bootstrap, administrator credential or author/publisher token is included in the application or gateway.

## Run and verify

Node 22+ and npm are required.

```sh
npm --prefix apps/runtime ci
npm --prefix apps/runtime run dev
npm --prefix apps/runtime test
npm --prefix apps/runtime run build
npm --prefix apps/runtime run smoke
cd apps/runtime && node ops/browser-smoke.mjs
```

The browser script accepts a deployed origin as its first argument. `CHROMIUM_PATH` can override the installed Chromium headless shell; this organization's HOME-only browser libraries are supplied to the browser process only. It owns/closes the local test server and browser. Evidence is written to `docs/runtime/evidence`. The expected 503 console response is an injected outage test, not a runtime crash.

## Published content boundary

`src/content.ts` uses the real Content API paths and shared manifest/document types from `packages/content-contracts`. It reads the registry, resolves `runtime-demo` once, pins its release, loads immutable documents/assets, and verifies SHA-256 plus asset sizes. Version/profile, graph bindings and decoded image bounds are checked before the scene is installed. Fetches have 20-second deadlines and response limits. This consumer supports manifest v1, document v1 environment/animation, and the explicitly named `arkodia.pixi-scene.v1` scene profile. It rejects v2 and unknown profiles; it does not guess adapters or convert legacy data. Manifest URLs never control an off-origin fetch: routes are derived from validated release/entry IDs against the trusted API origin.

The gateway at `/content` forwards only unauthenticated GET/HEAD public registry/channel/release/document/asset reads to `https://content.arkodia.online`. It does not forward headers, credentials, query parameters or private draft routes, and does not expose writes. Same-origin reads avoid changing the existing API CORS/deployment configuration. There is no fallback to bundled content or legacy asset URLs in the running browser.

Optional `?channel=NAME` selects another compatible published channel; `?release=ID` pins a known release without a channel read. Reload explicitly starts a fresh load; an active scene never switches underfoot. A failed load tears down the prior scene and shows a Pixi Retry control.

## Scene profile

The v1 environment `data` extends the ordinary API envelope with:

- `runtimeProfile: "arkodia.pixi-scene.v1"`; `width`, `height` in world pixels (320–8192); `spawn: {x,y}`; `speed` in pixels/second (0–600).
- `layers: [{id, objects: [{id,x,y,animation,scale,player?}]}]`. IDs are stable ASCII keys. Each animation names a v1 animation document in the same release. Exactly one object is the player; spawn overrides its initial coordinates. Maximum 16 layers, 128 entities/layer; scale is positive and at most 4.
- Optional `audio`: digest of a release-listed supported audio asset. Audio starts only after the Sound button gesture and can be muted.
- Animation data uses the API's existing `fps`, `loop` and `frames: [{asset,x,y,width,height}]`. Rectangles use source image pixels; coordinates are not legacy isometric tiles. No implicit unit conversion occurs.

The API validates its v1 envelope. The consumer owns the narrower scene profile and behavior checks. This is new test content, not a legacy importer or migration.

## Foundations

`RuntimeScene` owns the world, entity instances, texture frame animations, input, follow camera, audio bus and teardown. Objects depth-sort by world Y. Input supports normalized WASD/arrows and click/tap movement; blur clears input. Movement clamps to world bounds and caps delta time after suspended tabs. Camera follows and clamps at world edges. Sprite frame rectangles are checked against decoded image dimensions. Audio uses a gesture-resumed Web Audio context with decoded-buffer ownership, gain/mute and cleanup. Scene replacement destroys listeners, textures, world objects and audio.

The grove background/path styling is procedural Pixi geometry. The release supplies dimensions, spawn, speed, entity placement, animation frames and assets; no local sprite content is shipped. The test fixture uses two already-public artwork assets plus a deterministic quiet two-second WAV chime. `ops/publish-demo.mjs` uploads bytes, saves/reloads three drafts through the ordinary author API, then publishes through the publisher API. It runs only inside the Content API sandbox and reads private role credentials there. Its digest-scoped idempotency keys allow safe reruns of the same fixture. Future fixture edits must use fresh IDs/keys and optimistic revisions, not overwrite a release.

## Deploy and operations

After committing/pushing, run `fural-agent repos ship RP3eb264b054cb2f6cb1e1e0bf`. Its script builds/tests the runtime and calls supported `sandboxes serve` into the dedicated `arkodia-runtime` sandbox. The foreground Node server is the persisted boot command. It serves the Vite build and public-read gateway. API database/assets/private configuration and the legacy game/editor sandbox are never copied, replaced or restarted.

`/build.json` reports the exact Git commit of the deployed runtime; the Pixi footer and read-only `window.__ARKODIA_RUNTIME__` diagnostics expose the same commit. Check it against origin/main and run the consumer smoke against `https://RUNTIME/content`, then the browser smoke against the runtime URL. Inspect sandbox boot logs and resource incidents before restarting an unexpectedly stopped workload. Runtime storage is replaceable static artifacts; published content persists in the independently managed Content API. Deploy rollback means rebuild/serve a known committed runtime; content rollback uses the Content API's publisher compare-and-swap channel operation.

## Subsequent work

No collisions/pathfinding, combat, multiplayer/server authority, inventory/economy, editor integration, chunk streaming, v2 adapters, full character state machine, VFX player, accessibility DOM bridge, legacy migration or production player saves are implemented. Keyboard and pointer interaction plus one animated scene are the acceptance slice. Headless audio checks prove decoding/context and toggle state; human listening remains useful for soundtrack quality.


## Authored editor scene parity

The active app accepts `?scene=ENCODED_JSON_URL` or `#scene=ENCODED_JSON` from the editor's Open scene in game runtime action. `authored-scene` validates and renders every Scene hierarchy category with the shared canonical renderer, texture SHA-256 checks, a fitted 1000×700 world, 2:1 ground projection, and spritesheet playback. The published Stronghold remains the default scene and uses the same native prop matrix kernel. See [concrete cross-runtime evidence](../../docs/runtime/SCENE-PARITY.md).

The public-read gateway now uses the active platform Content API hostname `https://arkodia-content-api-arkodia.fural.space`; the previous content vanity hostname was returning404. Deployment uses checksummed immutable artifact activation through the supported Fural serve/exec workflow, with no dependency on the retired runtime sandbox ID.
