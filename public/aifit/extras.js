// ---------------- Ai-fit extras: modes, strictness, calm voice, stretch library ----------------
// Loaded BEFORE Main.js. Main.js reads these globals.

// Strictness: multiplies every green/orange tolerance. Lower = stricter.
const STRICTNESS_LEVELS = [
  { id: "gentle", label: "Blid", factor: 1.15 },
  { id: "normal", label: "Normal", factor: 0.85 },
  { id: "strict", label: "Striks", factor: 0.62 },
];
let strictnessIndex = 1;
function strictFactor() {
  return STRICTNESS_LEVELS[strictnessIndex].factor;
}

// Hold-time options
const HOLD_OPTIONS = [15, 30, 45];
let holdOptionIndex = 0;

// Modes: full yoga flow, or stretches focused on where it hurts
const MODES = [
  { id: "yoga", label: "🧘 Yoga" },
  { id: "neck", label: "Nakke" },
  { id: "shoulders", label: "Skuldre" },
  { id: "back", label: "Ryg" },
  { id: "hips", label: "Hofter & ben" },
  { id: "all", label: "Hele kroppen" },
];
let currentModeIndex = 0;
let sessionPaused = false;
let ambientEnabled = false;

// Calm, wellness-style phrasing around corrections
const CALM_OPENERS = [
  "Helt roligt...",
  "Mærk efter...",
  "Blødt og stille...",
  "Uden hast...",
  "Med en rolig udånding...",
];
let calmOpenerIdx = 0;
function wellnessPhrase(text) {
  if (!text) return text;
  const opener = CALM_OPENERS[calmOpenerIdx++ % CALM_OPENERS.length];
  return `${opener} ${text}`;
}

const BREATH_CUES = [
  "Ånd ind gennem næsen... og ånd langsomt ud.",
  "Lad skuldrene synke... og blødgør ansigtet.",
  "Mærk fødderne mod gulvet... og træk vejret dybt.",
  "Hver udånding gør dig lidt blødere.",
];
let breathIdx = 0;
function nextBreathCue() {
  return BREATH_CUES[breathIdx++ % BREATH_CUES.length];
}

// ---------------- Soft ambient drone (optional calm background sound) ----------------
let ambientNodes = null;
function setAmbient(on) {
  ambientEnabled = on;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!window.__aifitAmbientCtx) window.__aifitAmbientCtx = new AudioCtx();
    const ctx = window.__aifitAmbientCtx;
    if (ctx.state === "suspended") ctx.resume();
    if (on && !ambientNodes) {
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 3);
      master.connect(ctx.destination);
      const oscs = [108, 162, 216.5].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.6 : 0.25;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.06 + i * 0.03;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.18;
        lfo.connect(lfoGain).connect(g.gain);
        o.connect(g).connect(master);
        o.start();
        lfo.start();
        return [o, lfo];
      });
      ambientNodes = { master, oscs };
    } else if (!on && ambientNodes) {
      const { master, oscs } = ambientNodes;
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
      setTimeout(() => oscs.flat().forEach((o) => o.stop()), 1700);
      ambientNodes = null;
    }
  } catch {}
}

// ---------------- Generic stretch builder ----------------
// Each check returns { group, state, label, hint }.
function sideDir(pose) {
  // +1 if user's left side appears at larger x than right side
  return pose.left_shoulder.x >= pose.right_shoulder.x ? 1 : -1;
}

function pointCheck({ key, group, part, label, at, green = 0.4, orange = 0.8 }) {
  return (pose, m) => {
    const t = at(pose, m);
    const p = pose[key];
    const d = ptOK(p) ? dist2D(p, t) / m.shoulderWidth : 9;
    const state = gradeError(d, green, orange);
    return {
      group,
      state,
      label,
      hint: getDirectionalAdvice(p, t.x, t.y, part, m, state),
      target: { ...t, r: m.shoulderWidth * green * strictFactor(), label },
    };
  };
}

function levelShouldersCheck(label = "Skuldrene i ro og i vater") {
  return (pose, m) => {
    const state = gradeError(m.shoulderTilt / m.shoulderWidth, 0.12, 0.24);
    const hint =
      pose.left_shoulder.y < pose.right_shoulder.y
        ? "Lad venstre skulder synke blødt ned, så skuldrene er i vater."
        : "Lad højre skulder synke blødt ned, så skuldrene er i vater.";
    return { group: "torso", state, label, hint };
  };
}

