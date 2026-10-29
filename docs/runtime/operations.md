## Live service

Runtime: https://runtime.arkodia.online . Platform fallback: https://arkodia-runtime-arkodia.fural.space . Dedicated sandbox: `CSf41a869d5150ba8d8c7cc935`, slug `arkodia-runtime`. HTTPS and actual browser interaction passed at both origins. Cloudflare DNS binds only the new runtime hostname; apex, editor and content records were not replaced.

`/build.json` identifies the exact deployed Git revision. Compare it with the GitHub main branch and the Pixi footer/read-only runtime diagnostics. The screenshots and committed browser record below were captured from deployed source `1b85ed625dcab2b6280adf25775041e371ea5d25`; later documentation and mobile-label adjustments are verified again at final shipping. Final task evidence records the final deployed commit.

## Deployment and recovery

Run `fural-agent repos ship RP3eb264b054cb2f6cb1e1e0bf` after committing source. The committed `scripts/fural-deploy.sh` installs locked dependencies, runs focused tests, performs a strict TypeScript/Vite build, writes commit metadata, and uses supported `sandboxes serve` to copy static artifacts plus the dependency-free Node server to the dedicated sandbox. Its boot command execs the foreground server. The absolute staging path is necessary for platform HOME validation. No host injection or production Docker access is involved.

The runtime has no durable gameplay data; its static files are replaceable. Immutable content and credentials remain in the independent Content API storage. Roll back runtime by rebuilding/serving a known good commit. Roll back content only with the existing publisher compare-and-swap channel operation, preserving immutable releases. Do not initialize/delete Content API storage or restart the legacy sandbox while deploying runtime.

For failures inspect runtime boot logs. If a process disappears unexpectedly, inspect `organization resource-incidents --limit 20` and sandbox boot logs before restart. Verify `/build.json`, public channel reads and the consumer smoke after recovery. The one-time `ops/bind-domain.py` configures only `runtime.arkodia.online`; it refuses to replace a conflicting DNS record and never logs Cloudflare credentials.

## Verification

Nine focused tests pass: supported contracts; unknown versions/profile rejection; duplicate/missing references; invalid frames/fps/coordinates/player cardinality; bounded movement/camera/frame timing; loader release pinning and SHA-256 corruption rejection; hostile manifest URL isolation; gateway route allowlist and HTTP write/private-route rejection. Strict TypeScript and the Vite production build pass.

`npm --prefix apps/runtime run smoke -- https://runtime.arkodia.online/content` exercises the actual browser consumer loader over HTTPS. It verifies schema digest, all three published documents, all three assets and seven entity bindings. The direct Content API smoke also passed.

`cd apps/runtime && node ops/browser-smoke.mjs https://runtime.arkodia.online` runs actual Chromium with software WebGL. Checks: one Pixi canvas and no HTML controls; seven content entities; keyboard movement; following camera; click movement; audio decode/gesture toggle; injected 503 error and successful Pixi Retry; loading state; injected unknown manifest rejection; mobile viewport; no page exceptions; credential-free public GET requests only. The expected test-outage console 503 is deliberate. Cloudflare injects an analytics beacon that the runtime's strict CSP blocks; it does not affect gameplay or the browser checks. Pixi's CSP-compatible shader module avoids unsafe-eval.

The initial Chromium library failure was diagnosed and resolved using the organization's existing HOME-only browser libraries and headless shell. Browser validation is complete, rather than deferred. Audio tests prove successful decoding/context/toggle; audible quality still benefits from human listening.

Preservation checks: legacy `https://arkodia.online/` 200; existing environment-editor route follows its redirect to HTTP 200; Content API health 200 continues to report its unchanged `f24b0694312d78ae7cc793aaa25d69c24c15f644` binary. No legacy or API service restart/deploy was performed.

[Consumer evidence](/organizations/ORd5dd6f99b4308d6187031557/repositories/RP3eb264b054cb2f6cb1e1e0bf/files?file=docs%2Fruntime%2Fevidence%2Fconsumer.json) · [Browser requests and interaction evidence](/organizations/ORd5dd6f99b4308d6187031557/repositories/RP3eb264b054cb2f6cb1e1e0bf/files?file=docs%2Fruntime%2Fevidence%2Fbrowser.json)

## Desktop scene

![Published Content API grove rendered in Pixi](https://runtime.arkodia.online/evidence/desktop.png)

## Mobile scene

![Mobile Pixi scene and controls](https://runtime.arkodia.online/evidence/mobile.png)

## Retry state

![Pixi loading failure with Retry control](https://runtime.arkodia.online/evidence/error.png)
