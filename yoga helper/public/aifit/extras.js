// ---------------- Ai-fit extras: modes, strictness, calm voice, stretch library ----------------
// Loaded BEFORE Main.js. Main.js reads these globals.

// Strictness: multiplies every green/orange tolerance. Lower = stricter.
const STRICTNESS_LEVELS = [
  { id: "gentle", label: "Blid", factor: 1.7 },
  { id: "normal", label: "Mellem", factor: 1.3 },
  { id: "strict", label: "Striks", factor: 0.95 },
];
let strictnessIndex = 1;
function strictFactor() {
  return STRICTNESS_LEVELS[strictnessIndex].factor;
}

// Hold-time options
const HOLD_OPTIONS = [15, 30, 45];
// Pause between exercises (seconds) — the user asked for roughly 20–30 s.
const REST_SECONDS = 20;
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
  "Ganske nænsomt...",
  "Mærk efter...",
  "Blødt og stille...",
  "Uden hast...",
  "Med en blød udånding...",
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

// Preparation owns the exercise-start gate; no hold time runs before it finishes.
function createExercisePreparation() {
  return {
    phase: "loading",
    remaining: 5,
    introElapsed: 0,
    readingSeconds: 4,
    restRemaining: 0,
    start(readingSeconds = 4, restSeconds = 0) {
      this.phase = restSeconds > 0 ? "rest" : "intro";
      this.restRemaining = restSeconds;
      this.remaining = 5;
      this.introElapsed = 0;
      this.readingSeconds = readingSeconds;
    },
    skipRest() {
      if (this.phase === "rest") { this.restRemaining = 0; this.phase = "intro"; }
    },
    tick(dt, { paused = false, speaking = false, voice = true } = {}) {
      if (paused) return;
      if (this.phase === "rest") {
        this.restRemaining = Math.max(0, this.restRemaining - dt);
        if (this.restRemaining <= 0) this.phase = "intro";
      } else if (this.phase === "intro") {
        this.introElapsed += dt;
        if (voice ? !speaking : this.introElapsed >= this.readingSeconds) {
          this.phase = "countdown";
        }
      } else if (this.phase === "countdown") {
        this.remaining = Math.max(0, this.remaining - dt);
        if (this.remaining <= 0) this.phase = "active";
      }
    },
  };
}

