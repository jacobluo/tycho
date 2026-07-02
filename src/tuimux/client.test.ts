import assert from "node:assert/strict";
import { test } from "node:test";
import { createTuimuxServerSpawnOptions, mergeWindowsPreservingOrder, upsertWindowPreservingOrder } from "./client.js";

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

test("snapshot windows preserve existing order while replacing details", () => {
  const windows = [
    { id: "window-33333", title: "33333", layout: {}, activePaneId: "pane-33333" },
    { id: "window-11111", title: "11111", layout: {}, activePaneId: "pane-11111" },
    { id: "window-22222", title: "22222", layout: {}, activePaneId: "pane-22222" }
  ];

  const nextWindows = mergeWindowsPreservingOrder(windows, [
    { id: "window-22222", title: "22222", layout: { focused: true }, activePaneId: "pane-22222" },
    { id: "window-33333", title: "33333", layout: { focused: false }, activePaneId: "pane-33333" },
    { id: "window-11111", title: "11111", layout: { focused: false }, activePaneId: "pane-11111" }
  ]);

  assert.deepEqual(nextWindows.map((windowState) => windowState.title), ["33333", "11111", "22222"]);
  assert.deepEqual(nextWindows[2].layout, { focused: true });
});
