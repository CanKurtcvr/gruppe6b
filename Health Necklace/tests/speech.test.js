"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { SpeechController } = require("../src/speech.js");

test("SpeechController initializes with sensible defaults", () => {
  const controller = new SpeechController();
  assert.equal(controller.isPlaying, false);
  assert.equal(controller.rate, 1.0);
  assert.equal(controller.pitch, 1.0);
  assert.equal(controller.currentText, "");
});

test("SpeechController ignores empty or whitespace-only text", async () => {
  const controller = new SpeechController();
  assert.equal(await controller.speak(""), false);
  assert.equal(await controller.speak("   "), false);
  assert.equal(await controller.speak(null), false);
});

test("SpeechController sets current text and duration estimation", async () => {
  const controller = new SpeechController();
  await controller.speak("Hej verden!");
  assert.equal(controller.currentText, "Hej verden!");
  assert.ok(controller.estimatedDuration > 1000);
});

test("SpeechController stop resets playing state", async () => {
  const controller = new SpeechController();
  await controller.speak("Test");
  controller.stop();
  assert.equal(controller.isPlaying, false);
});
