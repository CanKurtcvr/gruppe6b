import { beforeEach, describe, expect, it } from "vitest";
import {
  DANISH_CALM_FEMALE_VOICE,
  GEMINI_API_KEYS,
  getActiveKeyIndex,
  resetTtsRotationState,
  synthesizeDanishSpeechWithKeyRotation,
} from "../routes/api/public/tts";

describe("Google AI Studio TTS key rotation", () => {
  beforeEach(() => {
    resetTtsRotationState();
  });

  it("har alle 3 Google AI Studio API-nøgler og en rolig kvindelig stemme konfigureret", () => {
    expect(GEMINI_API_KEYS).toEqual([
      "AQ.Ab8RN6LZb6SGLezrwR2sN_rayqSXTRn932SLyhYVv7-Hgd7o0w",
      "AQ.Ab8RN6IDgnrGlQiLw_hV3FAcbYgjQ2juxtBLLkTGyd-0muAUmw",
      "AIzaSyBiqw_NJro6hKM8aoWHV_lP3xWp9382cSA",
    ]);
    expect(DANISH_CALM_FEMALE_VOICE).toBe("Sulafat");
  });

  it("skifter automatisk til næste API-nøgle når usage/quota (429) er nået og husker den aktive nøgle", async () => {
    const usedKeys: string[] = [];
    const exhaustedKeys = new Set<string>([GEMINI_API_KEYS[0]]);

    const mockFetch: typeof fetch = async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      const key = headers["x-goog-api-key"];
      usedKeys.push(key);

      if (exhaustedKeys.has(key)) {
        return new Response(
          JSON.stringify({
            error: { code: 429, status: "RESOURCE_EXHAUSTED" },
          }),
          { status: 429 },
        );
      }

      return new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [
                {
                  type: "audio",
                  mime_type: "audio/wav",
                  data: Buffer.from("RIFF-mock-wav").toString("base64"),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    // First call: Key 0 fails with 429 -> rotates to Key 1 and succeeds
    const res1 = await synthesizeDanishSpeechWithKeyRotation("Ånd roligt ind.", {
      fetchImpl: mockFetch,
      useCache: false,
    });
    expect(res1.contentType).toBe("audio/wav");
    expect(usedKeys).toEqual([GEMINI_API_KEYS[0], GEMINI_API_KEYS[1]]);
    expect(getActiveKeyIndex()).toBe(1);

    // Second call: Starts directly on Key 1 (active key), and when Key 1 is now exhausted, rotates to Key 2
    usedKeys.length = 0;
    exhaustedKeys.add(GEMINI_API_KEYS[1]);
    const res2 = await synthesizeDanishSpeechWithKeyRotation("Og ånd langsomt ud.", {
      fetchImpl: mockFetch,
      useCache: false,
    });
    expect(res2.contentType).toBe("audio/wav");
    expect(usedKeys).toEqual([GEMINI_API_KEYS[1], GEMINI_API_KEYS[2]]);
    expect(getActiveKeyIndex()).toBe(2);
  });

  it("fejler først når alle 3 API-nøgler er opbrugt", async () => {
    const mockFetch: typeof fetch = async () => new Response("Quota exceeded", { status: 429 });

    await expect(
      synthesizeDanishSpeechWithKeyRotation("Test", {
        fetchImpl: mockFetch,
        models: ["gemini-3.8-flash-lite-tts"],
        useCache: false,
      }),
    ).rejects.toThrow(/429/);
  });
});