// ---------------- Calm background music (generative, Web Audio) ----------------
// Soft pad chords + gentle bell notes in a pentatonic scale, slow and spacious.
let ambientNodes = null;
const DISTANCE_LEVELS = [
  { label: "Følsom", far: 0.11, edge: 0.06 },
  { label: "Mellem", far: 0.08, edge: 0.03 },
  { label: "Afslappet", far: 0.05, edge: 0.0 },
  { label: "Fra", far: 0, edge: -1, off: true },
];
let distanceLevelIndex = 1;
const TEXT_SIZES = [
  { label: "Stor", s: 1.25 },
  { label: "Ekstra stor", s: 1.6 },
  { label: "Ingen tekst", s: 1.25, hide: true },
];
let textSizeIndex = 0;
let musicVolume = 0.5;
let musicTheme = "calm"; // calm | forest | beach
let __noiseBuf = null;
function noiseBuffer(ctx) {
  if (__noiseBuf) return __noiseBuf;
  const b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  return (__noiseBuf = b);
}
function setMusicTheme(theme) {
  if (musicTheme === theme && ambientEnabled) return;
  musicTheme = theme;
  if (ambientNodes) setAmbient(false);
  setAmbient(true);
}
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
      master.gain.exponentialRampToValueAtTime(0.25 * musicVolume + 0.0001, ctx.currentTime + 4);
      // simple echo for space
      const delay = ctx.createDelay(); delay.delayTime.value = 0.45;
      const fb = ctx.createGain(); fb.gain.value = 0.35;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
      delay.connect(fb).connect(delay);
      master.connect(lp).connect(ctx.destination);
      lp.connect(delay); delay.connect(ctx.destination);
      const chords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
      const scale = [440, 493.88, 554.37, 659.25, 739.99, 880];
      let step = 0;
      const pad = (freqs, t, dur) => {
        freqs.forEach((f) => {
          [f, f * 1.003].forEach((ff) => {
            const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = ff / 2;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.4);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.1);
          });
        });
      };
      const bell = (f, t) => {
        const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        o.connect(g).connect(master); o.start(t); o.stop(t + 3.6);
      };
      const tick = () => {
        const t = ctx.currentTime + 0.1;
        pad(chords[step % chords.length], t, 9.5);
        for (let i = 0; i < 3; i++) if (Math.random() < 0.7) bell(scale[Math.floor(Math.random() * scale.length)], t + 1 + i * 2.6 + Math.random());
        step++;
      };
      let noiseSrc = null, noiseGain = null;
      if (musicTheme === "beach" || musicTheme === "forest") {
        noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuffer(ctx); noiseSrc.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = musicTheme === "beach" ? "lowpass" : "bandpass";
        f.frequency.value = musicTheme === "beach" ? 650 : 900;
        noiseGain = ctx.createGain(); noiseGain.gain.value = musicTheme === "beach" ? 0.05 : 0.04;
        noiseSrc.connect(f).connect(noiseGain).connect(master); noiseSrc.start();
      }
      const chirp = (t) => {
        const base = 2200 + Math.random() * 1800;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) {
          const o = ctx.createOscillator(); o.type = "sine";
          const g = ctx.createGain(); const tt = t + k * 0.13;
          o.frequency.setValueAtTime(base, tt);
          o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), tt + 0.08);
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.035, tt + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
          o.connect(g).connect(master); o.start(tt); o.stop(tt + 0.12);
        }
      };
      const themeTick = () => {
        const t = ctx.currentTime + 0.1;
        if (musicTheme === "beach" && noiseGain) {
          // two slow wave swells per 8s
          [0, 4].forEach((o) => {
            noiseGain.gain.setValueAtTime(0.04, t + o);
            noiseGain.gain.linearRampToValueAtTime(0.75, t + o + 1.8);
            noiseGain.gain.linearRampToValueAtTime(0.04, t + o + 3.9);
          });
        } else if (musicTheme === "forest") {
          for (let i = 0; i < 3; i++) if (Math.random() < 0.75) chirp(t + Math.random() * 7.5);
        }
      };
      tick(); themeTick();
      const timer = setInterval(() => { tick(); themeTick(); }, 8000);
      ambientNodes = { master, timer, noiseSrc };
    } else if (!on && ambientNodes) {
      const { master, timer, noiseSrc } = ambientNodes;
      clearInterval(timer);
      if (noiseSrc) try { noiseSrc.stop(ctx.currentTime + 1.6); } catch {}
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
      ambientNodes = null;
    }
  } catch {}
}
function setMusicVolume(v) {
  musicVolume = v;
  const ctx = window.__aifitAmbientCtx;
  if (ambientNodes && ctx) ambientNodes.master.gain.setTargetAtTime(0.25 * v + 0.0001, ctx.currentTime, 0.4);
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

function levelShouldersCheck(label = "Skuldrene i ro og i vater", loose = false) {
  return (pose, m) => {
    const state = gradeError(m.shoulderTilt / m.shoulderWidth, loose ? 0.25 : 0.12, loose ? 0.45 : 0.24);
    const hint =
      pose.left_shoulder.y < pose.right_shoulder.y
        ? "Lad venstre skulder synke blødt ned, så skuldrene er i vater."
        : "Lad højre skulder synke blødt ned, så skuldrene er i vater.";
    return { group: "torso", state, label, hint };
  };
}

function headTiltCheck(side) {
  // Forgiving: any clear sideways head tilt counts (camera mirroring makes direction unreliable).
  return (pose, m) => {
    const pairs = [[pose.left_ear, pose.right_ear], [pose.left_eye, pose.right_eye]];
    const pr = pairs.find(([a, b]) => ptOK(a) && ptOK(b));
    const word = side === "left" ? "venstre" : "højre";
    if (!pr) {
      // One ear hidden usually means the head is tilted/turned — accept it.
      if (ptOK(pose.nose)) return { group: "torso", state: "orange", label: `Øret mod ${word} skulder`, hint: `Lad ${word} øre synke blødt ned mod ${word} skulder.` };
      return { group: "torso", state: "red", label: "Hovedet synligt for kameraet", hint: "Vend ansigtet nænsomt mod kameraet." };
    }
    const tilt = Math.abs(pr[0].y - pr[1].y) / m.shoulderWidth;
    const state = tilt >= 0.07 ? "green" : tilt >= 0.035 ? "orange" : "red";
    return { group: "torso", state, label: `Øret blødt ned mod ${word} skulder`, hint: `Lad ${word} øre synke lidt længere ned mod ${word} skulder.` };
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

function legExtendCheck(side) {
  return (pose, m) => {
    const knee = pose[`${side}_knee`], ankle = pose[`${side}_ankle`];
    const word = side === "left" ? "venstre" : "højre";
    const wordCap = word[0].toUpperCase() + word.slice(1);
    const group = side === "left" ? "leftLeg" : "rightLeg";
    // Siddende øvelse: foden må gerne være udenfor billedet — kun knæet skal ses.
    if (!ptOK(knee)) return { group, state: "red", label: `Stræk ${word} ben frem`, hint: "Ryk stolen lidt tilbage, så knæet kan ses." };
    if (!ptOK(ankle)) return { group, state: "green", label: `${wordCap} ben strakt frem`, hint: `Smukt... stræk ${word} ben nænsomt frem. Foden må gerne være udenfor billedet.` };
    const gap = (ankle.y - knee.y) / m.torsoLength;
    return { group, state: gradeError(Math.max(0, gap - 0.18), 0.0, 0.3), label: `${wordCap} fod løftet til knæhøjde`, hint: `Løft ${word} fod lidt højere... stræk benet nænsomt frem.` };
  };
}
function feetWideCheck(ratio, label = "Fødderne godt fra hinanden") {
  return (pose, m) => {
    const la = pose.left_ankle, ra = pose.right_ankle;
    if (!ptOK(la) || !ptOK(ra)) return { group: "leftLeg", state: "red", label, hint: "Træd et skridt tilbage, så fødderne kan ses." };
    const w = Math.abs(la.x - ra.x) / m.shoulderWidth;
    const st = gradeError(Math.max(0, ratio - w), 0.0, 0.5);
    return { group: "leftLeg", state: st, label, hint: "Sæt fødderne lidt længere fra hinanden... med god støtte." };
  };
}
const armOut = (side, up = 0) => pointCheck({
  key: `${side}_wrist`, group: side === "left" ? "leftArm" : "rightArm",
  part: side === "left" ? "venstre hånd" : "højre hånd",
  label: `${side === "left" ? "Venstre" : "Højre"} arm ud til siden`,
  at: (pose, m) => ({
    x: pose[`${side}_shoulder`].x + (side === "left" ? 1 : -1) * sideDir(pose) * m.shoulderWidth * (up ? 1.2 : 1.5),
    y: pose[`${side}_shoulder`].y - m.torsoLength * up,
  }),
  green: 0.45, orange: 0.9,
});

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
      const allGreen = guidelines.every((g) => g.state !== "red");
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
    checks: [headTiltCheck("left"), levelShouldersCheck("Skuldrene bliver nede og i ro", true)],
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
    checks: [headTiltCheck("right"), levelShouldersCheck("Skuldrene bliver nede og i ro", true)],
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
      "Før din højre arm nænsomt ind over brystet, i skulderhøjde... og lad venstre hånd støtte den.",
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
      "Nu venstre arm. Før den nænsomt ind over brystet i skulderhøjde... og støt med højre hånd.",
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
      "Stå rankt, støt dig gerne til en stol... og løft venstre knæ langsomt op mod hoften.",
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
    voiceIntro: "Nu højre side... løft højre knæ langsomt op mod hoften.",
    checks: [kneeLiftCheck("right"), levelShouldersCheck("Overkroppen rank og rolig")],
  }),
];

