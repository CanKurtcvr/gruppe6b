"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { SpeechRecognizer } = require("../src/recognition.js");

test("SpeechRecognizer handles environment without browser API gracefully", () => {
  const recognizer = new SpeechRecognizer("da-DK");
  assert.equal(recognizer.lang, "da-DK");
  assert.equal(recognizer.isListening, false);
  assert.equal(recognizer.isSupported, false);
  let errorMsg = "";
  recognizer.onError = (msg) => {
    errorMsg = msg;
  };
  const started = recognizer.start();
  assert.equal(started, false);
  assert.ok(errorMsg.includes("Chrome") || errorMsg.includes("understøttes"));
});

test("SpeechRecognizer toggle returns false when not supported", () => {
  const recognizer = new SpeechRecognizer();
  const res = recognizer.toggle();
  assert.equal(res, false);
});