function headTiltCheck(side) {
  // side: "left" means left ear toward left shoulder (left eye lower)
  return (pose, m) => {
    const le = pose.left_eye;
    const re = pose.right_eye;
    if (!ptOK(le) || !ptOK(re)) {
      return {
        group: "torso",
        state: "red",
        label: "Hovedet synligt for kameraet",
        hint: "Vend ansigtet roligt mod kameraet.",
      };
    }
    const tilt = ((side === "left" ? le.y - re.y : re.y - le.y) / m.shoulderWidth);
    const state = gradeError(Math.max(0, 0.2 - tilt), 0.0, 0.1);
    const word = side === "left" ? "venstre" : "højre";
    return {
      group: "torso",
      state,
      label: `Øret blødt ned mod ${word} skulder`,
      hint:
        tilt < 0
          ? `Du vipper den forkerte vej... lad i stedet ${word} øre synke mod ${word} skulder.`
          : `Lad ${word} øre synke lidt længere ned mod ${word} skulder.`,
    };
  };
}

function sideBendCheck(side) {
  return (pose, m) => {
    const d = sideDir(pose) * (side === "left" ? 1 : -1);
    const shift = ((m.shoulderMid.x - m.hipMid.x) * d) / m.shoulderWidth;
    const state = gradeError(Math.max(0, 0.32 - shift), 0.0, 0.16);
    const word = side === "left" ? "venstre" : "højre";
    return {
      group: "torso",
      state,
      label: `Overkroppen bøjer blødt mod ${word}`,
      hint: `Bøj overkroppen lidt mere mod ${word}, og hold hofterne stille.`,
    };
  };
}

function kneeLiftCheck(side) {
  return (pose, m) => {
    const hip = pose[`${side}_hip`];
    const knee = pose[`${side}_knee`];
    const word = side === "left" ? "venstre" : "højre";
    if (!ptOK(hip) || !ptOK(knee)) {
      return {
        group: side === "left" ? "leftLeg" : "rightLeg",
        state: "red",
        label: `Løft ${word} knæ mod hoften`,
        hint: "Træd et skridt tilbage, så hele benet kan ses.",
      };
    }
    const gap = (knee.y - hip.y) / m.torsoLength;
    const state = gradeError(Math.max(0, gap - 0.15), 0.0, 0.25);
    return {
      group: side === "left" ? "leftLeg" : "rightLeg",
      state,
      label: `Løft ${word} knæ op mod hoftehøjde`,
      hint: `Løft ${word} knæ lidt højere op mod hoften... støt dig gerne til en stol.`,
    };
  };
}

function makeStretch(def) {
  return {
    ...def,
    isStretch: true,
    getTargetZones(m, pose) {
      if (!pose) return [];
      return def.checks
        .map((c) => c(pose, m).target)
        .filter(Boolean);
    },
    evaluate(pose, m) {
      const results = def.checks.map((c) => c(pose, m));
      const limbStates = {
        torso: "green",
        leftArm: "green",
        rightArm: "green",
        leftLeg: "green",
        rightLeg: "green",
      };
      for (const r of results) {
        limbStates[r.group] = worstGrade(limbStates[r.group], r.state);
      }
      const guidelines = results.map((r) => ({
        label: r.label,
        state: r.state,
        passed: r.state === "green",
        voiceHint: r.hint,
      }));
      const allGreen = guidelines.every((g) => g.state === "green");
      const next =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");
      return {
        matched: allGreen,
        limbStates,
        guidelines,
        hint: allGreen ? def.greenHint || "Smukt... bliv her og træk vejret roligt." : next.voiceHint,
      };
    },
  };
}

// Target helpers
const overheadLeft = (pose, m) => ({
  x: m.shoulderMid.x + sideDir(pose) * m.shoulderWidth * 0.18,
  y: m.shoulderMid.y - m.torsoLength * 0.95,
});
const overheadRight = (pose, m) => ({
  x: m.shoulderMid.x - sideDir(pose) * m.shoulderWidth * 0.18,
  y: m.shoulderMid.y - m.torsoLength * 0.95,
});

