import { createFileRoute } from "@tanstack/react-router";

// Proxies Google Translate's Danish voice so the browser can play natural speech.
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
        if (!text) return Response.json({ error: "Empty text" }, { status: 400 });
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
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Sulafat" } } },
            },
          });
          return audio.toResponse({
            headers: { "Content-Type": audio.contentType, "Cache-Control": "public, max-age=86400" },
          });
        } catch (e) {
          console.error("AI voice failed, using fallback", e);
        }
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
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600" },
          });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 502 });
        }
      },
    },
  },
});
