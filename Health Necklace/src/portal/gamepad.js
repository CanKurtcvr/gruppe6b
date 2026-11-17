/**
 * portal/gamepad.js — Gamepad helper for p5.js sketches.
 *
 * Exposes:
 *   gamePads                       Array of connected pads (updated every frame)
 *   gamePads[i].state["FACE_1"]    true while that button is held
 *   gamePads[i].state["BUTTON_3"]  generic name for button index 3
 *   gamePads[i].state["ANY"]       true while any button is held
 *   setupGamepad()                 start polling (call once in setup)
 *
 * Optional sketch callbacks (define them in sketch.js if you want them):
 *   gamepadButtonPressed(name, index, pad)
 *   gamepadButtonReleased(name, index, pad)
 *
 * Presses are detected every animation frame, so short taps are not missed
 * and holding a button fires `gamepadButtonPressed` only once.
 *
 * NOTE: Browsers only expose a gamepad after you press one of its buttons
 * while the page has focus.
 */
(function (global) {
  "use strict";

  // Standard Gamepad mapping names (same naming as gamecontroller.js).
  const BUTTON_NAMES = [
    "FACE_1", "FACE_2", "FACE_3", "FACE_4",
    "LEFT_TOP_SHOULDER", "RIGHT_TOP_SHOULDER",
    "LEFT_BOTTOM_SHOULDER", "RIGHT_BOTTOM_SHOULDER",
    "SELECT_BACK", "START_FORWARD",
    "LEFT_STICK", "RIGHT_STICK",
    "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT",
    "HOME",
  ];

  const PRESS_THRESHOLD = 0.5; // analog buttons count as pressed above this
  const detectEdges = global.createEdgeDetector();
  let running = false;

  global.gamePads = global.gamePads || [];

  function buttonName(index) {
    return BUTTON_NAMES[index] || "BUTTON_" + index;
  }

  function isPressed(button) {
    return Boolean(button && (button.pressed || button.value > PRESS_THRESHOLD));
  }

  function snapshot(pad) {
    const pressed = Array.from(pad.buttons, isPressed);
    const state = { ANY: pressed.some(Boolean) };
    pressed.forEach((isDown, i) => {
      state["BUTTON_" + i] = isDown;
      if (BUTTON_NAMES[i]) state[BUTTON_NAMES[i]] = isDown;
    });
    return {
      id: pad.id,
      index: pad.index,
      mapping: pad.mapping,
      axes: Array.from(pad.axes),
      pressed,
      state,
    };
  }

  function callSketch(fnName, ...args) {
    const fn = global[fnName];
    if (typeof fn === "function") {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[gamepad] ${fnName} threw:`, err);
      }
    }
  }

  function poll() {
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    const pads = Array.from(raw || []).filter(Boolean).map(snapshot);

    for (const pad of pads) {
      const { down, up } = detectEdges(pad.index, pad.pressed);
      down.forEach((i) => callSketch("gamepadButtonPressed", buttonName(i), i, pad));
      up.forEach((i) => callSketch("gamepadButtonReleased", buttonName(i), i, pad));
    }

    global.gamePads = pads;
    requestAnimationFrame(poll);
  }

  global.setupGamepad = async function setupGamepad() {
    if (running) return;
    if (!("getGamepads" in navigator)) {
      console.warn("[gamepad] Gamepad API not supported in this browser.");
      return;
    }
    running = true;
    window.addEventListener("gamepadconnected", (e) =>
      console.log(`[gamepad] connected #${e.gamepad.index}: ${e.gamepad.id}`)
    );
    window.addEventListener("gamepaddisconnected", (e) =>
      console.log(`[gamepad] disconnected #${e.gamepad.index}: ${e.gamepad.id}`)
    );
    requestAnimationFrame(poll);
  };

  global.gamepadButtonName = buttonName;
})(window);

