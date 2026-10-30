## Shared editor and active game renderer

Editor map scenes now use the canonical authored-scene renderer from active `arkodia-game/apps/runtime/src/authored-scene`. Vendored editor sources are byte-identical; `node scripts/sync-runtime-scene.mjs --check` and integration tests detect drift. Both installed engines are Pixi 8.22.0. No archived checkout was accessed.

The previous export dropped non-Buildings; the game loader used a uniform width180/anchor0.8 while editor had category-specific plane/anchor/depth behavior. Responsive viewport percentages also changed the relationship between artwork size and coordinates. These discrepancies are fixed by the shared contract and renderer.

Every instance exports resolved parts, original asset URLs and SHA-256, category, names/IDs, position, pivot, scale, rotation, tint, depth presentation and optional spritesheet animation. The world is fixed at 1000×700 projected pixels, fitted uniformly with letterboxing. X/Y remain normalized percentages of this world. Ground and footprint cells use the native Stronghold 2:1 basis with zero map rotation. Drag/drop converts through the same fitted content rectangle. Native Stronghold props also use the shared matrix kernel, retaining their explicit width/foot/shear/vertical properties.

All scene categories are supported: Buildings, Props, Ground, Spawns, Cliffs, Water and unknown custom categories. The library adds the published Snow Cliff and 16-frame Gate sheet with verified published hashes; Water Surface uses the existing paving material with an explicit blue tint. Authored assets are not silently substituted with unrelated default-world art. The default published Stronghold remains its own scene; parity compares the **same exported authored scene loaded in the active game application**, not two different level layouts.

## Opening the same scene in game

Use **Open scene in game runtime** in Environment or Base. The snapshot travels in a URL fragment, with no private content publication. The game validates the snapshot and texture hashes before installing it. Export JSON also includes `scene` (`arkodia.scene`, version1); host that JSON and use `?scene=ENCODED_URL`. The older building-catalog query recognizes the new full bundle. Original legacy catalog payloads remain supported.

Public fixture: `/runtime-parity-scene.json`. All controls are React + Zustand in editor; runtime scene/loading/error visuals are Pixi. Instance deletion/duplication, catalog preservation, numbered names and history behavior are retained. Choosing a map or hierarchy instance clears a pinned Inspector.

## Concrete checks

36 editor tests and 17 runtime tests pass; both production builds pass. Cross-runtime integration tests run all13 library assets in both workspaces through Add, independent Duplicate, fitted drag, undo/redo, delete and persisted rehydration, then validate the identical payload with the game loader. Tests check texture hashes, byte-identical render modules, native matrix numbers, 2:1 basis, fit behavior and animation loop/clamp frames.

The real Chromium test opens both production bundles and compares **actual Pixi nodes** by ID: asset/hash, position, anchor, pivot, component matrix, scale, rotation, depth, tint and frame rectangle. All13 types at frame3, independent Duplicate, captured mouse drag with undo/redo, and persisted reload passed, with no page errors. The first run found a real paused-animation frame reset after history; rebuilding a node now applies the current animation time immediately. The final rerun passed all four stages.

Local asset requests from the game were routed to exact local editor bytes (SHA-256 verified); this is stated in the report rather than represented as a public browser test. Public deployments and artifact identity are checked separately. Inspector coverage/evidence is documented in the coordinated Inspector task.

[Actual node comparisons](parity/runtime-parity-local.json)

[Inspector verification](https://editor.arkodia.online/evidence/inspector-verification.json)
