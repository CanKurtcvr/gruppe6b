import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ai-fit — Guided yoga with live pose feedback" },
      {
        name: "description",
        content: "Follow calm yoga poses with live camera body tracking and Danish voice guidance.",
      },
      { property: "og:title", content: "Ai-fit — Guided yoga with live pose feedback" },
      {
        property: "og:description",
        content: "Follow calm yoga poses with live camera body tracking and Danish voice guidance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/aifit/index.html"
      title="Ai-fit"
      allow="camera; microphone; autoplay; fullscreen"
      className="fixed inset-0 h-screen w-screen border-0 bg-background"
    />
  );
}