// Difficulty + sitting/standing preference (set from the start screen)
const LEVELS = [
  { id: 1, label: "Let" },
  { id: 2, label: "Mellem" },
  { id: 3, label: "Svær" },
];
const POSTURES = [
  { id: "sit", label: "🪑 Siddende" },
  { id: "stand", label: "🧍 Stående" },
];
const __q = new URLSearchParams(location.search);
let currentLevel = [1, 2, 3].includes(+__q.get("level")) ? +__q.get("level") : 2;
let currentPosture = __q.get("pos") === "sit" ? "sit" : "stand";

STRETCH_LIBRARY.push(
  makeStretch({
    id: "s-cactus", areas: ["shoulders", "back", "neck"], level: 1, posture: "any", emoji: "🌵", img: "stretch-cactus.jpg",
    name: "Kaktusarme", subtitle: "Åbner skuldre & bryst",
    instruction: "Løft overarmene ud til siden i skulderhøjde, bøj albuerne og lad underarmene pege op mod loftet.",
    voiceIntro: "Løft armene ud til siden... bøj albuerne... og lad hænderne pege blødt op mod loftet.",
    checks: ["left", "right"].map((sd) => pointCheck({
      key: `${sd}_wrist`, group: sd === "left" ? "leftArm" : "rightArm", part: sd === "left" ? "venstre hånd" : "højre hånd",
      label: `${sd === "left" ? "Venstre" : "Højre"} hånd op over albuen`,
      at: (pose, m) => ({ x: pose[`${sd}_shoulder`].x + (sd === "left" ? 1 : -1) * sideDir(pose) * m.shoulderWidth * 0.85, y: pose[`${sd}_shoulder`].y - m.torsoLength * 0.55 }),
      green: 0.45, orange: 0.9,
    })).concat([levelShouldersCheck()]),
  }),
  ...["left", "right"].map((sd) => makeStretch({
    id: `s-legext-${sd}`, areas: ["hips"], level: 1, posture: "sit", emoji: "🦵", img: `stretch-legext-${sd}.jpg`,
    name: `Benstræk på stol — ${sd === "left" ? "venstre" : "højre"}`, subtitle: "Lår & knæ, siddende",
    instruction: `Sid rankt på stolen og stræk ${sd === "left" ? "venstre" : "højre"} ben langsomt frem, så foden kommer op i knæhøjde.`,
    voiceIntro: `Sid rankt på stolen... og stræk ${sd === "left" ? "venstre" : "højre"} ben nænsomt frem.`,
    checks: [legExtendCheck(sd), levelShouldersCheck("Overkroppen rank og rolig")],
  })),
  makeStretch({
    id: "s-star", areas: ["shoulders", "back", "hips"], level: 2, posture: "stand", emoji: "⭐", img: "stretch-star.jpg",
    name: "Stjernen", subtitle: "Hele kroppen bliver lang",
    instruction: "Stå med fødderne bredt fra hinanden og løft armene skråt op, som en stor stjerne.",
    voiceIntro: "Sæt fødderne bredt... løft armene skråt op... og bliv en stor, rolig stjerne.",
    checks: [armOut("left", 0.7), armOut("right", 0.7), feetWideCheck(1.6)],
  }),
  makeStretch({
    id: "s-warrior2", areas: ["hips", "back"], level: 3, posture: "stand", emoji: "🗡️", img: "stretch-warrior2.jpg",
    name: "Kriger II", subtitle: "Styrke i ben & balance",
    instruction: "Stå bredt, bøj det ene knæ og stræk begge arme vandret ud til siden.",
    voiceIntro: "Træd bredt ud... bøj det forreste knæ... og stræk armene ud som en rolig kriger.",
    checks: [armOut("left"), armOut("right"), feetWideCheck(2.2, "Bred og stabil stand")],
  }),
  ...["left", "right"].map((sd) => makeStretch({
    id: `s-balance-${sd}`, areas: ["hips"], level: 3, posture: "stand", emoji: "🦩", img: `stretch-balance-${sd}.jpg`,
    name: `Balance på ét ben — ${sd === "left" ? "venstre knæ op" : "højre knæ op"}`, subtitle: "Balance & stabilitet",
    instruction: `Løft ${sd === "left" ? "venstre" : "højre"} knæ op mod hoften og stræk armene ud til siden for balance.`,
    voiceIntro: `Find et fast punkt med øjnene... løft ${sd === "left" ? "venstre" : "højre"} knæ... og lad armene hjælpe balancen.`,
    checks: [kneeLiftCheck(sd), armOut("left"), armOut("right")],
  }))
);
// Tag older stretches
const __tags = { "s-neck-left": [1, "any"], "s-neck-right": [1, "any"], "s-cross-right": [1, "any"], "s-cross-left": [1, "any"], "s-t-open": [1, "any"], "s-overhead": [1, "any"], "s-side-left": [2, "any"], "s-side-right": [2, "any"], "s-knee-left": [2, "stand"], "s-knee-right": [2, "stand"] };
STRETCH_LIBRARY.forEach((s) => { if (__tags[s.id]) [s.level, s.posture] = __tags[s.id]; });

