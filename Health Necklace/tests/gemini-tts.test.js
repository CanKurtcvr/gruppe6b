"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { GeminiTTS } = require("../src/gemini-tts.js");

test("GeminiTTS initializes without key and reports hasKey false", () => {
  const tts = new GeminiTTS();
  assert.equal(tts.hasKey, false);
  assert.equal(tts.isPlaying, false);
});

test("GeminiTTS sets and remembers key", () => {
  const tts = new GeminiTTS();
  tts.setApiKey("test-dummy-gemini-key-12345");
  assert.equal(tts.hasKey, true);
  assert.equal(tts.apiKey, "test-dummy-gemini-key-12345");
});

test("GeminiTTS throws friendly Danish error if key is missing on synthesize", async () => {
  const tts = new GeminiTTS();
  tts.setApiKey("");
  await assert.rejects(
    async () => {
      await tts.synthesize("Du er 67 år gammel", "Puck");
    },
    (err) => {
      assert.ok(err.message.includes("Mangler gratis Gemini API"));
      return true;
    }
  );
});

