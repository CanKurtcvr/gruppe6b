import { createFileRoute } from "@tanstack/react-router";

// The original app played audio on the host Mac. In the cloud, we tell the
// browser to play the voice itself (via /api/public/tts).
export const Route = createFileRoute("/api/public/speak")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: false }, { headers: { "Cache-Control": "no-store" } }),
    },
  },
});