function filterByPreference(list) {
  const fit = list.filter((p) => !p.posture || p.posture === "any" || p.posture === currentPosture);
  const pool = fit.length ? fit : list;
  const exact = pool.filter((p) => (p.level || 2) === currentLevel);
  if (exact.length >= 4) return exact;
  const rest = pool
    .filter((p) => (p.level || 2) !== currentLevel)
    .sort((a, b) => Math.abs((a.level || 2) - currentLevel) - Math.abs((b.level || 2) - currentLevel));
  return exact.concat(rest.slice(0, 4 - exact.length));
}

// ---------------- Færdige programmer: kuraterede runder ----------------
// A program overrides the mode/level filtering with a fixed, gentle sequence.
const PROGRAMS = [
  {
    id: "morgen",
    label: "🌅 Morgenrutine",
    desc: "Væk kroppen blidt",
    exerciseIds: ["s-neck-left", "s-neck-right", "s-t-open", "s-cactus", "s-side-left", "s-side-right", "s-overhead"],
  },
  {
    id: "aften",
    label: "🌙 Aftenro",
    desc: "Rolig afrunding på dagen",
    exerciseIds: ["s-neck-left", "s-neck-right", "s-cross-left", "s-cross-right", "s-overhead"],
  },
  {
    id: "skuldre",
    label: "💪 Skuldre & nakke",
    desc: "Løs spændinger i nakke og skuldre",
    exerciseIds: ["s-cross-right", "s-cross-left", "s-cactus", "s-t-open", "s-neck-left", "s-neck-right"],
  },
];
let currentProgram = __q.get("prog") && PROGRAMS.some((p) => p.id === __q.get("prog")) ? __q.get("prog") : null;
function setCurrentProgram(id) {
  currentProgram = PROGRAMS.some((p) => p.id === id) ? id : null;
}

