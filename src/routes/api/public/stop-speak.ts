import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stop-speak")({
  server: {
    handlers: {
      GET: async () => Response.json({ stopped: true }),
    },
  },
});
