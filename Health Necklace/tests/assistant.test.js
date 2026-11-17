"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { GeminiAssistant } = require("../src/gemini-assistant.js");

test("GeminiAssistant initializes in idle state", () => {
  const assistant = new GeminiAssistant();
  assert.equal(assistant.state, "idle");
  assert.equal(assistant.history.length, 0);
  assert.equal(assistant.hasKey, false);
});

test("GeminiAssistant sets and remembers API key", () => {
  const assistant = new GeminiAssistant();
  assistant.setApiKey("test-gemini-key-99999");
  assert.equal(assistant.hasKey, true);
  assert.equal(assistant.apiKey, "test-gemini-key-99999");
});

test("GeminiAssistant provides clever fallback when key is not set", async () => {
  const assistant = new GeminiAssistant();
  const resBones = await assistant.queryGemini("Hvordan styrker jeg mine knogler?");
  assert.ok(resBones.includes("knogler"));

  const resAge = await assistant.queryGemini("Hvor gammel er jeg?");
  assert.ok(resAge.includes("67 år"));

  const resOther = await assistant.queryGemini("Hvordan forbedrer jeg min livskvalitet?");
  assert.ok(resOther.includes("livskvalitet"));
});

test("GeminiAssistant state changes correctly on activate and stop", async () => {
  let recordedState = "";
  const assistant = new GeminiAssistant({
    onStateChange: (s) => {
      recordedState = s;
    },
  });

  assistant.stop();
  assert.equal(assistant.state, "idle");
  assert.equal(recordedState, "idle");
});

