import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Plain Node gateway is intentionally dependency-free.
import { publicPath, server } from "../ops/server.mjs";
test("gateway permits only public contract/channel/release reads", () => {
  for (const path of [
    "/v1/contracts",
    "/v1/channels/runtime-demo",
    "/v1/releases/abc",
    "/v1/releases/abc/documents/scene",
    "/v1/releases/abc/assets/" + "a".repeat(64),
  ])
    assert(publicPath(path));
  for (const path of [
    "/v1/drafts",
    "/v1/assets/" + "a".repeat(64),
    "/v1/releases/abc/../../drafts",
    "https://evil.test",
    "/healthz",
    "/v1/channels/x?token=anything",
  ])
    assert(!publicPath(path));
});
test("gateway rejects writes and private routes at HTTP boundary", async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      (
        await fetch(base + "/content/v1/releases", {
          method: "POST",
          body: "{}",
        })
      ).status,
      405,
    );
    assert.equal(
      (
        await fetch(base + "/content/v1/drafts", {
          headers: { Authorization: "Bearer not-forwarded" },
        })
      ).status,
      404,
    );
  } finally {
    await new Promise<void>((r) => server.close(r));
  }
});
