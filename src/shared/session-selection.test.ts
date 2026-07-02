import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSelectedWindowId } from "./session-selection.js";

test("selected window prefers local focused pane over stale server active window", () => {
  const windows = [
    { id: "window-33333", title: "33333", layout: {}, activePaneId: "pane-33333" },
    { id: "window-11111", title: "11111", layout: {}, activePaneId: "pane-11111" },
    { id: "window-22222", title: "22222", layout: {}, activePaneId: "pane-22222" }
  ];

  const selectedWindowId = resolveSelectedWindowId(windows, {
    localActivePaneId: "pane-33333",
    serverActivePaneId: "pane-22222",
    serverActiveWindowId: "window-22222"
  });

  assert.equal(selectedWindowId, "window-33333");
});
