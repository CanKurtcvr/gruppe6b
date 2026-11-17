export interface IntroStep {
  icon: string;
  title: string;
  text: string;
}

export interface SelectOption<T extends string | number | null> {
  id: T;
  label: string;
  sub: string;
}

export const INTRO_STEPS: IntroStep[] = [
  { icon: "📷", title: "Tillad kamera", text: "Kameraet ser dine bevægelser. Intet bliver gemt eller sendt videre." },
  { icon: "📏", title: "Find afstanden", text: "Stil dig 2–3 meter væk, så hele kroppen er med. Stemmen siger til, når det passer." },
  { icon: "🌸", title: "Følg farverne", text: "Rød, orange og grøn viser, hvilke dele af kroppen der sidder rigtigt." },
  { icon: "🗣", title: "Lyt til guiden", text: "En rolig stemme hjælper dig over i den rigtige stilling." },
];

export const DIFFICULTY_OPTIONS: SelectOption<number>[] = [
  { id: 1, label: "Let", sub: "Blide øvelser" },
  { id: 2, label: "Mellem", sub: "Lidt mere udfordring" },
  { id: 3, label: "Svær", sub: "Balance og styrke" },
];

export const POSTURE_OPTIONS: SelectOption<"sit" | "stand">[] = [
  { id: "sit", label: "🪑 Siddende", sub: "På en stol" },
  { id: "stand", label: "🧍 Stående", sub: "Med plads omkring dig" },
];

export const PROGRAM_OPTIONS: SelectOption<string | null>[] = [
  { id: null, label: "Fri træning", sub: "Vælg selv undervejs" },
  { id: "morgen", label: "🌅 Morgenrutine", sub: "Væk kroppen blidt" },
  { id: "aften", label: "🌙 Aftenro", sub: "Rolig afrunding på dagen" },
  { id: "skuldre", label: "💪 Skuldre & nakke", sub: "Løs spændinger i nakke og skuldre" },
];