const STRETCH_LIBRARY = [
  makeStretch({
    id: "s-neck-left",
    areas: ["neck"],
    emoji: "🙇",
    img: "stretch-neck-left.jpg",
    name: "Nakkestræk mod venstre",
    subtitle: "Blødgør nakke & skuldre",
    instruction:
      "Sid eller stå rankt. Lad venstre øre synke langsomt ned mod venstre skulder, mens højre skulder bliver tung og afslappet.",
    voiceIntro:
      "Sid eller stå rankt. Lad venstre øre synke langsomt ned mod venstre skulder... og lad højre skulder blive tung.",
    checks: [headTiltCheck("left"), levelShouldersCheck("Skuldrene bliver nede og i ro")],
  }),
  makeStretch({
    id: "s-neck-right",
    areas: ["neck"],
    emoji: "🙇",
    img: "stretch-neck-right.jpg",
    name: "Nakkestræk mod højre",
    subtitle: "Blødgør nakke & skuldre",
    instruction:
      "Lad højre øre synke langsomt ned mod højre skulder, mens venstre skulder bliver tung og afslappet.",
    voiceIntro:
      "Nu den anden side. Lad højre øre synke langsomt ned mod højre skulder... og slip spændingen i venstre side.",
    checks: [headTiltCheck("right"), levelShouldersCheck("Skuldrene bliver nede og i ro")],
  }),
  makeStretch({
    id: "s-cross-right",
    areas: ["shoulders", "neck"],
    emoji: "🤗",
    img: "stretch-cross-right.jpg",
    name: "Armkryds — højre arm",
    subtitle: "Skulderens bagside",
    instruction:
      "Før højre arm vandret ind over brystet mod venstre skulder. Hold armen blødt med venstre hånd.",
    voiceIntro:
      "Før din højre arm roligt ind over brystet, i skulderhøjde... og lad venstre hånd støtte den.",
    checks: [
      pointCheck({
        key: "right_wrist",
        group: "rightArm",
        part: "højre hånd",
        label: "Højre hånd forbi venstre skulder",
        at: (pose, m) => ({
          x: pose.left_shoulder.x + sideDir(pose) * m.shoulderWidth * 0.45,
          y: m.shoulderMid.y + m.torsoLength * 0.08,
        }),
        green: 0.42,
        orange: 0.85,
      }),
      levelShouldersCheck(),
    ],
  }),
  makeStretch({
    id: "s-cross-left",
    areas: ["shoulders", "neck"],
    emoji: "🤗",
    img: "stretch-cross-left.jpg",
    name: "Armkryds — venstre arm",
    subtitle: "Skulderens bagside",
    instruction:
      "Før venstre arm vandret ind over brystet mod højre skulder. Hold armen blødt med højre hånd.",
    voiceIntro:
      "Nu venstre arm. Før den roligt ind over brystet i skulderhøjde... og støt med højre hånd.",
    checks: [
      pointCheck({
        key: "left_wrist",
        group: "leftArm",
        part: "venstre hånd",
        label: "Venstre hånd forbi højre skulder",
        at: (pose, m) => ({
          x: pose.right_shoulder.x - sideDir(pose) * m.shoulderWidth * 0.45,
          y: m.shoulderMid.y + m.torsoLength * 0.08,
        }),
        green: 0.42,
        orange: 0.85,
      }),
      levelShouldersCheck(),
    ],
  }),
  makeStretch({
    id: "s-t-open",
    areas: ["shoulders", "back"],
    emoji: "🕊️",
    img: "stretch-t-open.jpg",
    name: "Bryståbner (arme ud til siden)",
    subtitle: "Åbner bryst & øvre ryg",
    instruction:
      "Stræk begge arme ud til siden i skulderhøjde, som vinger. Pres skulderbladene blødt sammen.",
    voiceIntro:
      "Stræk armene ud til siden, som store rolige vinger, i skulderhøjde... og åbn brystet.",
    checks: [
      pointCheck({
        key: "left_wrist",
        group: "leftArm",
        part: "venstre hånd",
        label: "Venstre arm vandret ud til siden",
        at: (pose, m) => ({
          x: pose.left_shoulder.x + sideDir(pose) * m.shoulderWidth * 1.5,
          y: pose.left_shoulder.y,
        }),
        green: 0.45,
        orange: 0.9,
      }),
      pointCheck({
        key: "right_wrist",
        group: "rightArm",
        part: "højre hånd",
        label: "Højre arm vandret ud til siden",
        at: (pose, m) => ({
          x: pose.right_shoulder.x - sideDir(pose) * m.shoulderWidth * 1.5,
          y: pose.right_shoulder.y,
        }),
        green: 0.45,
        orange: 0.9,
      }),
      levelShouldersCheck(),
    ],
  }),
  makeStretch({
    id: "s-overhead",
    areas: ["shoulders", "back"],
    emoji: "🙆",
    img: "stretch-overhead.jpg",
    name: "Stræk mod himlen",
    subtitle: "Forlænger ryg & skuldre",
    instruction:
      "Før begge arme op over hovedet, med hænderne tæt sammen. Bliv lang i ryggen og hold skuldrene væk fra ørerne.",
    voiceIntro:
      "Før begge arme langsomt op over hovedet... hænderne tæt sammen... og bliv lang i hele ryggen.",
    checks: [
      pointCheck({
        key: "left_wrist",
        group: "leftArm",
        part: "venstre hånd",
        label: "Venstre hånd højt over hovedet",
        at: overheadLeft,
        green: 0.45,
        orange: 0.9,
      }),
      pointCheck({
        key: "right_wrist",
        group: "rightArm",
        part: "højre hånd",
        label: "Højre hånd højt over hovedet",
        at: overheadRight,
        green: 0.45,
        orange: 0.9,
      }),
      levelShouldersCheck(),
    ],
  }),
  makeStretch({
    id: "s-side-left",
    areas: ["back"],
    emoji: "🌙",
    img: "stretch-side-left.jpg",
    name: "Sidebøjning mod venstre",
    subtitle: "Lænd & flanke",
    instruction:
      "Før højre arm op over hovedet og bøj overkroppen blødt mod venstre, som en halvmåne. Hofterne bliver stille.",
    voiceIntro:
      "Før højre arm op over hovedet... og bøj dig blødt mod venstre, som en rolig halvmåne.",
    checks: [
      pointCheck({
        key: "right_wrist",
        group: "rightArm",
        part: "højre hånd",
        label: "Højre arm i en bue over hovedet",
        at: (pose, m) => ({
          x: m.shoulderMid.x + sideDir(pose) * m.shoulderWidth * 0.55,
          y: m.shoulderMid.y - m.torsoLength * 0.7,
        }),
        green: 0.5,
        orange: 0.95,
      }),
      sideBendCheck("left"),
    ],
  }),
  makeStretch({
    id: "s-side-right",
    areas: ["back"],
    emoji: "🌙",
    img: "stretch-side-right.jpg",
    name: "Sidebøjning mod højre",
    subtitle: "Lænd & flanke",
    instruction:
      "Før venstre arm op over hovedet og bøj overkroppen blødt mod højre. Hofterne bliver stille.",
    voiceIntro:
      "Nu den anden side. Venstre arm op over hovedet... og bøj dig blødt mod højre.",
    checks: [
      pointCheck({
        key: "left_wrist",
        group: "leftArm",
        part: "venstre hånd",
        label: "Venstre arm i en bue over hovedet",
        at: (pose, m) => ({
          x: m.shoulderMid.x - sideDir(pose) * m.shoulderWidth * 0.55,
          y: m.shoulderMid.y - m.torsoLength * 0.7,
        }),
        green: 0.5,
        orange: 0.95,
      }),
      sideBendCheck("right"),
    ],
  }),
  makeStretch({
    id: "s-knee-left",
    areas: ["hips"],
    emoji: "🦵",
    img: "stretch-knee-left.jpg",
    name: "Knæløft — venstre",
    subtitle: "Hofte & lår (støt dig gerne til en stol)",
    instruction:
      "Stå rankt og løft venstre knæ op mod hoftehøjde. Støt dig gerne til en stol eller væg.",
    voiceIntro:
      "Stå rankt, støt dig gerne til en stol... og løft venstre knæ roligt op mod hoften.",
    checks: [kneeLiftCheck("left"), levelShouldersCheck("Overkroppen rank og rolig")],
  }),
  makeStretch({
    id: "s-knee-right",
    areas: ["hips"],
    emoji: "🦵",
    img: "stretch-knee-right.jpg",
    name: "Knæløft — højre",
    subtitle: "Hofte & lår (støt dig gerne til en stol)",
    instruction:
      "Stå rankt og løft højre knæ op mod hoftehøjde. Støt dig gerne til en stol eller væg.",
    voiceIntro: "Nu højre side... løft højre knæ roligt op mod hoften.",
    checks: [kneeLiftCheck("right"), levelShouldersCheck("Overkroppen rank og rolig")],
  }),
];

function buildSession(modeId, yogaLibrary) {
  if (modeId === "yoga") return yogaLibrary;
  if (modeId === "all") return STRETCH_LIBRARY;
  return STRETCH_LIBRARY.filter((s) => s.areas.includes(modeId));
}
