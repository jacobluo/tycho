import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("client exposes reader interface style hooks", () => {
  const appSource = readFileSync("src/client/src/App.vue", "utf8");
  const cssSource = readFileSync("src/client/src/styles.css", "utf8");

  assert.match(appSource, /data-interface-style/);
  assert.match(appSource, /tycho-interface-style/);
  assert.match(cssSource, /data-interface-style="reader"/);
  assert.match(cssSource, /#f7f5ef/i);
});
