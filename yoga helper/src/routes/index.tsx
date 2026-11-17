import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DIFFICULTY_OPTIONS,
  INTRO_STEPS,
  POSTURE_OPTIONS,
  PROGRAM_OPTIONS,
  type SelectOption,
} from "../data/home-options";

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

interface OptionGroupProps<T extends string | number | null> {
  heading: string;
  options: SelectOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  headingClassName?: string;
}

function OptionGroup<T extends string | number | null>({
  heading,
  options,
  selected,
  onSelect,
  headingClassName = "text-xl font-medium mt-6",
}: OptionGroupProps<T>) {
  return (
    <>
      <h2 className={headingClassName}>{heading}</h2>
      <div className="flex flex-wrap gap-3 mt-3">
        {options.map((opt) => (
          <button
            key={String(opt.id ?? "free")}
            onClick={() => onSelect(opt.id)}
            aria-pressed={selected === opt.id}
            className={`rounded-2xl px-6 py-4 text-left text-lg transition ${
              selected === opt.id ? "bg-intro-accent text-foreground" : "bg-intro-card"
            }`}
          >
            <div className="font-medium">{opt.label}</div>
            <div className="text-sm opacity-80">{opt.sub}</div>
          </button>
        ))}
      </div>
    </>
  );
}

function Index() {
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState(2);
  const [pos, setPos] = useState<"sit" | "stand">("stand");
  const [prog, setProg] = useState<string | null>(null);

  if (started) {
    return (
      <iframe
        src={`/aifit/index.html?level=${level}&pos=${pos}${prog ? `&prog=${prog}` : ""}`}
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
          {INTRO_STEPS.map((s) => (
            <div key={s.title} className="bg-intro-card rounded-2xl p-5">
              <div className="text-2xl">{s.icon}</div>
              <h2 className="text-lg font-medium mt-2">{s.title}</h2>
              <p className="text-intro-muted text-base mt-1">{s.text}</p>
            </div>
          ))}
        </div>

        <OptionGroup
          heading="Hvor svært skal det være?"
          headingClassName="text-xl font-medium mt-8"
          options={DIFFICULTY_OPTIONS}
          selected={level}
          onSelect={setLevel}
        />

        <OptionGroup
          heading="Vil du sidde eller stå?"
          options={POSTURE_OPTIONS}
          selected={pos}
          onSelect={setPos}
        />

        <OptionGroup
          heading="Færdigt program?"
          options={PROGRAM_OPTIONS}
          selected={prog}
          onSelect={setProg}
        />

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
