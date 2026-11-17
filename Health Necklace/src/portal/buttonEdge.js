/**
 * Button edge detection (pure logic, no browser APIs).
 *
 * Turns a stream of "is this button held right now?" snapshots into discrete
 * press (down) and release (up) events, so one physical press = one event,
 * no matter how many frames the button is held.
 *
 * Works in the browser (global `createEdgeDetector`) and in Node (for tests).
 */
(function (root) {
  "use strict";

  /**
   * @returns {(key: string|number, pressed: boolean[]) => {down: number[], up: number[]}}
   */
  function createEdgeDetector() {
    /** @type {Map<string|number, boolean[]>} */
    const previous = new Map();

    return function detect(key, pressed) {
      if (!Array.isArray(pressed)) {
        throw new TypeError("pressed must be an array of booleans");
      }
      const before = previous.get(key) || [];
      const length = Math.max(before.length, pressed.length);
      const down = [];
      const up = [];

      for (let i = 0; i < length; i++) {
        const now = Boolean(pressed[i]);
        const was = Boolean(before[i]);
        if (now && !was) down.push(i);
        if (!now && was) up.push(i);
      }

      previous.set(key, pressed.map(Boolean));
      return { down, up };
    };
  }

  root.createEdgeDetector = createEdgeDetector;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createEdgeDetector };
  }
})(typeof window !== "undefined" ? window : globalThis);

