import assert from "node:assert/strict";
import { test } from "node:test";
import { isPaneWaitingForInput } from "./tui-input-state.js";

test("detects agent prompt glyphs at the end of a running pane", () => {
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "Done reading files\n\n› "
    }),
    true
  );
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "Ready for the next instruction\n> "
    }),
    true
  );
});

test("detects English and Chinese questions near the end of output", () => {
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "I can do either approach.\nWhich one should I use?"
    }),
    true
  );
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "我可以继续实现。\n要现在开始吗？"
    }),
    true
  );
});

test("detects confirmation and enter prompts", () => {
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "This will permanently delete files. Continue? [y/N]"
    }),
    true
  );
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "Type 'discard' to confirm."
    }),
    true
  );
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "Press Enter to continue"
    }),
    true
  );
});

test("ignores stopped panes and ordinary output", () => {
  assert.equal(
    isPaneWaitingForInput({
      status: "stopped",
      buffer: "Which one should I use?"
    }),
    false
  );
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "Searching the web\nSearched the web for project docs\n"
    }),
    false
  );
});

test("strips ANSI control sequences before matching", () => {
  assert.equal(
    isPaneWaitingForInput({
      status: "running",
      buffer: "\u001b[32mWhat should the script do?\u001b[0m"
    }),
    true
  );
});
