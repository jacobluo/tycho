import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignWindowToSlot,
  clearWindowFromSlots,
  createEmptySlotAssignments,
  resolveVisibleSlotIds
} from "./session-slots.js";

test("resolves visible slots for layout modes", () => {
  assert.deepEqual(resolveVisibleSlotIds("single", 1400), ["slot-1"]);
  assert.deepEqual(resolveVisibleSlotIds("two-vertical", 1400), ["slot-1", "slot-2"]);
  assert.deepEqual(resolveVisibleSlotIds("two-horizontal", 1400), ["slot-1", "slot-2"]);
  assert.deepEqual(resolveVisibleSlotIds("quad", 1400), ["slot-1", "slot-2", "slot-3", "slot-4"]);
  assert.deepEqual(resolveVisibleSlotIds("quad", 640), ["slot-1"]);
});

test("assigning a window to a slot clears duplicate display", () => {
  const assignments = {
    ...createEmptySlotAssignments(),
    "slot-1": "window-a",
    "slot-2": "window-b"
  };

  assert.deepEqual(assignWindowToSlot(assignments, "slot-2", "window-a"), {
    "slot-1": null,
    "slot-2": "window-a",
    "slot-3": null,
    "slot-4": null
  });
});

test("clears a closed window from all slots", () => {
  const assignments = {
    ...createEmptySlotAssignments(),
    "slot-1": "window-a",
    "slot-2": "window-b"
  };

  assert.deepEqual(clearWindowFromSlots(assignments, "window-a"), {
    "slot-1": null,
    "slot-2": "window-b",
    "slot-3": null,
    "slot-4": null
  });
});
