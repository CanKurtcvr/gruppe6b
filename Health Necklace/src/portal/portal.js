/**
 * portal/portal.js — small helpers the sketch expects:
 *   pSetup(), loadScript(src), fullScreenToggle()
 *
 * Each helper is only defined if it doesn't already exist, so this file
 * won't override a course-provided "portal" library.
 */
(function (global) {
  "use strict";

  if (typeof global.pSetup !== "function") {
    global.pSetup = async function pSetup() {
      // Place for shared setup. Nothing required for this project.
    };
  }

  if (typeof global.loadScript !== "function") {
    const loaded = new Map();
    global.loadScript = function loadScript(src) {
      if (typeof src !== "string" || !/^[\w./-]+\.js$/.test(src) || src.includes("..")) {
        return Promise.reject(new Error(`loadScript: refusing unsafe path "${src}"`));
      }
      if (loaded.has(src)) return loaded.get(src);
      const promise = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`loadScript: failed to load ${src}`));
        document.head.appendChild(el);
      });
      loaded.set(src, promise);
      return promise;
    };
  }

  if (typeof global.fullScreenToggle !== "function") {
    global.fullScreenToggle = function fullScreenToggle() {
      fullscreen(!fullscreen());
    };
  }
})(window);

