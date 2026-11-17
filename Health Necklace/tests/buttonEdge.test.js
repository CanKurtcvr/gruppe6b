"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEdgeDetector } = require("../src/portal/buttonEdge.js");

test("fires 'down' exactly once while a button is held", () => {
  const detect = createEdgeDetector();
  assert.deepEqual(detect(0, [false]), { down: [], up: [] });
  assert.deepEqual(detect(0, [true]), { down: [0], up: [] });
  assert.deepEqual(detect(0, [true]), { down: [], up: [] });
  assert.deepEqual(detect(0, [true]), { down: [], up: [] });
});

test("fires 'up' on release and 'down' again on the next press", () => {
  const detect = createEdgeDetector();
  detect(0, [true]);
  assert.deepEqual(detect(0, [false]), { down: [], up: [0] });
  assert.deepEqual(detect(0, [true]), { down: [0], up: [] });
});

test("handles several buttons and keeps pads independent", () => {
  const detect = createEdgeDetector();
  assert.deepEqual(detect(0, [true, false, true]).down, [0, 2]);
  assert.deepEqual(detect(1, [false, true]).down, [1]);
  assert.deepEqual(detect(0, [true, true, false]), { down: [1], up: [2] });
});

test("treats buttons that disappear as released", () => {
  const detect = createEdgeDetector();
  detect(0, [false, true]);
  assert.deepEqual(detect(0, []), { down: [], up: [1] });
});

test("rejects invalid input", () => {
  const detect = createEdgeDetector();
  assert.throws(() => detect(0, "nope"), TypeError);
});

