import assert from "node:assert/strict";
import { test } from "node:test";
import { createTuimuxServerSpawnOptions, upsertWindowPreservingOrder } from "./client.js";

test("tuimux server stays attached to the Tycho process group", () => {
  const options = createTuimuxServerSpawnOptions({ PATH: "/bin" });

  assert.equal(options.detached, false);
  assert.equal(options.stdio, "ignore");
  assert.equal(options.env?.PATH, "/bin");
});

test("window_changed preserves existing window order", () => {
  const windows = [
    { id: "window-11111", title: "11111", layout: {}, activePaneId: "pane-11111" },
    { id: "window-33333", title: "33333", layout: {}, activePaneId: "pane-33333" },
    { id: "window-22222", title: "22222", layout: {}, activePaneId: "pane-22222" }
  ];

  const nextWindows = upsertWindowPreservingOrder(windows, {
    id: "window-33333",
    title: "33333",
    layout: { focused: true },
    activePaneId: "pane-33333"
  });

  assert.deepEqual(nextWindows.map((windowState) => windowState.title), ["11111", "33333", "22222"]);
  assert.deepEqual(nextWindows[1].layout, { focused: true });
});
