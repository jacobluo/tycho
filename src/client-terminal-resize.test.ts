import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("client terminal resizing uses xterm fit addon instead of hard-coded cell estimates", () => {
  const source = readFileSync("src/client/src/App.vue", "utf8");

  assert.match(source, /@xterm\/addon-fit/);
  assert.doesNotMatch(source, /\/ 7\.8/);
  assert.doesNotMatch(source, /\/ 15\.4/);
});
