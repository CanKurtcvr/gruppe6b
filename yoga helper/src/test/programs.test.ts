import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("public/aifit/extras.js", "utf8");
const context = { URLSearchParams, location: { search: "" }, window: { location: { search: "" } } };
const env = runInNewContext(`${source}\n({ buildSession, PROGRAMS, STRETCH_LIBRARY, SUMMARY_TIPS, setCurrentProgram });`, context);

describe("Færdige programmer", () => {
  it("bruger kun øvelser, der findes i biblioteket", () => {
    const ids = new Set<string>(env.STRETCH_LIBRARY.map((s: { id: string }) => s.id));
    for (const prog of env.PROGRAMS) {
      for (const id of prog.exerciseIds) expect(ids.has(id), `${prog.id} mangler ${id}`).toBe(true);
    }
  });

  it("bygger runden præcis som programmets kuraterede rækkefølge", () => {
    for (const prog of env.PROGRAMS) {
      env.setCurrentProgram(prog.id);
      const session = env.buildSession("yoga", []);
      expect(session.map((s: { id: string }) => s.id)).toEqual(prog.exerciseIds);
      env.setCurrentProgram(null);
    }
  });

  it("holder røret, når man vælger siddende (programmer består kun af sidde-venlige øvelser)", () => {
    env.currentPosture = "sit";
    for (const prog of env.PROGRAMS) {
      env.setCurrentProgram(prog.id);
      const session = env.buildSession("yoga", []);
      expect(session.length).toBe(prog.exerciseIds.length);
      expect(session.every((s: { posture?: string }) => !s.posture || s.posture === "any" || s.posture === "sit")).toBe(true);
      env.setCurrentProgram(null);
    }
  });

  it("har mindst tre blide afslutningstips til afrundingsskærmen", () => {
    expect(env.SUMMARY_TIPS.length).toBeGreaterThanOrEqual(3);
  });
});
