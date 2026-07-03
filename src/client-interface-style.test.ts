import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("client exposes light interface style hooks", () => {
  const appSource = readFileSync("src/client/src/App.vue", "utf8");
  const cssSource = readFileSync("src/client/src/styles.css", "utf8");

  assert.match(appSource, /data-interface-style/);
  assert.match(appSource, /tycho-interface-style/);
  assert.match(cssSource, /data-interface-style="light"/);
  assert.match(cssSource, /#f7f5ef/i);
  assert.match(appSource, /background:\s*"#fbfaf6"/);
  assert.match(appSource, /foreground:\s*"#1f2328"/);
  assert.doesNotMatch(appSource, /"reader"/);
  assert.doesNotMatch(cssSource, new RegExp(`data-interface-style="${"read"}${"er"}"`));
});
