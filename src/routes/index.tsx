import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hjemme Øvelser — yoga og udstrækning med live feedback" },
      {
        name: "description",
        content: "Rolig yoga og udstrækning hjemme med kamera-feedback og dansk stemmeguide.",
      },
      { property: "og:title", content: "Hjemme Øvelser — yoga og udstrækning med live feedback" },
      {
        property: "og:description",
        content: "Rolig yoga og udstrækning hjemme med kamera-feedback og dansk stemmeguide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STEPS = [
  { icon: "📷", title: "Tillad kamera", text: "Kameraet ser dine bevægelser. Intet bliver gemt eller sendt videre." },
  { icon: "📏", title: "Find afstanden", text: "Stil dig 2–3 meter væk, så hele kroppen er med. Stemmen siger til, når det passer." },
  { icon: "🌸", title: "Følg farverne", text: "Rød, orange og grøn viser, hvilke dele af kroppen der sidder rigtigt." },
  { icon: "🗣", title: "Lyt til guiden", text: "En rolig stemme hjælper dig over i den rigtige stilling." },
];

function Index() {
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState(2);
  const [pos, setPos] = useState<"sit" | "stand">("stand");

  if (started) {
    return (
      <iframe
        src={`/aifit/index.html?level=${level}&pos=${pos}`}
        title="Hjemme Øvelser"
        allow="camera; microphone; autoplay; fullscreen"
        className="fixed inset-0 h-screen w-screen border-0 bg-background"
      />
    );
  }

  return (
    <main className="bg-intro text-intro min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <img src="/icon-192.png" alt="" width={72} height={72} className="rounded-2xl mb-6" />
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">Hjemme Øvelser</h1>
        <p className="text-intro-muted mt-3 text-xl max-w-xl">
          Rolig yoga og udstrækning i din egen stue. Vælg hvor det gør ondt, og få blid vejledning undervejs.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-8">
          {STEPS.map((s) => (
            <div key={s.title} className="bg-intro-card rounded-2xl p-5">
              <div className="text-2xl">{s.icon}</div>
              <h2 className="text-lg font-medium mt-2">{s.title}</h2>
              <p className="text-intro-muted text-base mt-1">{s.text}</p>
            </div>
          ))}
        </div>
        <h2 className="text-xl font-medium mt-8">Hvor svært skal det være?</h2>
        <div className="flex flex-wrap gap-3 mt-3">
          {[
            [1, "Let", "Blide øvelser"],
            [2, "Mellem", "Lidt mere udfordring"],
            [3, "Svær", "Balance og styrke"],
          ].map(([id, label, sub]) => (
            <button
              key={id}
              onClick={() => setLevel(id as number)}
              aria-pressed={level === id}
              className={`rounded-2xl px-6 py-4 text-left text-lg transition ${level === id ? "bg-intro-accent text-foreground" : "bg-intro-card"}`}
            >
              <div className="font-medium">{label}</div>
              <div className="text-sm opacity-80">{sub}</div>
            </button>
          ))}
        </div>
        <h2 className="text-xl font-medium mt-6">Vil du sidde eller stå?</h2>
        <div className="flex flex-wrap gap-3 mt-3">
          {(
            [
              ["sit", "🪑 Siddende", "På en stol"],
              ["stand", "🧍 Stående", "Med plads omkring dig"],
            ] as const
          ).map(([id, label, sub]) => (
            <button
              key={id}
              onClick={() => setPos(id)}
              aria-pressed={pos === id}
              className={`rounded-2xl px-6 py-4 text-left text-lg transition ${pos === id ? "bg-intro-accent text-foreground" : "bg-intro-card"}`}
            >
              <div className="font-medium">{label}</div>
              <div className="text-sm opacity-80">{sub}</div>
            </button>
          ))}
        </div>
        <button
          onClick={() => setStarted(true)}
          className="bg-intro-accent text-foreground mt-8 rounded-full px-10 py-5 text-xl font-medium transition hover:opacity-90"
        >
          Start træning
        </button>
        <p className="text-intro-muted text-xs mt-4">
          Tip: Tilføj siden til din hjemmeskærm for at bruge den som en app.
        </p>
      </div>
    </main>
  );
}
