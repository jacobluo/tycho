import assert from "node:assert/strict";
import { test } from "node:test";
import { createTuimuxServerSpawnOptions } from "./client.js";

test("tuimux server stays attached to the Tycho process group", () => {
  const options = createTuimuxServerSpawnOptions({ PATH: "/bin" });

  assert.equal(options.detached, false);
  assert.equal(options.stdio, "ignore");
  assert.equal(options.env?.PATH, "/bin");
});
