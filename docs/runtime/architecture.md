## Application boundary

The standalone runtime is live at https://runtime.arkodia.online . Source is in arkodia-game/apps/runtime. The legacy game and editor stay in the arkadia repository and their existing sandbox. The Content API stays in apps/content-api and its separate existing sandbox. The runtime deploy script never builds/restarts those services.

Everything visible is rendered by Pixi 8: loading progress, retry/error messages, controls and the world. HTML supplies only the canvas host and metadata. Vite/TypeScript compile a standalone application without React.

## Public release consumer

The runtime reads `/v1/contracts`, resolves `/v1/channels/runtime-demo` once, pins the release ID, and loads its immutable manifest/documents/assets. It uses the actual shared Content API manifest/document types. Every document and asset is checked against its published SHA-256; assets also require exact byte size. Manifest IDs, contract versions, media types, scene semantics, entity/animation references and decoded image rectangles are checked before activation. Fetches have bounded deadlines and response sizes; assets have a 64 MiB aggregate budget.

The explicit support policy is manifest v1, document v1 environment/animation, and `data.runtimeProfile = arkodia.pixi-scene.v1`. V2 audited legacy formats and unknown versions/profiles are rejected. There is no implicit converter. A registry schema digest is recorded in diagnostics/evidence; supporting an additive API registry does not silently enable new consumer profiles.

The runtime gateway exposes only public GET/HEAD registry/channel/release/document/asset paths at `/content`. It targets the fixed Content API origin, forwards no credentials and exposes no draft/write routes. This keeps browser reads same-origin without changing Content API CORS or its deployed binary. Manifest URLs cannot redirect the consumer to another origin. No secret, draft asset URL or legacy fallback is bundled.

## Runtime profile and foundations

Coordinates are world pixels with +X right and +Y down. Scene data supplies dimensions, spawn, speed, layers, stable entity IDs, animation bindings, scale and an optional audio digest. The README defines the exact bounded profile. The backend owns the ordinary v1 envelope; this consumer owns its narrower scene semantics.

`RuntimeScene` owns entities, depth order, texture frame playback, input, camera, audio and cleanup. WASD/arrows are normalized; click/tap sets a movement target; blur clears input. Movement clamps to world bounds and caps suspended-tab delta. Camera follows/clamps and centers worlds smaller than the viewport. Audio decoding and playback require a gesture; gain controls mute. Scene replacement destroys input listeners, audio context, containers, textures and decoded bitmap resources.

The grove's ground/path are procedural Pixi geometry. All sprites, sprite frame definitions, object placements, movement parameters and test audio come from the published release. Loading installs no partial scene. Failure shows a Pixi Retry control; retry starts a fresh release load. `?release=ID` pins a known immutable release; `?channel=NAME` chooses another compatible published channel.

## Ordinary API authoring evidence

Demo release: `f492bfd67d00eb1183aaa9d8e194c560`, channel `runtime-demo`. Three revision-1 documents: `runtime-demo-grove`, `runtime-demo-walk`, `runtime-demo-tree`. Assets are an existing public knight atlas, an existing public golden tree, and a deterministic quiet two-second WAV test chime. No image generation was needed. The two existing artwork samples are test fixtures, not bulk migration.

`ops/publish-demo.mjs` ran inside the Content API sandbox: ordinary asset POST → author draft Save → draft reload → publisher release POST → unauthenticated immutable document reads. It reads role credentials locally from the private service configuration and prints only public evidence. Digest-scoped idempotency keys make identical retries safe. The public consumer smoke verifies all three document hashes, all three asset hashes/sizes and seven entity bindings through both the API and runtime gateway.

Published schema digest: `09a37562ce4c4ff4f3c62c967546592593f2e73448f182c9db712a0cbeade314`.

## Scope remaining

This is one playable foundation scene. Collision/pathfinding, combat, multiplayer authority, economy/inventory, player persistence, editor integration, streaming, full character action/direction state machines, VFX playback, v2 adapters, accessibility DOM bridges and legacy content migration remain subsequent work. The chime validates the audio foundation; it is not a finished soundtrack.

[Runtime source and profile](/organizations/ORd5dd6f99b4308d6187031557/repositories/RP3eb264b054cb2f6cb1e1e0bf/files?file=apps%2Fruntime%2FREADME.md) · [Ordinary API publication evidence](/organizations/ORd5dd6f99b4308d6187031557/repositories/RP3eb264b054cb2f6cb1e1e0bf/files?file=docs%2Fruntime%2Fpublication-evidence.json)
