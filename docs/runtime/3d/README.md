## Real 3D heroes

The Stronghold runtime renders the existing Rift Runner and Ember Warden skinned GLBs with Three.js and composites the transparent canvas into the Pixi world for depth ordering, movement, collision and camera tracking. UI remains in Pixi. Hero yaw is continuous, without sprite mirroring. Idle/run select actual GLB clips. The shared renderer supports idle, run, idle_cast, run_cast, hit and death; transitions crossfade over 0.14 seconds and preserve run/run_cast stride phase. Combat behavior is unchanged.

The editor imports the runtime's public `assets/hero-renderer.js` module and uses the same GLBs and animation evaluation for Model, Animation and VFX. Timeline frames evaluate animation time at 30 FPS. The module and models permit the production editor Origin. A failed GLB load is surfaced; no sprite fallback disguises a failure.

Only the two approved hero model files were recovered by reading individual files from the shared historical sandbox. No archived checkout or history was cloned/restored into a member workspace. Original model sizes and SHA-256 digests are recorded in `apps/runtime/public/models/manifest.json`; the renderer checks the hashes before parsing. Models are release artifacts in the active game repo; they are not yet authored or updated through the Content API.

Validation: 17 runtime tests; build; `apps/runtime/ops/hero-3d.browser.mjs` renders both 24-bone models, all six clips and two yaw angles, asserting nonempty pixels and changed images; `hero-world.browser.mjs` enters the real Stronghold and verifies walking and continuous yaw. Evidence is under `docs/runtime/evidence/hero-3d*`.

The old hand-painted postprocessing, casting-arm override and projected sun shadow are not reproduced by this renderer. It uses the original model materials, runtime lighting values, and the existing contact shadow. These rendering refinements can be added independently of the real 3D model correction.
