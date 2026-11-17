import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("public/aifit/extras.js", "utf8");
const context = { URLSearchParams, location: { search: "" }, window: { location: { search: "" } } };
const create = runInNewContext(`${source}\ncreateExercisePreparation;`, context);

describe("Exercise preparation", () => {
  it("waits for the introduction, then counts down from five seconds before activating", () => {
    const preparation = create();
    preparation.start();
    preparation.tick(10, { speaking: true });
    expect(preparation.phase).toBe("intro");
    preparation.tick(0, { speaking: false });
    expect(preparation.remaining).toBe(5);
    for (const remaining of [4, 3, 2, 1]) {
      preparation.tick(1);
      expect(preparation.remaining).toBe(remaining);
      expect(preparation.phase).toBe("countdown");
    }
    preparation.tick(1);
    expect(preparation.phase).toBe("active");
  });

  it("reintroduces every exercise when preparation is restarted", () => {
    const preparation = create();
    preparation.start();
    preparation.tick(0);
    preparation.tick(5);
    preparation.start();
    expect(preparation.phase).toBe("intro");
    expect(preparation.remaining).toBe(5);
  });

  it("rests 20 seconds between exercises before the next introduction", () => {
    const preparation = create();
    preparation.start(4, 20);
    expect(preparation.phase).toBe("rest");
    preparation.tick(19);
    expect(preparation.phase).toBe("rest");
    preparation.tick(1);
    expect(preparation.phase).toBe("intro");
  });

  it("keeps countdown paused and supplies reading time without voice", () => {
    const preparation = create();
    preparation.start(4);
    preparation.tick(3, { voice: false });
    expect(preparation.phase).toBe("intro");
    preparation.tick(1, { voice: false });
    preparation.tick(3, { paused: true });
    expect(preparation.remaining).toBe(5);
  });
});