// Gentle closing tips shown on the end-of-session summary.
const SUMMARY_TIPS = [
  "Et glas vand efter træningen hjælper kroppen med at hvile.",
  "Selv fem minutter hver dag gør en forskel over tid.",
  "Prøv 'Svær' niveau næste gang... kroppen elsker små udfordringer.",
  "En rolig aftenrutine kan hjælpe kroppen til bedre søvn.",
  "Lyt til din krop... de øvelser, der føles rart, er de rigtige for dig.",
];

function buildSession(modeId, yogaLibrary) {
  if (currentProgram) {
    const prog = PROGRAMS.find((p) => p.id === currentProgram);
    if (prog) {
      const chosen = prog.exerciseIds
        .map((id) => STRETCH_LIBRARY.find((s) => s.id === id) || (yogaLibrary || []).find((p) => p.id === id))
        .filter(Boolean);
      const fit = chosen.filter((p) => !p.posture || p.posture === "any" || p.posture === currentPosture);
      return fit.length ? fit : chosen;
    }
  }
  if (modeId === "yoga") return filterByPreference(yogaLibrary);
  if (modeId === "all") return filterByPreference(STRETCH_LIBRARY);
  return filterByPreference(STRETCH_LIBRARY.filter((s) => s.areas.includes(modeId)));
}

// Video backgrounds (forest / beach)
const __bgVideos = {};
function getBgVideo(url) {
  if (__bgVideos[url]) return __bgVideos[url];
  const v = document.createElement("video");
  v.src = url; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.crossOrigin = "anonymous";
  v.play().catch(() => {});
  return (__bgVideos[url] = v);
}
