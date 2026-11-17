import { createFileRoute } from "@tanstack/react-router";

// Google AI Studio API keys with automatic rotation when usage/quota is reached on a key.
export const GEMINI_API_KEYS = [
  "AQ.Ab8RN6LZb6SGLezrwR2sN_rayqSXTRn932SLyhYVv7-Hgd7o0w",
  "AQ.Ab8RN6IDgnrGlQiLw_hV3FAcbYgjQ2juxtBLLkTGyd-0muAUmw",
  "AIzaSyBiqw_NJro6hKM8aoWHV_lP3xWp9382cSA",
];

// Supported Gemini 3.8 TTS models (each has its own quota bucket per key in Google AI Studio).
export const GEMINI_TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"] as const;

// Calm, warm female voice that speaks natural Danish.
export const DANISH_CALM_FEMALE_VOICE = "Sulafat";
export const DANISH_YOGA_VOICE_STYLE =
  "Calm, warm, gentle and soothing female Danish yoga and mindfulness instructor. Speak naturally in clear Danish (da-DK) at a relaxed, unhurried pace.";

interface AudioPayload {
  data: Uint8Array;
  contentType: string;
}

const audioCache = new Map<string, AudioPayload>();
const MAX_CACHE_ENTRIES = 250;
const inflightRequests = new Map<string, Promise<AudioPayload>>();

let activeKeyIndex = 0;

export function resetTtsRotationState(): void {
  activeKeyIndex = 0;
  audioCache.clear();
  inflightRequests.clear();
}

export function getActiveKeyIndex(): number {
  return activeKeyIndex;
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function requestGeminiTtsWithKey(
  text: string,
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AudioPayload> {
  const response = await fetchImpl(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text,
                annotations: [
                  {
                    type: "speech_metadata",
                    style: DANISH_YOGA_VOICE_STYLE,
                  },
                ],
              },
            ],
          },
        ],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice: DANISH_CALM_FEMALE_VOICE }],
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Gemini TTS HTTP ${response.status} (${model}): ${errText.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    steps?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        data?: string;
        mime_type?: string;
      }>;
    }>;
  };

  for (const step of payload.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type === "audio" && part.data) {
        return {
          data: base64ToUint8Array(part.data),
          contentType: part.mime_type || "audio/wav",
        };
      }
    }
  }

  throw new Error(`Gemini TTS returned no audio data (${model})`);
}

/**
 * Generates Danish speech using the configured Google AI Studio API keys,
 * automatically rotating to the next key (and fallback TTS model) when usage/quota is reached.
 */
export async function synthesizeDanishSpeechWithKeyRotation(
  text: string,
  options: {
    keys?: string[];
    models?: readonly string[];
    fetchImpl?: typeof fetch;
    useCache?: boolean;
  } = {},
): Promise<AudioPayload> {
  const keys = options.keys?.length ? options.keys : GEMINI_API_KEYS;
  const models = options.models?.length ? options.models : GEMINI_TTS_MODELS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const useCache = options.useCache ?? true;

  if (useCache && audioCache.has(text)) {
    return audioCache.get(text)!;
  }

  if (useCache && inflightRequests.has(text)) {
    return inflightRequests.get(text)!;
  }

  const run = async (): Promise<AudioPayload> => {
    let lastError: unknown = new Error("No Gemini API keys configured");
    const startKeyIdx = activeKeyIndex % keys.length;

    // Try each model across all keys, starting from the currently active key index.
    // Rotating keys in the inner loop ensures that as soon as key N reaches usage limit,
    // we immediately switch to key N+1.
    for (const model of models) {
      for (let offset = 0; offset < keys.length; offset++) {
        const keyIdx = (startKeyIdx + offset) % keys.length;
        const apiKey = keys[keyIdx];
        try {
          const result = await requestGeminiTtsWithKey(text, apiKey, model, fetchImpl);
          activeKeyIndex = keyIdx;
          if (useCache) {
            if (audioCache.size >= MAX_CACHE_ENTRIES) {
              const oldestKey = audioCache.keys().next().value;
              if (oldestKey !== undefined) audioCache.delete(oldestKey);
            }
            audioCache.set(text, result);
          }
          return result;
        } catch (err) {
          lastError = err;
          // Advance activeKeyIndex so the next call starts with the next key in line
          activeKeyIndex = (keyIdx + 1) % keys.length;
        }
      }
    }

    throw lastError;
  };

  if (!useCache) {
    return run();
  }

  const promise = run().finally(() => {
    inflightRequests.delete(text);
  });
  inflightRequests.set(text, promise);
  return promise;
}

// Proxies Google Translate's Danish voice as a last-resort fallback if all keys are exhausted.
function chunk(text: string, max = 180): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of text.trim().split(/(?<=[.!?])\s+/)) {
    if (!s) continue;
    if ((cur + " " + s).trim().length <= max) cur = (cur + " " + s).trim();
    else {
      if (cur) out.push(cur);
      if (s.length <= max) cur = s;
      else {
        out.push(s.slice(0, max));
        cur = "";
      }
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [text.slice(0, max)];
}

export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const text = (new URL(request.url).searchParams.get("text") || "").slice(0, 600).trim();
        if (!text) {
          return Response.json({ error: "Empty text" }, { status: 400 });
        }

        // 1. Primary: Google AI Studio Gemini 3.8 TTS with automatic 3-key rotation
        try {
          const audio = await synthesizeDanishSpeechWithKeyRotation(text);
          return new Response(audio.data, {
            headers: {
              "Content-Type": audio.contentType,
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch (e) {
          console.error("Google AI Studio TTS keys exhausted or failed:", e);
        }

        // 2. Secondary fallback: Lovable AI gateway (if available in environment)
        try {
          const { generateSpeech } = await import("@lovable.dev/ai-gateway");
          const audio = await generateSpeech({
            model: "google/gemini-3.1-flash-tts-preview",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Læs op på dansk med en varm, blid og rolig stemme som en nærværende yogalærer. Tal naturligt og afslappet, med små pauser ved prikkerne: ${text}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: DANISH_CALM_FEMALE_VOICE },
                },
              },
            },
          });
          return audio.toResponse({
            headers: {
              "Content-Type": audio.contentType,
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch (e) {
          console.error("AI gateway voice failed, using fallback", e);
        }

        // 3. Final fallback: Google Translate Danish TTS
        try {
          const parts: Uint8Array[] = [];
          for (const c of chunk(text)) {
            const r = await fetch(
              `https://translate.google.com/translate_tts?ie=UTF-8&tl=da&client=tw-ob&q=${encodeURIComponent(c)}`,
              {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                  Referer: "https://translate.google.com/",
                },
              },
            );
            if (!r.ok) throw new Error(`TTS status ${r.status}`);
            parts.push(new Uint8Array(await r.arrayBuffer()));
          }
          const total = parts.reduce((n, p) => n + p.length, 0);
          const buf = new Uint8Array(total);
          let o = 0;
          for (const p of parts) {
            buf.set(p, o);
            o += p.length;
          }
          return new Response(buf, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 502 });
        }
      },
    },
  },
});
