let canvas;
let cam, bodyPose;
let yogaSheetImg = null;
let poseCropImages = [];

// 15-second hold configuration (Strict: only counts up when ALL active body parts are GREEN)
let HOLD_TARGET_SECONDS = 15.0;
const GRACE_PERIOD_SECONDS = 0.45;
const CELEBRATION_SECONDS = 4.2;

// State tracking
let currentPoseIndex = 0;
let holdSeconds = 0;
let graceRemaining = 0;
let isPoseMatched = false;
let celebrationRemaining = 0;
let lastUpdateMs = 0;
let currentFeedback = "Træd roligt ind foran kameraet og find din plads";
let currentGuidelines = [];
let currentLimbStates = {
  torso: "red",
  leftArm: "red",
  rightArm: "red",
  leftLeg: "red",
  rightLeg: "red",
};
let completedPoses = new Set();
let halfTimeAnnounced = false;
let matchStartAnnounced = false;
let lastHintSpokenAt = 0;
let showCameraGuides = true;
// "Tæt på" mode: only upper body is graded, so you can stand/sit close to the camera.
let closeUpMode = false;
let lastDistanceState = "ok";
let lastDistanceSpokenAt = 0;
let distanceOkSince = 0;
const CAM_W = 640;
const CAM_H = 480;

// Returns "far" | "close" | "ok" based on how much of the body fits in the frame.
function getDistanceState(pose, m) {
  if (m.shoulderWidth < CAM_W * 0.08) return "far";
  if (closeUpMode) return "ok";
  const ankleSeen = (p) => ptOK(p, 0.3) && p.y < CAM_H * 0.98;
  if (!ankleSeen(pose.left_ankle) && !ankleSeen(pose.right_ankle)) return "close";
  return "ok";
}
let lastFrameMatched = false;
let lastBreathCueAt = 0;

// Background removal (Selfie Segmentation) onto Green Wellness Gradient
let removeBackgroundEnabled = true;
let selfieSegmentation = null;
let segmentationReady = false;
let segmentationBusy = false;
let personLayerCanvas = null;
let personLayerCtx = null;

// Calm background themes (Default: Green Wellness Gradient)
const CAM_BGS = [
  { id: "none", label: "Kamera", colors: null },
  { id: "green", label: "Grøn", colors: ["#1c3f32", "#2b5e4a", "#18352a"] },
  { id: "ocean", label: "Hav", colors: ["#0b3d5c", "#2a8fb8", "#9fe0ea"] },
  { id: "sunset", label: "Solnedgang", colors: ["#3b1f4a", "#c4566b", "#f6b26b"] },
  { id: "lavender", label: "Lavendel", colors: ["#3d3466", "#8a7cc8", "#e2d9f3"] },
  { id: "sand", label: "Sand", colors: ["#6b5a45", "#c9b38f", "#f3ead8"] },
  { id: "night", label: "Nat", colors: ["#05070f", "#16223f", "#2c3e6b"] },
];
let camBgIndex = 1;
let showSettings = false;
function drawCamBackground(x, y, w, h, t) {
  const b = CAM_BGS[camBgIndex];
  if (!b || !b.colors || b.id === "green") return drawGreenWellnessGradientRect(x, y, w, h, t);
  const ctx = drawingContext;
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  b.colors.forEach((c, k) => g.addColorStop(k / (b.colors.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const ax = x + w * 0.5 + Math.sin(t * 0.6) * 25, ay = y + h * 0.4;
  const r = ctx.createRadialGradient(ax, ay, 20, ax, ay, Math.max(w, h) * 0.6);
  r.addColorStop(0, "rgba(255,255,255,0.16)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = r;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
const BACKGROUNDS = [
  { id: "wellness_green", label: "🌿 Grøn Wellness Gradient" },
  { id: "beach", label: "🏖️ Rolig Strand" },
  { id: "flowers", label: "🌸 Blomstereng" },
  { id: "sunset", label: "🌅 Solnedgang" },
];
let currentBgIndex = 0;

// Decorative animated elements
let bgParticles = [];
let bgFlowers = [];
let uiButtons = [];

// ---------------- Wellness Singing Bowl & Danish Voiceover ----------------
let voiceEnabled = true;
let audioUnlocked = false;
let isSpeaking = false;
let currentAudio = null;
let lastSpokenText = "";
let wellnessAudioCtx = null;

function playWellnessChime(type = "soft") {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!wellnessAudioCtx) wellnessAudioCtx = new AudioCtx();
    if (wellnessAudioCtx.state === "suspended") wellnessAudioCtx.resume();

    const now = wellnessAudioCtx.currentTime;
    const freqs = type === "complete" ? [432, 528, 648] : [432, 648];

    freqs.forEach((f, idx) => {
      const osc = wellnessAudioCtx.createOscillator();
      const gain = wellnessAudioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + idx * 0.12);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.12 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 2.4);

      osc.connect(gain);
      gain.connect(wellnessAudioCtx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 2.5);
    });
  } catch {}
}

// Each utterance gets an id; anything from an older id is dropped so voices never overlap.
let speechToken = 0;
const ttsCache = new Map(); // text -> Promise<objectURL>

function fetchTtsUrl(text) {
  if (ttsCache.has(text)) return ttsCache.get(text);
  const p = fetch(`/api/public/tts?text=${encodeURIComponent(text)}`)
    .then((r) => {
      if (!r.ok) throw new Error("tts " + r.status);
      return r.blob();
    })
    .then((b) => URL.createObjectURL(b));
  p.catch(() => ttsCache.delete(text));
  ttsCache.set(text, p);
  return p;
}

function stopDanishVoice() {
  speechToken++;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
}

function speakWithBrowserFallback(text, token) {
  if (typeof window === "undefined" || !window.speechSynthesis || token !== speechToken) {
    if (token === speechToken) isSpeaking = false;
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "da-DK";
  utter.rate = 0.85;
  utter.pitch = 0.95;
  utter.volume = 0.9;

  const voices = window.speechSynthesis.getVoices() || [];
  const daVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("da"));
  const preferred =
    daVoices.find((v) => /natural|neural|online/i.test(v.name)) ||
    daVoices.find((v) => v.name.toLowerCase().includes("google")) ||
    daVoices[0];
  if (preferred) utter.voice = preferred;

  utter.onend = utter.onerror = () => {
    if (token === speechToken) isSpeaking = false;
  };
  window.speechSynthesis.speak(utter);
}

function speakDanish(text, { interrupt = false } = {}) {
  if (!voiceEnabled || !text) return;
  if (isSpeaking && !interrupt) return;

  stopDanishVoice(); // always cut whatever is playing/pending before starting new speech
  const token = speechToken;
  lastSpokenText = text;
  isSpeaking = true;

  fetchTtsUrl(text)
    .then((url) => {
      if (token !== speechToken) return;
      const audio = new Audio(url);
      audio.volume = 0.9;
      currentAudio = audio;
      audio.onended = () => {
        if (token !== speechToken) return;
        isSpeaking = false;
        currentAudio = null;
      };
      audio.onerror = () => {
        if (token !== speechToken) return;
        currentAudio = null;
        speakWithBrowserFallback(text, token);
      };
      audio.play().catch(() => {
        if (token !== speechToken) return;
        currentAudio = null;
        speakWithBrowserFallback(text, token);
      });
    })
    .catch(() => speakWithBrowserFallback(text, token));
}

function announceCurrentPose() {
  const p = YOGA_POSES[currentPoseIndex];
  if (!p) return;
  speakDanish(
    `Tag en dyb, rolig indånding... ${p.name}. ${p.voiceIntro}`,
    { interrupt: true }
  );
  lastHintSpokenAt = millis();
}

// ---------------- Real-time Background Removal (Selfie Segmentation) ----------------
async function initBackgroundSegmentation() {
  if (typeof window.SelfieSegmentation !== "function") return;
  try {
    personLayerCanvas = document.createElement("canvas");
    personLayerCanvas.width = 640;
    personLayerCanvas.height = 480;
    personLayerCtx = personLayerCanvas.getContext("2d");

    selfieSegmentation = new window.SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    selfieSegmentation.setOptions({
      modelSelection: 1, // Landscape/general real-time model
    });

    selfieSegmentation.onResults((results) => {
      if (!personLayerCtx || !results.segmentationMask) return;
      const w = personLayerCanvas.width;
      const h = personLayerCanvas.height;

      personLayerCtx.save();
      personLayerCtx.clearRect(0, 0, w, h);

      // Mirror horizontally to match flipped webcam coordinate space
      personLayerCtx.translate(w, 0);
      personLayerCtx.scale(-1, 1);

      // Draw soft segmentation mask first
      personLayerCtx.filter = "blur(2px)";
      personLayerCtx.drawImage(results.segmentationMask, 0, 0, w, h);
      personLayerCtx.filter = "none";

      // Keep only the person pixels
      personLayerCtx.globalCompositeOperation = "source-in";
      personLayerCtx.drawImage(results.image, 0, 0, w, h);

      personLayerCtx.restore();
      segmentationReady = true;
    });

    // Continuous segmentation loop
    const runSegLoop = async () => {
      const videoEl = cam?.elt || cam;
      if (
        removeBackgroundEnabled &&
        selfieSegmentation &&
        videoEl &&
        videoEl.readyState >= 2 &&
        !segmentationBusy
      ) {
        segmentationBusy = true;
        try {
          await selfieSegmentation.send({ image: videoEl });
        } catch {}
        segmentationBusy = false;
      }
      requestAnimationFrame(runSegLoop);
    };
    requestAnimationFrame(runSegLoop);
  } catch (err) {
    console.warn("SelfieSegmentation init warning:", err);
  }
}

// ---------------- Skeleton Groups & Strict Evaluation Helpers ----------------
// Each bone belongs to a body group so individual body parts turn Red -> Orange -> Green
const SKELETON_EDGES_GROUPED = [
  // Torso & Head
  { a: "left_shoulder", b: "right_shoulder", group: "torso" },
  { a: "left_shoulder", b: "left_hip", group: "torso" },
  { a: "right_shoulder", b: "right_hip", group: "torso" },
  { a: "left_hip", b: "right_hip", group: "torso" },
  { a: "nose", b: "left_eye", group: "torso" },
  { a: "nose", b: "right_eye", group: "torso" },
  { a: "left_eye", b: "left_ear", group: "torso" },
  { a: "right_eye", b: "right_ear", group: "torso" },
  // Left Arm
  { a: "left_shoulder", b: "left_elbow", group: "leftArm" },
  { a: "left_elbow", b: "left_wrist", group: "leftArm" },
  // Right Arm
  { a: "right_shoulder", b: "right_elbow", group: "rightArm" },
  { a: "right_elbow", b: "right_wrist", group: "rightArm" },
  // Left Leg
  { a: "left_hip", b: "left_knee", group: "leftLeg" },
  { a: "left_knee", b: "left_ankle", group: "leftLeg" },
  // Right Leg
  { a: "right_hip", b: "right_knee", group: "rightLeg" },
  { a: "right_knee", b: "right_ankle", group: "rightLeg" },
];

const KEYPOINT_GROUPS = {
  nose: "torso",
  left_eye: "torso",
  right_eye: "torso",
  left_ear: "torso",
  right_ear: "torso",
  left_shoulder: "torso",
  right_shoulder: "torso",
  left_elbow: "leftArm",
  left_wrist: "leftArm",
  right_elbow: "rightArm",
  right_wrist: "rightArm",
  left_hip: "torso",
  right_hip: "torso",
  left_knee: "leftLeg",
  left_ankle: "leftLeg",
  right_knee: "rightLeg",
  right_ankle: "rightLeg",
};

function ptOK(p, minC = 0.28) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.c ?? 1) >= minC;
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Evaluate a numeric metric against strict green and medium orange thresholds
function gradeError(errorValue, greenMax, orangeMax) {
  const f = typeof strictFactor === "function" ? strictFactor() : 1;
  greenMax *= f;
  orangeMax *= f;
  if (errorValue <= greenMax) return "green";
  if (errorValue <= orangeMax) return "orange";
  return "red";
}

function worstGrade(...grades) {
  if (grades.includes("red")) return "red";
  if (grades.includes("orange")) return "orange";
  return "green";
}

function bestGrade(...grades) {
  if (grades.includes("green")) return "green";
  if (grades.includes("orange")) return "orange";
  return "red";
}

// Compute specific directional Danish voice correction to guide a limb from Red/Orange to Green
function getDirectionalAdvice(point, targetX, targetY, partName, m, state) {
  if (!ptOK(point)) {
    return `Før roligt ${partName} ind i kameraets synsfelt.`;
  }
  const dx = targetX - point.x;
  const dy = targetY - point.y;
  const tol = m.shoulderWidth * 0.16;

  const dirs = [];
  if (dx > tol) dirs.push("lidt mod højre");
  else if (dx < -tol) dirs.push("lidt mod venstre");

  if (dy < -tol) dirs.push("lidt højere op");
  else if (dy > tol) dirs.push("lidt længere ned");

  const prefix =
    state === "orange"
      ? `Du er tæt på med ${partName}... før den blot `
      : `Før roligt ${partName} `;

  if (dirs.length === 0) {
    return `${prefix}en lille smule tættere på målmarkeringen.`;
  }
  return `${prefix}${dirs.join(" og ")}, så linjen skifter til grøn.`;
}

function getBodyMetrics(pose) {
  const ls = pose.left_shoulder;
  const rs = pose.right_shoulder;
  const lh = pose.left_hip;
  const rh = pose.right_hip;

  if (!ptOK(ls) || !ptOK(rs)) return null;

  const shoulderWidth = Math.max(38, dist2D(ls, rs));
  const shoulderMid = { x: (ls.x + rs.x) * 0.5, y: (ls.y + rs.y) * 0.5 };
  const shoulderTilt = Math.abs(ls.y - rs.y);

  let hipMid = { x: shoulderMid.x, y: shoulderMid.y + shoulderWidth * 1.35 };
  if (ptOK(lh) && ptOK(rh)) {
    hipMid = { x: (lh.x + rh.x) * 0.5, y: (lh.y + rh.y) * 0.5 };
  } else if (ptOK(lh)) {
    hipMid = { x: lh.x, y: lh.y };
  } else if (ptOK(rh)) {
    hipMid = { x: rh.x, y: rh.y };
  }

  const torsoLength = Math.max(48, dist2D(shoulderMid, hipMid));
  const spineDriftX = Math.abs(shoulderMid.x - hipMid.x);
  return {
    shoulderWidth,
    shoulderMid,
    shoulderTilt,
    hipMid,
    torsoLength,
    spineDriftX,
  };
}

// ---------------- 12 Yoga Poses with Strict Red/Orange/Green Limb Grading ----------------
const YOGA_LIBRARY = [
  {
    id: 1,
    name: "1. Træet (Samlede hænder)",
    subtitle: "Vrksasana — Balance & Fokus",
    instruction:
      "Stå rankt i rolig balance, saml håndfladerne præcist foran hjertet, og løft den ene fod op mod det modsatte ben.",
    voiceIntro:
      "Find ro i kroppen. Stå helt oprejst, saml håndfladerne foran hjertet, og løft blidt den ene fod op mod det andet ben.",
    crop: { x: 5, y: 15, w: 150, h: 325 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: m.shoulderMid.y + m.torsoLength * 0.34,
          r: m.shoulderWidth * 0.32,
          label: "Saml hænder ved hjertet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const la = pose.left_ankle;
      const ra = pose.right_ankle;
      const lk = pose.left_knee;
      const rk = pose.right_knee;

      const heartX = m.shoulderMid.x;
      const heartY = m.shoulderMid.y + m.torsoLength * 0.34;

      // 1. Strict Torso check
      const tiltRatio = m.shoulderTilt / m.shoulderWidth;
      const torsoState = gradeError(tiltRatio, 0.16, 0.3);
      const torsoAdvice =
        pose.left_shoulder.y > pose.right_shoulder.y
          ? "Løft venstre skulder blidt, så din overkrop er i vater."
          : "Løft højre skulder blidt, så din overkrop er i vater.";

      // 2. Strict Left & Right Arm prayer position check
      const lDist = ptOK(lw) ? dist2D(lw, { x: heartX, y: heartY }) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, { x: heartX, y: heartY }) / m.shoulderWidth : 9;
      const handsGap = ptOK(lw) && ptOK(rw) ? dist2D(lw, rw) / m.shoulderWidth : 9;

      const leftArmState = worstGrade(
        gradeError(lDist, 0.42, 0.78),
        gradeError(handsGap, 0.55, 0.95)
      );
      const rightArmState = worstGrade(
        gradeError(rDist, 0.42, 0.78),
        gradeError(handsGap, 0.55, 0.95)
      );

      const leftArmAdvice = getDirectionalAdvice(
        lw,
        heartX,
        heartY,
        "venstre hånd",
        m,
        leftArmState
      );
      const rightArmAdvice = getDirectionalAdvice(
        rw,
        heartX,
        heartY,
        "højre hånd",
        m,
        rightArmState
      );

      // 3. Strict Tree Leg check
      let legState = "green";
      let legAdvice = "Hold balancen roligt på dit støtteben.";
      if (ptOK(la, 0.32) && ptOK(ra, 0.32)) {
        const ankleLiftRatio = Math.abs(la.y - ra.y) / m.torsoLength;
        const kneeSpreadRatio =
          ptOK(lk) && ptOK(rk) ? Math.abs(lk.x - rk.x) / m.shoulderWidth : 0;
        const liftGrade = gradeError(Math.max(0, 0.34 - ankleLiftRatio), 0.0, 0.14);
        const kneeGrade = gradeError(Math.max(0, 0.85 - kneeSpreadRatio), 0.0, 0.25);
        legState = bestGrade(liftGrade, kneeGrade);
        if (legState !== "green") {
          legAdvice =
            legState === "orange"
              ? "Du er i den orange zone med benet... løft foden lidt højere op mod inderlåret og åbn knæet ud til siden."
              : "Løft roligt den ene fod op langs det modsatte ben for at komme ind i Træet.";
        }
      }

      const armsCombined = worstGrade(leftArmState, rightArmState);
      const guidelines = [
        {
          label: "Rank overkrop og skuldre i rolig balance",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: torsoAdvice,
        },
        {
          label: "Håndflader samlet præcist foran hjertet",
          state: armsCombined,
          passed: armsCombined === "green",
          voiceHint: leftArmState !== "green" ? leftArmAdvice : rightArmAdvice,
        },
        {
          label: "Løft den ene fod op mod det modsatte ben",
          state: legState,
          passed: legState === "green",
          voiceHint: legAdvice,
        },
      ];

      const limbStates = {
        torso: torsoState,
        leftArm: leftArmState,
        rightArm: rightArmState,
        leftLeg: legState,
        rightLeg: legState,
      };

      const allGreen = guidelines.every((g) => g.state === "green");
      const firstNotGreen =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates,
        guidelines,
        hint: allGreen
          ? "Smukt... hele kroppen er i grøn harmoni. Træk vejret roligt."
          : firstNotGreen.voiceHint,
      };
    },
  },
  {
    id: 2,
    name: "2. Træet (Arme over hovedet)",
    subtitle: "Vrksasana — Strakte Arme",
    instruction:
      "Hold balancen og stræk begge arme højt op over hovedet med håndfladerne samlet lige over issen.",
    voiceIntro:
      "Lad armene svæve roligt op over hovedet, og saml dine håndflader lige over issen.",
    crop: { x: 155, y: 5, w: 155, h: 335 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.max(42, m.shoulderMid.y - m.torsoLength * 0.92),
          r: m.shoulderWidth * 0.34,
          label: "Saml hænder over hovedet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const targetX = m.shoulderMid.x;
      const targetY = Math.max(42, m.shoulderMid.y - m.torsoLength * 0.92);

      const tiltRatio = m.shoulderTilt / m.shoulderWidth;
      const torsoState = gradeError(tiltRatio, 0.17, 0.32);

      const lDist = ptOK(lw) ? dist2D(lw, { x: targetX, y: targetY }) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, { x: targetX, y: targetY }) / m.shoulderWidth : 9;
      const handsGap = ptOK(lw) && ptOK(rw) ? dist2D(lw, rw) / m.shoulderWidth : 9;

      const leftArmState = worstGrade(
        gradeError(lDist, 0.48, 0.85),
        gradeError(handsGap, 0.65, 1.1)
      );
      const rightArmState = worstGrade(
        gradeError(rDist, 0.48, 0.85),
        gradeError(handsGap, 0.65, 1.1)
      );

      const leftAdvice = getDirectionalAdvice(
        lw,
        targetX,
        targetY,
        "venstre arm",
        m,
        leftArmState
      );
      const rightAdvice = getDirectionalAdvice(
        rw,
        targetX,
        targetY,
        "højre arm",
        m,
        rightArmState
      );

      const guidelines = [
        {
          label: "Venstre arm strakt præcist op over hovedet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: leftAdvice,
        },
        {
          label: "Højre arm strakt og samlet over hovedet",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: rightAdvice,
        },
        {
          label: "Overkrop og skuldre i rolig lodret linje",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Ret ryggen blidt op og hold skuldrene lige.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: torsoState,
          rightLeg: torsoState,
        },
        guidelines,
        hint: allGreen
          ? "Skønt stræk... hold roen i den grønne zone."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 3,
    name: "3. Trekantsstilling (Trikonasana)",
    subtitle: "Sidebøjning & Åbent Bryst",
    instruction:
      "Stå bredt, bøj overkroppen til siden, før den ene hånd ned til skinnebenet og stræk den anden arm lige mod himlen.",
    voiceIntro:
      "Stå bredt med benene. Lad den ene hånd glide ned langs benet, mens den anden arm strækkes roligt mod himlen.",
    crop: { x: 315, y: 95, w: 215, h: 245 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.78),
          r: m.shoulderWidth * 0.34,
          label: "Øverste hånd",
        },
        {
          x: m.shoulderMid.x,
          y: Math.min(440, m.hipMid.y + m.torsoLength * 0.48),
          r: m.shoulderWidth * 0.34,
          label: "Nederste hånd",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const topTarget = {
        x: m.shoulderMid.x,
        y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.78),
      };
      const botTarget = {
        x: m.shoulderMid.x,
        y: Math.min(440, m.hipMid.y + m.torsoLength * 0.48),
      };

      // Determine which hand is acting as upper vs lower
      const leftIsUpper = ptOK(lw) && ptOK(rw) ? lw.y <= rw.y : true;
      const upperWrist = leftIsUpper ? lw : rw;
      const lowerWrist = leftIsUpper ? rw : lw;

      const upperErr = ptOK(upperWrist)
        ? Math.max(0, (upperWrist.y - topTarget.y) / m.torsoLength)
        : 9;
      const lowerErr = ptOK(lowerWrist)
        ? Math.max(0, (botTarget.y - lowerWrist.y) / m.torsoLength)
        : 9;

      const upperState = gradeError(upperErr, 0.22, 0.5);
      const lowerState = gradeError(lowerErr, 0.22, 0.5);

      const tiltRatio = m.shoulderTilt / m.shoulderWidth;
      const torsoState = gradeError(Math.max(0, 0.22 - tiltRatio), 0.0, 0.14);

      const leftArmState = leftIsUpper ? upperState : lowerState;
      const rightArmState = leftIsUpper ? lowerState : upperState;

      const guidelines = [
        {
          label: "Øverste arm strakt lige op mod himlen",
          state: upperState,
          passed: upperState === "green",
          voiceHint: getDirectionalAdvice(
            upperWrist,
            topTarget.x,
            topTarget.y,
            "den øverste arm",
            m,
            upperState
          ),
        },
        {
          label: "Nederste hånd ført ned mod skinnebenet",
          state: lowerState,
          passed: lowerState === "green",
          voiceHint: getDirectionalAdvice(
            lowerWrist,
            botTarget.x,
            botTarget.y,
            "den nederste hånd",
            m,
            lowerState
          ),
        },
        {
          label: "Overkroppen bøjet blidt til siden",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Vip overkroppen og skuldrene lidt mere til siden i trekantsstillingen.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Harmonisk Trekantsstilling... mærk strækket i siden."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 4,
    name: "4. Dyb Squat (Malasana)",
    subtitle: "Garland Squat — Jordforbindelse",
    instruction:
      "Bøj knæene dybt, sænk hofterne roligt ned, og saml håndfladerne præcist foran hjertet.",
    voiceIntro:
      "Sænk hofterne blidt ned i en dyb squat, og saml håndfladerne foran hjertet.",
    crop: { x: 525, y: 165, w: 165, h: 175 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: m.shoulderMid.y + m.torsoLength * 0.35,
          r: m.shoulderWidth * 0.32,
          label: "Hænder ved brystet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lk = pose.left_knee;
      const rk = pose.right_knee;
      const heart = {
        x: m.shoulderMid.x,
        y: m.shoulderMid.y + m.torsoLength * 0.35,
      };

      const lDist = ptOK(lw) ? dist2D(lw, heart) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, heart) / m.shoulderWidth : 9;
      const leftArmState = gradeError(lDist, 0.42, 0.78);
      const rightArmState = gradeError(rDist, 0.42, 0.78);

      let squatDepthErr = Math.max(0, (215 - m.shoulderMid.y) / 90);
      if (ptOK(lk, 0.3) && ptOK(rk, 0.3)) {
        const kneeMidY = (lk.y + rk.y) * 0.5;
        squatDepthErr = Math.max(
          0,
          Math.abs(m.hipMid.y - kneeMidY) / m.torsoLength - 0.38
        );
      }
      const legState = gradeError(squatDepthErr, 0.14, 0.34);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.16, 0.32);

      const armsCombined = worstGrade(leftArmState, rightArmState);
      const guidelines = [
        {
          label: "Håndflader samlet præcist foran brystet",
          state: armsCombined,
          passed: armsCombined === "green",
          voiceHint:
            leftArmState !== "green"
              ? getDirectionalAdvice(lw, heart.x, heart.y, "venstre hånd", m, leftArmState)
              : getDirectionalAdvice(rw, heart.x, heart.y, "højre hånd", m, rightArmState),
        },
        {
          label: "Hofter sænket dybt ned i squat",
          state: legState,
          passed: legState === "green",
          voiceHint:
            legState === "orange"
              ? "Du er tæt på... sænk hofterne en lille smule dybere ned i din squat."
              : "Bøj knæene og sænk hofterne roligt længere ned mod gulvet.",
        },
        {
          label: "Løftet bryst og lige skuldre",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold brystet løftet og skuldrene lige.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: legState,
          rightLeg: legState,
        },
        guidelines,
        hint: allGreen
          ? "Stærk og rolig Malasana... træk vejret dybt."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 5,
    name: "5. Skrædderstilling (Sukhasana)",
    subtitle: "Indre Ro & Balance",
    instruction:
      "Sid med rank ryg og lad begge hænder hvile symmetrisk ude på dine knæ.",
    voiceIntro:
      "Sid behageligt med rank ryg. Lad skuldrene falde på plads, og hvil hænderne blidt på dine knæ.",
    crop: { x: 15, y: 345, w: 170, h: 165 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x - m.shoulderWidth * 0.82,
          y: m.hipMid.y + m.torsoLength * 0.08,
          r: m.shoulderWidth * 0.3,
          label: "Venstre hånd",
        },
        {
          x: m.shoulderMid.x + m.shoulderWidth * 0.82,
          y: m.hipMid.y + m.torsoLength * 0.08,
          r: m.shoulderWidth * 0.3,
          label: "Højre hånd",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lTarget = {
        x: m.shoulderMid.x - m.shoulderWidth * 0.82,
        y: m.hipMid.y + m.torsoLength * 0.08,
      };
      const rTarget = {
        x: m.shoulderMid.x + m.shoulderWidth * 0.82,
        y: m.hipMid.y + m.torsoLength * 0.08,
      };

      const lDist = ptOK(lw) ? dist2D(lw, lTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, rTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.45, 0.82);
      const rightArmState = gradeError(rDist, 0.45, 0.82);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.15, 0.28);

      const guidelines = [
        {
          label: "Rank ryg og afslappede skuldre",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Ret ryggen blidt op og sænk skuldrene.",
        },
        {
          label: "Venstre hånd hviler roligt på venstre knæ",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            lTarget.x,
            lTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd hviler roligt på højre knæ",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            rTarget.x,
            rTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Fuldkommen ro... nyd vejrtrækningen i den grønne zone."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 6,
    name: "6. Siddende Bedestilling",
    subtitle: "Anjali Mudra — Hjertefokus",
    instruction:
      "Sid oprejst med krydsede ben og saml håndfladerne præcist midt foran hjertet.",
    voiceIntro:
      "Før håndfladerne blidt sammen foran hjertet, og mærk roen brede sig i kroppen.",
    crop: { x: 195, y: 345, w: 155, h: 165 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: m.shoulderMid.y + m.torsoLength * 0.35,
          r: m.shoulderWidth * 0.3,
          label: "Saml hænder ved hjertet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const heart = {
        x: m.shoulderMid.x,
        y: m.shoulderMid.y + m.torsoLength * 0.35,
      };

      const lDist = ptOK(lw) ? dist2D(lw, heart) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, heart) / m.shoulderWidth : 9;
      const gap = ptOK(lw) && ptOK(rw) ? dist2D(lw, rw) / m.shoulderWidth : 9;

      const leftArmState = worstGrade(
        gradeError(lDist, 0.38, 0.72),
        gradeError(gap, 0.5, 0.9)
      );
      const rightArmState = worstGrade(
        gradeError(rDist, 0.38, 0.72),
        gradeError(gap, 0.5, 0.9)
      );
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.15, 0.28);

      const guidelines = [
        {
          label: "Rank og harmonisk overkrop",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Sid rankt med begge skuldre i samme højde.",
        },
        {
          label: "Venstre hånd placeret ved hjertet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            heart.x,
            heart.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd samlet ved hjertet",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            heart.x,
            heart.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Smuk balance ved hjertet... bliv i den grønne ro."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 7,
    name: "7. Sommerfuglen (Baddha Konasana)",
    subtitle: "Hofteåbner & Stilhed",
    instruction:
      "Sid med fodsålerne samlet og ræk begge hænder lavt ned i skødet for at omslutte fødderne.",
    voiceIntro:
      "Saml fodsålerne foran dig, og lad begge hænder hvile lavt nede omkring dine fødder.",
    crop: { x: 355, y: 350, w: 160, h: 165 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.min(445, m.hipMid.y + m.torsoLength * 0.16),
          r: m.shoulderWidth * 0.34,
          label: "Saml hænder i skødet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lapTarget = {
        x: m.shoulderMid.x,
        y: Math.min(445, m.hipMid.y + m.torsoLength * 0.16),
      };

      const lDist = ptOK(lw) ? dist2D(lw, lapTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, lapTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.45, 0.82);
      const rightArmState = gradeError(rDist, 0.45, 0.82);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.16, 0.3);

      const guidelines = [
        {
          label: "Lang og rank rygsøjle",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold overkroppen lang og sænk skuldrene blidt.",
        },
        {
          label: "Venstre hånd ført lavt ned i skødet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            lapTarget.x,
            lapTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd samlet nede ved fødderne",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            lapTarget.x,
            lapTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Dejlig Sommerfugle-stilling... giv slip i hofterne."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 8,
    name: "8. Siddende Balance",
    subtitle: "Kerne & Åbne Arme",
    instruction:
      "Find balancen på sædet og stræk begge arme bredt og symmetrisk ud til hver side.",
    voiceIntro:
      "Åbn brystet og stræk begge arme blidt og bredt ud til siderne i rolig balance.",
    crop: { x: 515, y: 355, w: 185, h: 160 },
    getTargetZones(m) {
      return [
        {
          x: Math.max(45, m.shoulderMid.x - m.shoulderWidth * 1.18),
          y: m.shoulderMid.y + m.torsoLength * 0.18,
          r: m.shoulderWidth * 0.32,
          label: "Venstre arm ud",
        },
        {
          x: Math.min(595, m.shoulderMid.x + m.shoulderWidth * 1.18),
          y: m.shoulderMid.y + m.torsoLength * 0.18,
          r: m.shoulderWidth * 0.32,
          label: "Højre arm ud",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lTarget = {
        x: Math.max(45, m.shoulderMid.x - m.shoulderWidth * 1.18),
        y: m.shoulderMid.y + m.torsoLength * 0.18,
      };
      const rTarget = {
        x: Math.min(595, m.shoulderMid.x + m.shoulderWidth * 1.18),
        y: m.shoulderMid.y + m.torsoLength * 0.18,
      };

      const lDist = ptOK(lw) ? dist2D(lw, lTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, rTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.45, 0.85);
      const rightArmState = gradeError(rDist, 0.45, 0.85);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.16, 0.3);

      const guidelines = [
        {
          label: "Overkroppen i centreret balance",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold overkroppen rank og i rolig balance.",
        },
        {
          label: "Venstre arm strakt ud til venstre",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            lTarget.x,
            lTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre arm strakt ud til højre",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            rTarget.x,
            rTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Flot siddende balance... mærk styrken og roen."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 9,
    name: "9. Kriger I (Warrior I)",
    subtitle: "Virabhadrasana — Styrke & Nærvær",
    instruction:
      "Træd ud i udfaldstrin og stræk begge arme lige og parallelt op over skuldrene.",
    voiceIntro:
      "Træd roligt ud i Kriger 1, og løft begge arme strakt op mod himlen med bløde skuldre.",
    crop: { x: 15, y: 520, w: 170, h: 210 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.85),
          r: m.shoulderWidth * 0.42,
          label: "Stræk begge arme op",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const topTarget = {
        x: m.shoulderMid.x,
        y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.85),
      };

      const lDist = ptOK(lw) ? dist2D(lw, topTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, topTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.55, 0.95);
      const rightArmState = gradeError(rDist, 0.55, 0.95);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.18, 0.34);

      const guidelines = [
        {
          label: "Venstre arm løftet strakt op mod himlen",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            topTarget.x,
            topTarget.y,
            "venstre arm",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre arm løftet strakt op mod himlen",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            topTarget.x,
            topTarget.y,
            "højre arm",
            m,
            rightArmState
          ),
        },
        {
          label: "Stabil og oprejst overkrop i udfaldstrin",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold overkroppen rank og brystet åbent.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: torsoState,
          rightLeg: torsoState,
        },
        guidelines,
        hint: allGreen
          ? "Stærk og harmonisk Kriger-stilling... træk vejret dybt."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 10,
    name: "10. Hundestrækket (Downward Dog)",
    subtitle: "Adho Mukha Svanasana",
    instruction:
      "Bøj overkroppen frem og ned i et omvendt V med hænderne rakt langt ned mod gulvet.",
    voiceIntro:
      "Lad overkroppen smelte roligt fremad i Hundestrækket med hænderne mod gulvet og hofterne løftet.",
    crop: { x: 175, y: 585, w: 235, h: 145 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.min(445, m.hipMid.y + m.torsoLength * 0.45),
          r: m.shoulderWidth * 0.42,
          label: "Hænder mod gulvet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const floorTarget = {
        x: m.shoulderMid.x,
        y: Math.min(445, m.hipMid.y + m.torsoLength * 0.45),
      };

      const foldErr = Math.max(
        0,
        (m.hipMid.y - m.torsoLength * 0.15 - m.shoulderMid.y) / m.torsoLength
      );
      const torsoState = gradeError(foldErr, 0.15, 0.4);

      const lErr = ptOK(lw)
        ? Math.max(0, (floorTarget.y - lw.y) / m.torsoLength)
        : 9;
      const rErr = ptOK(rw)
        ? Math.max(0, (floorTarget.y - rw.y) / m.torsoLength)
        : 9;

      const leftArmState = gradeError(lErr, 0.25, 0.55);
      const rightArmState = gradeError(rErr, 0.25, 0.55);

      const guidelines = [
        {
          label: "Overkroppen bøjet fremad under hofternes højde",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint:
            torsoState === "orange"
              ? "Du er tæt på... sænk overkroppen og hovedet en smule længere ned."
              : "Bøj roligt overkroppen frem og ned, så hofterne er øverst.",
        },
        {
          label: "Venstre arm strakt ned mod gulvet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            floorTarget.x,
            floorTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre arm strakt ned mod gulvet",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            floorTarget.x,
            floorTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: torsoState,
          rightLeg: torsoState,
        },
        guidelines,
        hint: allGreen
          ? "Dejligt Hundestræk... mærk længden i rygsøjlen."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 11,
    name: "11. Trebenet Hundestræk",
    subtitle: "Eka Pada Adho Mukha Svanasana",
    instruction:
      "Støt roligt med hænderne mod gulvet og løft det ene ben højt og strakt op bagud.",
    voiceIntro:
      "Fra Hundestrækket løfter du nu det ene ben blidt og strakt op mod himlen.",
    crop: { x: 405, y: 550, w: 205, h: 180 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.min(445, m.hipMid.y + m.torsoLength * 0.42),
          r: m.shoulderWidth * 0.42,
          label: "Støt med hænderne",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const la = pose.left_ankle;
      const ra = pose.right_ankle;

      const foldErr = Math.max(
        0,
        (m.hipMid.y - m.torsoLength * 0.1 - m.shoulderMid.y) / m.torsoLength
      );
      const torsoState = gradeError(foldErr, 0.18, 0.42);

      const handsDownErr =
        ptOK(lw) && ptOK(rw)
          ? Math.max(0, (m.shoulderMid.y - Math.max(lw.y, rw.y)) / m.torsoLength)
          : 9;
      const armState = gradeError(handsDownErr, 0.05, 0.28);

      let legState = torsoState;
      if (ptOK(la, 0.3) && ptOK(ra, 0.3)) {
        const diffRatio = Math.abs(la.y - ra.y) / m.torsoLength;
        legState = gradeError(Math.max(0, 0.38 - diffRatio), 0.0, 0.16);
      }

      const guidelines = [
        {
          label: "Overkroppen bøjet roligt fremad",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Sænk overkroppen blidt frem og ned mod gulvet.",
        },
        {
          label: "Hænderne støtter lavt foran kroppen",
          state: armState,
          passed: armState === "green",
          voiceHint: "Ræk begge hænder længere ned mod gulvet.",
        },
        {
          label: "Det ene ben løftet højt bagud",
          state: legState,
          passed: legState === "green",
          voiceHint:
            legState === "orange"
              ? "Næsten i grøn... løft det bagerste ben en anelse højere op."
              : "Løft roligt det ene ben højt op bag dig.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: armState,
          rightArm: armState,
          leftLeg: legState,
          rightLeg: legState,
        },
        guidelines,
        hint: allGreen
          ? "Smukt Trebenet Hundestræk... hold den rolige linje."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 12,
    name: "12. Stående Foroverbøjning",
    subtitle: "Uttanasana — Giv Slip",
    instruction:
      "Stå med lige ben, fold overkroppen helt forover og lad hænderne hvile nede ved anklerne.",
    voiceIntro:
      "Giv slip i nakke og skuldre. Fold overkroppen blidt helt forover ned mod dine ben.",
    crop: { x: 590, y: 545, w: 105, h: 185 },
    getTargetZones(m) {
      return [
        {
          x: m.hipMid.x,
          y: Math.min(448, m.hipMid.y + m.torsoLength * 0.55),
          r: m.shoulderWidth * 0.38,
          label: "Hænder ved anklerne",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const target = {
        x: m.hipMid.x,
        y: Math.min(448, m.hipMid.y + m.torsoLength * 0.55),
      };

      const foldErr = Math.max(
        0,
        (m.hipMid.y - m.shoulderMid.y) / m.torsoLength
      );
      const torsoState = gradeError(foldErr, 0.15, 0.42);

      const lDist = ptOK(lw) ? Math.max(0, (target.y - lw.y) / m.torsoLength) : 9;
      const rDist = ptOK(rw) ? Math.max(0, (target.y - rw.y) / m.torsoLength) : 9;

      const leftArmState = gradeError(lDist, 0.25, 0.55);
      const rightArmState = gradeError(rDist, 0.25, 0.55);

      const guidelines = [
        {
          label: "Overkrop og hoved foldet dybt og afslappet ned",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint:
            torsoState === "orange"
              ? "Du er tæt på... lad hovedet og skuldrene synke lidt længere ned."
              : "Fold overkroppen roligt forover fra hoften.",
        },
        {
          label: "Venstre hånd rakt ned mod anklerne",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            target.x,
            target.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd rakt ned mod anklerne",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            target.x,
            target.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state === "green");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Dyb og rolig Foroverbøjning... lad åndedrættet flyde."
          : nextFix.voiceHint,
      };
    },
  },
];

let YOGA_POSES = YOGA_LIBRARY;

function setMode(index) {
  currentModeIndex = index;
  YOGA_POSES = buildSession(MODES[index].id, YOGA_LIBRARY);
  completedPoses = new Set();
  goToPose(0);
}

// ---------------- Setup & Lifecycle ----------------
function initScenicElements() {
  bgParticles = [];
  for (let i = 0; i < 36; i++) {
    bgParticles.push({
      x: Math.random() * windowWidth,
      y: Math.random() * windowHeight,
      size: 2.5 + Math.random() * 5.5,
      speedX: -0.18 + Math.random() * 0.36,
      speedY: -0.12 - Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
    });
  }

  bgFlowers = [];
  for (let i = 0; i < 48; i++) {
    const palette = [
      [255, 195, 220],
      [255, 235, 130],
      [215, 180, 255],
      [255, 145, 165],
      [255, 255, 255],
    ];
    bgFlowers.push({
      xRatio: Math.random(),
      yRatio: 0.66 + Math.random() * 0.32,
      stemH: 18 + Math.random() * 28,
      petals: palette[i % palette.length],
      phase: Math.random() * Math.PI * 2,
      scale: 0.75 + Math.random() * 0.6,
    });
  }
}

async function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  initScenicElements();

  try {
    yogaSheetImg = await loadImage(
      "senior-woman-yoga-positions-cellection_1308-122842.jpg.avif"
    );
    if (yogaSheetImg) {
      YOGA_LIBRARY.forEach((p) => {
        p.cropImg = yogaSheetImg.get(p.crop.x, p.crop.y, p.crop.w, p.crop.h);
      });
    }
  } catch (err) {
    console.warn("Could not load yoga reference image:", err);
  }

  // Load stretch reference illustrations (same flat style as the yoga sheet)
  await Promise.all(
    STRETCH_LIBRARY.map(async (s) => {
      if (!s.img) return;
      try {
        s.cropImg = await loadImage(s.img);
      } catch (err) {
        console.warn("Could not load stretch image:", s.img, err);
      }
    })
  );

  await loadScript("portal/bodyPose.js");

  cam = await setupWebcamera(false, 640, 480, true);

  // Start real-time person segmentation for green gradient background removal
  initBackgroundSegmentation();

  bodyPose = await new BodyPose({
    video: cam,
    backend: "webgl",
    videoIsFlipped: true,
    onResults: () => {},
  }).init();

  await bodyPose.start();
  lastUpdateMs = millis();

  setTimeout(() => {
    announceCurrentPose();
  }, 600);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ---------------- Green Wellness Gradient & Scenic Backgrounds ----------------
function drawGreenWellnessGradientRect(x, y, w, h, t) {
  const ctx = drawingContext;
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x + w * 0.85, y + h);
  grad.addColorStop(0, "#1c3f32");
  grad.addColorStop(0.45, "#2b5e4a");
  grad.addColorStop(1, "#18352a");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Soft breathing radial sage aura in the center
  const auraX = x + w * 0.5 + Math.sin(t * 0.6) * 25;
  const auraY = y + h * 0.45 + Math.cos(t * 0.5) * 18;
  const radGrad = ctx.createRadialGradient(
    auraX,
    auraY,
    20,
    auraX,
    auraY,
    Math.max(w, h) * 0.65
  );
  radGrad.addColorStop(0, "rgba(130, 220, 175, 0.24)");
  radGrad.addColorStop(0.55, "rgba(85, 175, 135, 0.10)");
  radGrad.addColorStop(1, "rgba(24, 53, 42, 0)");
  ctx.fillStyle = radGrad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawCalmBackground() {
  const theme = BACKGROUNDS[currentBgIndex].id;
  const t = millis() * 0.001;

  push();
  noStroke();

  if (theme === "wellness_green") {
    drawGreenWellnessGradientRect(0, 0, width, height, t);

    // Gentle organic sage waves at the bottom
    for (let w = 0; w < 3; w++) {
      fill(90 + w * 20, 175 + w * 15, 135 + w * 10, 28);
      beginShape();
      vertex(0, height);
      for (let x = 0; x <= width; x += 36) {
        const wy =
          height * (0.68 + w * 0.08) +
          Math.sin(x * 0.005 + t * (0.6 + w * 0.15) + w) * 22;
        vertex(x, wy);
      }
      vertex(width, height);
      endShape(CLOSE);
    }
  } else if (theme === "beach") {
    for (let y = 0; y < height * 0.58; y += 4) {
      const amt = y / (height * 0.58);
      fill(lerpColor(color(115, 195, 240), color(250, 225, 190), amt));
      rect(0, y, width, 5);
    }
    const sunX = width * 0.82;
    const sunY = height * 0.2;
    fill(255, 240, 180, 45);
    ellipse(sunX, sunY, 190 + Math.sin(t * 1.5) * 10);
    fill(255, 250, 220, 220);
    ellipse(sunX, sunY, 82);

    const seaTop = height * 0.55;
    fill(45, 155, 185);
    rect(0, seaTop, width, height - seaTop);

    fill(238, 214, 172);
    beginShape();
    vertex(0, height);
    for (let x = 0; x <= width; x += 40) {
      vertex(x, height * 0.76 + Math.sin(x * 0.006 + t * 0.8) * 10);
    }
    vertex(width, height);
    endShape(CLOSE);
  } else if (theme === "flowers") {
    for (let y = 0; y < height * 0.62; y += 4) {
      const amt = y / (height * 0.62);
      fill(lerpColor(color(135, 198, 250), color(225, 245, 235), amt));
      rect(0, y, width, 5);
    }
    fill(130, 195, 140);
    rect(0, height * 0.56, width, height * 0.44);
    for (const fl of bgFlowers) {
      const fx = fl.xRatio * width;
      const fy = fl.yRatio * height;
      const sway = Math.sin(t * 1.6 + fl.phase) * 5;
      stroke(60, 130, 70);
      strokeWeight(2);
      line(fx, fy, fx + sway, fy - fl.stemH);
      noStroke();
      fill(fl.petals[0], fl.petals[1], fl.petals[2], 220);
      ellipse(fx + sway, fy - fl.stemH, 10 * fl.scale);
    }
  } else {
    for (let y = 0; y < height; y += 4) {
      const amt = y / height;
      fill(lerpColor(color(65, 50, 115), color(250, 135, 105), amt));
      rect(0, y, width, 5);
    }
  }

  // Soft floating wellness light motes
  noStroke();
  fill(210, 250, 225, 95);
  for (const p of bgParticles) {
    p.x += p.speedX + Math.sin(t + p.phase) * 0.2;
    p.y += p.speedY;
    if (p.y < -10) p.y = height + 10;
    if (p.x < -10) p.x = width + 10;
    if (p.x > width + 10) p.x = -10;
    ellipse(p.x, p.y, p.size, p.size);
  }
  pop();
}

// ---------------- Interactions & Controls ----------------
function mousePressed() {
  audioUnlocked = true;
  if (wellnessAudioCtx && wellnessAudioCtx.state === "suspended") {
    wellnessAudioCtx.resume();
  }

  for (const btn of uiButtons) {
    if (
      mouseX >= btn.x &&
      mouseX <= btn.x + btn.w &&
      mouseY >= btn.y &&
      mouseY <= btn.y + btn.h
    ) {
      btn.onClick();
      return;
    }
  }
}

function keyPressed() {
  audioUnlocked = true;
  if (keyCode === RIGHT_ARROW || key === "n" || key === "N") {
    goToPose((currentPoseIndex + 1) % YOGA_POSES.length);
  } else if (keyCode === LEFT_ARROW || key === "p" || key === "P") {
    goToPose((currentPoseIndex - 1 + YOGA_POSES.length) % YOGA_POSES.length);
  } else if (key === "r" || key === "R") {
    holdSeconds = 0;
    celebrationRemaining = 0;
    halfTimeAnnounced = false;
  } else if (key === "b" || key === "B") {
    currentBgIndex = (currentBgIndex + 1) % BACKGROUNDS.length;
  } else if (key === "v" || key === "V") {
    announceCurrentPose();
  } else if (key === "g" || key === "G") {
    showCameraGuides = !showCameraGuides;
  } else if (key === "t" || key === "T") {
    closeUpMode = !closeUpMode;
  } else if (key === " ") {
    togglePause();
  } else if (key === "s" || key === "S") {
    strictnessIndex = (strictnessIndex + 1) % STRICTNESS_LEVELS.length;
  } else if (key === "m" || key === "M") {
    setMode((currentModeIndex + 1) % MODES.length);
  } else if (key === "f" || key === "F") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  return false;
}

function togglePause() {
  sessionPaused = !sessionPaused;
  if (sessionPaused) {
    stopDanishVoice();
  } else {
    lastUpdateMs = millis();
    speakDanish("Vi fortsætter roligt... når du er klar.", { interrupt: true });
  }
}

function goToPose(index) {
  lastFrameMatched = false;
  lastBreathCueAt = millis();
  currentPoseIndex = index;
  holdSeconds = 0;
  graceRemaining = 0;
  isPoseMatched = false;
  celebrationRemaining = 0;
  halfTimeAnnounced = false;
  matchStartAnnounced = false;
  announceCurrentPose();
}

// ---------------- Wellness Styling for Body Lines (Red -> Orange -> Green) ----------------
function getWellnessStyleForGrade(grade) {
  if (grade === "green") {
    return {
      stroke: "rgba(115, 232, 172, 0.92)",
      core: "rgba(235, 255, 245, 0.88)",
      glow: "rgba(95, 228, 165, 0.65)",
      jointFill: [115, 232, 172],
    };
  }
  if (grade === "orange") {
    return {
      stroke: "rgba(248, 184, 98, 0.92)",
      core: "rgba(255, 244, 220, 0.85)",
      glow: "rgba(248, 175, 85, 0.60)",
      jointFill: [248, 184, 98],
    };
  }
  return {
    stroke: "rgba(232, 114, 114, 0.88)",
    core: "rgba(255, 228, 228, 0.78)",
    glow: "rgba(228, 100, 100, 0.52)",
    jointFill: [232, 114, 114],
  };
}

function drawPoseTargetGuides(pose) {
  if (!showCameraGuides || !pose) return;
  const metrics = getBodyMetrics(pose);
  if (!metrics) return;

  const targetPose = YOGA_POSES[currentPoseIndex];
  if (typeof targetPose.getTargetZones !== "function") return;

  const zones = targetPose.getTargetZones(metrics, pose) || [];
  const pulse = 1 + Math.sin(millis() * 0.003) * 0.04;

  push();
  for (const z of zones) {
    const isGreen = isPoseMatched;
    fill(isGreen ? color(115, 232, 172, 36) : color(248, 195, 115, 28));
    stroke(isGreen ? color(135, 242, 188, 190) : color(250, 205, 130, 175));
    strokeWeight(2);
    drawingContext.setLineDash([6, 6]);
    ellipse(z.x, z.y, z.r * 2 * pulse, z.r * 2 * pulse);
    drawingContext.setLineDash([]);

    if (z.label) {
      noStroke();
      fill(20, 42, 34, 185);
      textSize(11.5);
      const tw = textWidth(z.label) + 16;
      rect(z.x - tw * 0.5, z.y - z.r - 24, tw, 20, 10);
      fill(235, 250, 242);
      textAlign(CENTER, CENTER);
      text(z.label, z.x, z.y - z.r - 14);
    }
  }
  pop();
}

function drawWellnessBodyModel(pose, limbStates) {
  if (!pose) return;
  const ctx = drawingContext;
  const breathPulse = Math.sin(millis() * 0.0035) * 1.5;

  push();
  strokeCap(ROUND);
  strokeJoin(ROUND);

  // 1. Draw soft glowing wellness lines per body part (Red / Orange / Green)
  for (const edge of SKELETON_EDGES_GROUPED) {
    const a = pose[edge.a];
    const b = pose[edge.b];
    if (!ptOK(a, 0.25) || !ptOK(b, 0.25)) continue;

    const grade = limbStates?.[edge.group] || "red";
    const style = getWellnessStyleForGrade(grade);

    ctx.save();
    ctx.shadowColor = style.glow;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Inner luminous pearl core line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = style.core;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Draw soft chakra-inspired wellness joint pearls
  for (const [name, group] of Object.entries(KEYPOINT_GROUPS)) {
    const p = pose[name];
    if (!ptOK(p, 0.25)) continue;

    const grade = limbStates?.[group] || "red";
    const style = getWellnessStyleForGrade(grade);
    const [r, g, b] = style.jointFill;

    noStroke();
    fill(r, g, b, 65);
    ellipse(p.x, p.y, 18 + breathPulse, 18 + breathPulse);

    fill(r, g, b, 225);
    ellipse(p.x, p.y, 10, 10);

    fill(245, 255, 250, 230);
    ellipse(p.x, p.y, 4.5, 4.5);
  }

  // 3. Soft mindful halo at nose / head center
  const nose = pose.nose;
  if (ptOK(nose, 0.25)) {
    const torsoGrade = limbStates?.torso || "red";
    const [r, g, b] = getWellnessStyleForGrade(torsoGrade).jointFill;
    noFill();
    stroke(r, g, b, 180);
    strokeWeight(2);
    ellipse(nose.x, nose.y, 20 + breathPulse, 20 + breathPulse);
  }

  pop();
}

// ---------------- Strict Timer & Directional Voice Coaching Loop ----------------
function updatePoseTimer(bestPose) {
  const now = millis();
  const dt = Math.min(0.25, Math.max(0, (now - lastUpdateMs) / 1000));
  lastUpdateMs = now;

  if (celebrationRemaining > 0) {
    celebrationRemaining -= dt;
    isPoseMatched = true;
    currentLimbStates = {
      torso: "green",
      leftArm: "green",
      rightArm: "green",
      leftLeg: "green",
      rightLeg: "green",
    };
    currentFeedback = "✨ Stillingen er fuldført i fuld harmoni... skifter roligt videre";
    if (celebrationRemaining <= 0) {
      if (completedPoses.size >= YOGA_POSES.length) {
        speakDanish("Hele forløbet er fuldført... tak til dig selv for denne stund. Vi starter roligt forfra.", { interrupt: true });
        completedPoses = new Set();
      }
      goToPose((currentPoseIndex + 1) % YOGA_POSES.length);
    }
    return;
  }

  const targetPose = YOGA_POSES[currentPoseIndex];
  if (!bestPose) {
    isPoseMatched = false;
    holdSeconds = Math.max(0, holdSeconds - dt * 1.5);
    currentFeedback = "Træd roligt ind foran kameraet, så kroppen ses tydeligt";
    currentGuidelines = [];
    return;
  }

  const metrics = getBodyMetrics(bestPose);
  if (!metrics) {
    isPoseMatched = false;
    holdSeconds = Math.max(0, holdSeconds - dt * 1.5);
    currentFeedback = "Træd et lille skridt tilbage, så skuldre og arme er synlige";
    currentGuidelines = [];
    return;
  }

  if (sessionPaused) {
    currentFeedback = "⏸ Pause — tag dig god tid. Tryk mellemrum for at fortsætte";
    return;
  }
  // Distance check: tell the user when they are too close / far, and when they are good.
  const distState = getDistanceState(bestPose, metrics);
  const nowMs = millis();
  if (distState !== "ok") {
    isPoseMatched = false;
    holdSeconds = Math.max(0, holdSeconds - dt * 0.5);
    currentGuidelines = [];
    currentFeedback =
      distState === "close"
        ? "📏 Træd et par skridt tilbage, så hele kroppen og fødderne ses — eller tryk 'Tæt på' (T)"
        : "📏 Kom lidt tættere på kameraet";
    distanceOkSince = 0;
    if (lastDistanceState !== distState || nowMs - lastDistanceSpokenAt > 9000) {
      lastDistanceSpokenAt = nowMs;
      speakDanish(
        distState === "close"
          ? "Træd roligt et par skridt tilbage... så jeg kan se hele kroppen og dine fødder."
          : "Kom gerne lidt tættere på kameraet.",
        { interrupt: lastDistanceState !== distState }
      );
    }
    lastDistanceState = distState;
    return;
  }
  if (lastDistanceState !== "ok") {
    if (!distanceOkSince) distanceOkSince = nowMs;
    if (nowMs - distanceOkSince > 700) {
      lastDistanceState = "ok";
      playWellnessChime("soft");
      speakDanish("Perfekt... nu er du i en god afstand. Bliv stående der.", { interrupt: true });
      lastHintSpokenAt = nowMs;
    }
  }

  const result = targetPose.evaluate(bestPose, metrics);
  if (closeUpMode) {
    // Legs are ignored in close-up mode: grade only torso and arms.
    const ls = result.limbStates || {};
    result.limbStates = { ...ls, leftLeg: "green", rightLeg: "green" };
    const upperGreen = ["torso", "leftArm", "rightArm"].every((k) => (ls[k] || "red") === "green");
    if (upperGreen) {
      result.matched = true;
      result.hint = "✨ Overkroppen er helt rigtig — hold stillingen roligt";
    }
    result.guidelines = (result.guidelines || []).filter((g) => !/ben|fod|knæ|ankel/i.test(g.label || ""));
  }
  const wasMatchedLastFrame = lastFrameMatched;
  lastFrameMatched = !!result.matched;
  if (wasMatchedLastFrame && !result.matched) {
    // Coach quickly (about 1s) after slipping out of green
    lastHintSpokenAt = Math.min(lastHintSpokenAt, millis() - 3800);
  }
  currentFeedback = result.hint;
  currentGuidelines = result.guidelines || [];
  currentLimbStates = result.limbStates || {
    torso: "red",
    leftArm: "red",
    rightArm: "red",
    leftLeg: "red",
    rightLeg: "red",
  };

  if (result.matched) {
    isPoseMatched = true;
    graceRemaining = GRACE_PERIOD_SECONDS;
    holdSeconds = Math.min(HOLD_TARGET_SECONDS, holdSeconds + dt);

    if (!matchStartAnnounced && holdSeconds > 0.3) {
      matchStartAnnounced = true;
      playWellnessChime("soft");
      speakDanish(
        `Smukt... alle linjer er grønne. Træk vejret roligt og bliv her i ${HOLD_TARGET_SECONDS} sekunder.`,
        { interrupt: true }
      );
    }

    if (!halfTimeAnnounced && holdSeconds >= HOLD_TARGET_SECONDS * 0.5) {
      halfTimeAnnounced = true;
      speakDanish("Du er halvvejs... sænk skuldrene og mærk roen i åndedrættet.", {
        interrupt: false,
      });
    }

    if (
      HOLD_TARGET_SECONDS > 20 &&
      halfTimeAnnounced &&
      now - lastBreathCueAt > 9000 &&
      !isSpeaking &&
      holdSeconds < HOLD_TARGET_SECONDS - 4
    ) {
      lastBreathCueAt = now;
      speakDanish(nextBreathCue());
    }

    if (holdSeconds >= HOLD_TARGET_SECONDS) {
      completedPoses.add(currentPoseIndex);
      celebrationRemaining = CELEBRATION_SECONDS;
      playWellnessChime("complete");
      speakDanish(
        "Stillingen er fuldført... rigtig flot klaret. Tag en dyb indånding, mens vi glider videre til næste øvelse.",
        { interrupt: true }
      );
    }
  } else {
    if (graceRemaining > 0 && holdSeconds > 0) {
      graceRemaining -= dt;
      isPoseMatched = true;
    } else {
      isPoseMatched = false;
      // If at least one part is orange, pause/slow-decay gently; if red, decay faster
      const hasOrange = Object.values(currentLimbStates).includes("orange");
      holdSeconds = Math.max(
        0,
        holdSeconds - dt * (hasOrange ? 0.35 : 1.15)
      );

      // Automatic directional voice coaching to guide user from Red/Orange to Green
      if (now - lastHintSpokenAt > 4800 && !isSpeaking) {
        const orangeGuide = currentGuidelines.find((g) => g.state === "orange");
        const redGuide = currentGuidelines.find((g) => g.state === "red");
        const targetGuide = orangeGuide || redGuide;
        if (targetGuide && targetGuide.voiceHint) {
          lastHintSpokenAt = now;
          speakDanish(wellnessPhrase(targetGuide.voiceHint), { interrupt: false });
        }
      }
    }
  }
}

// ---------------- Main Render Loop ----------------
function draw() {
  const t = millis() * 0.001;
  drawCalmBackground();
  if (!cam) return;

  uiButtons = [];
  const best = bodyPose?.hasResult() ? bodyPose.getBest() : null;
  updatePoseTimer(best);

  const pad = 20;
  const topBarH = 52;

  // --- Clean top bar ---
  push();
  noStroke();
  fill(230, 250, 238);
  textSize(20);
  textStyle(BOLD);
  textAlign(LEFT, CENTER);
  text("Hjemme Øvelser", pad + 4, 12 + topBarH * 0.5);
  let btnX = pad + 4 + textWidth("Hjemme Øvelser") + 28;
  textStyle(NORMAL);
  const btnY = 20;
  const btnH = 36;
  textSize(12);
  fill(175, 220, 195);
  text("Baggrund", btnX, 12 + topBarH * 0.5);
  btnX += textWidth("Baggrund") + 10;
  for (let i = 0; i < CAM_BGS.length; i++) {
    const b = CAM_BGS[i];
    const cx = btnX + 16, cy = btnY + btnH / 2;
    const ctx = drawingContext;
    if (b.colors) {
      const g = ctx.createLinearGradient(cx - 14, cy - 14, cx + 14, cy + 14);
      b.colors.forEach((c, k) => g.addColorStop(k / (b.colors.length - 1), c));
      ctx.fillStyle = g;
    } else ctx.fillStyle = "#3a4a44";
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
    if (!b.colors) { fill(255); textAlign(CENTER, CENTER); textSize(13); text("📷", cx, cy + 1); }
    noFill();
    stroke(camBgIndex === i ? color(255) : color(255, 255, 255, 40));
    strokeWeight(camBgIndex === i ? 2.5 : 1);
    circle(cx, cy, 34);
    noStroke();
    const idx = i;
    uiButtons.push({ x: cx - 17, y: cy - 17, w: 34, h: 34, onClick: () => {
      camBgIndex = idx;
      removeBackgroundEnabled = !!CAM_BGS[idx].colors;
    } });
    btnX += 40;
  }
  const icon = (x, label, active, onClick) => {
    textSize(13);
    const w = textWidth(label) + 22;
    fill(active ? color(68, 168, 122) : color(255, 255, 255, 22));
    rect(x - w, btnY, w, btnH, 18);
    fill(255);
    textAlign(CENTER, CENTER);
    text(label, x - w / 2, btnY + btnH / 2);
    uiButtons.push({ x: x - w, y: btnY, w, h: btnH, onClick });
    return x - w - 8;
  };
  let rx = width - pad;
  rx = icon(rx, "⚙ Indstillinger", showSettings, () => (showSettings = !showSettings));
  rx = icon(rx, voiceEnabled ? "🔊" : "🔇", voiceEnabled, () => {
    voiceEnabled = !voiceEnabled;
    if (!voiceEnabled) stopDanishVoice();
    else announceCurrentPose();
  });
  rx = icon(rx, "🗣 Gentag", false, () => { voiceEnabled = true; announceCurrentPose(); });
  pop();

  // --- Main Content Area: Segmented Wellness Camera (Left) + Guidelines (Right) ---
  const contentY = 12 + topBarH + 14;
  const camW = 640;
  const camH = 480;

  push();
  translate(pad, contentY);

  // Soft wellness frame
  fill(18, 42, 32, 200);
  noStroke();
  rect(-6, -6, camW + 12, camH + 12, 18);

  // Clip rounded camera view
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.roundRect(0, 0, camW, camH, 14);
  drawingContext.clip();

  if (removeBackgroundEnabled) {
    drawCamBackground(0, 0, camW, camH, t);

    // 2. Draw segmented person silhouette (background removed) if ready, else soft-blended camera
    if (segmentationReady && personLayerCanvas) {
      drawingContext.drawImage(personLayerCanvas, 0, 0, camW, camH);
    } else {
      drawingContext.globalAlpha = 0.42;
      image(cam, 0, 0, camW, camH);
      drawingContext.globalAlpha = 1.0;
    }
  } else {
    image(cam, 0, 0, camW, camH);
  }

  // Draw target alignment circles & Wellness Body Skeleton (Red -> Orange -> Green per limb)
  if (best) {
    drawPoseTargetGuides(best);
    drawWellnessBodyModel(best, currentLimbStates);
  }
  drawingContext.restore();

  // Determine overall border wellness color (Green / Orange / Red)
  const limbVals = Object.values(currentLimbStates);
  const anyOrangeOrGreen =
    limbVals.includes("orange") || limbVals.includes("green");
  const borderCol = isPoseMatched
    ? color(115, 232, 172, 220)
    : anyOrangeOrGreen
    ? color(248, 184, 98, 205)
    : color(232, 114, 114, 195);

  noFill();
  stroke(borderCol);
  strokeWeight(4.5);
  rect(0, 0, camW, camH, 14);

  // Top-left status pill showing Red / Orange / Green state legend
  noStroke();
  fill(16, 36, 28, 210);
  rect(14, 14, 385, 38, 12);

  fill(borderCol);
  ellipse(32, 33, 12, 12);
  fill(240, 252, 245);
  textSize(13);
  textAlign(LEFT, CENTER);
  text(
    celebrationRemaining > 0
      ? "✨ Fuldført i harmoni (15s)"
      : isPoseMatched
      ? "🟢 Alle kropslinjer er grønne — hold roen"
      : "🔴 Rød: Juster   🟠 Orange: Tæt på   🟢 Grøn: Rigtig",
    48,
    33
  );

  // Bottom 15s hold timer overlay inside video
  const barY = camH - 68;
  fill(16, 36, 28, 220);
  rect(14, barY, camW - 28, 54, 12);

  const progress = constrain(holdSeconds / HOLD_TARGET_SECONDS, 0, 1);
  fill(35, 68, 52);
  rect(26, barY + 32, camW - 52, 12, 6);
  fill(borderCol);
  rect(26, barY + 32, (camW - 52) * progress, 12, 6);

  fill(240, 252, 245);
  textSize(13);
  textAlign(LEFT, CENTER);
  text(currentFeedback, 26, barY + 16);

  textAlign(RIGHT, CENTER);
  text(
    `Holdt: ${holdSeconds.toFixed(1)}s / ${HOLD_TARGET_SECONDS.toFixed(0)}s`,
    camW - 26,
    barY + 16
  );
  pop();

  // --- Right Side Panel: Pose Illustration + Red/Orange/Green Guidelines ---
  const panelX = pad * 2 + camW;
  const panelW = Math.max(330, Math.min(470, width - panelX - pad));
  const targetPose = YOGA_POSES[currentPoseIndex];

  push();
  translate(panelX, contentY);

  fill(20, 44, 34, 225);
  stroke(140, 225, 180, 65);
  strokeWeight(1.5);
  rect(0, 0, panelW, camH, 16);

  noStroke();
  fill(240, 255, 245);
  textSize(19);
  textAlign(LEFT, TOP);
  text(targetPose.name, 18, 16);

  fill(175, 220, 195);
  textSize(12.5);
  text(
    `${MODES[currentModeIndex].label} • Øvelse ${currentPoseIndex + 1} af ${YOGA_POSES.length} • Fuldført ${completedPoses.size}`,
    18,
    42
  );

  // Prev / Next buttons
  const navW = 36;
  const navH = 30;
  const prevX = panelW - 92;
  const nextX = panelW - 50;
  fill(38, 75, 58);
  rect(prevX, 16, navW, navH, 8);
  rect(nextX, 16, navW, navH, 8);
  fill(255);
  textSize(15);
  textAlign(CENTER, CENTER);
  text("←", prevX + navW * 0.5, 16 + navH * 0.5);
  text("→", nextX + navW * 0.5, 16 + navH * 0.5);

  uiButtons.push({
    x: panelX + prevX,
    y: contentY + 16,
    w: navW,
    h: navH,
    onClick: () =>
      goToPose((currentPoseIndex - 1 + YOGA_POSES.length) % YOGA_POSES.length),
  });
  uiButtons.push({
    x: panelX + nextX,
    y: contentY + 16,
    w: navW,
    h: navH,
    onClick: () => goToPose((currentPoseIndex + 1) % YOGA_POSES.length),
  });

  // Cropped Yoga Pose Illustration
  const imgBoxX = 18;
  const imgBoxY = 66;
  const imgBoxW = 145;
  const imgBoxH = 172;

  fill(248, 252, 249);
  rect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 12);

  const cropImg = targetPose.cropImg;
  if (!cropImg && targetPose.emoji) {
    textAlign(CENTER, CENTER);
    textSize(64);
    text(targetPose.emoji, imgBoxX + imgBoxW * 0.5, imgBoxY + imgBoxH * 0.5 - 10);
    fill(60, 110, 85);
    textSize(11);
    text(targetPose.subtitle || "", imgBoxX + 6, imgBoxY + imgBoxH - 30, imgBoxW - 12, 26);
  }
  if (cropImg) {
    const scale = Math.min(
      (imgBoxW - 14) / cropImg.width,
      (imgBoxH - 14) / cropImg.height
    );
    const drawW = cropImg.width * scale;
    const drawH = cropImg.height * scale;
    const drawX = imgBoxX + (imgBoxW - drawW) * 0.5;
    const drawY = imgBoxY + (imgBoxH - drawH) * 0.5;
    image(cropImg, drawX, drawY, drawW, drawH);
  }

  const descX = imgBoxX + imgBoxW + 14;
  const descW = panelW - descX - 18;
  fill(135, 232, 180);
  textSize(12);
  textAlign(LEFT, TOP);
  text("MINDFUL GUIDE:", descX, imgBoxY + 4);

  fill(232, 246, 238);
  textSize(13.5);
  textLeading(19);
  text(targetPose.instruction, descX, imgBoxY + 24, descW, 145);

  // --- Guidelines Checklist with Red / Orange / Green states ---
  const guideY = imgBoxY + imgBoxH + 14;
  fill(240, 255, 245);
  textSize(13.5);
  textAlign(LEFT, TOP);
  text("Kropsdele & Præcision (Rød → Orange → Grøn):", 18, guideY);

  const listStartY = guideY + 24;
  const rowH = 36;
  const guidelinesToShow =
    currentGuidelines.length > 0
      ? currentGuidelines
      : [
          { label: "Træd ind foran kameraet", state: "red" },
          { label: "Følg kropslinjerne mod den grønne zone", state: "red" },
          { label: `Hold stillingen roligt i ${HOLD_TARGET_SECONDS} sekunder`, state: "red" },
        ];

  for (let i = 0; i < guidelinesToShow.length; i++) {
    const g = guidelinesToShow[i];
    const ry = listStartY + i * (rowH + 6);
    const st = g.state || (g.passed ? "green" : "red");

    if (st === "green") {
      fill(32, 92, 64, 225);
      stroke(115, 232, 172);
    } else if (st === "orange") {
      fill(88, 66, 32, 220);
      stroke(248, 184, 98);
    } else {
      fill(78, 38, 42, 210);
      stroke(232, 114, 114, 165);
    }
    strokeWeight(1.5);
    rect(18, ry, panelW - 36, rowH, 10);

    noStroke();
    textSize(14);
    textAlign(LEFT, CENTER);
    const badge = st === "green" ? "🟢" : st === "orange" ? "🟠" : "🔴";
    text(badge, 30, ry + rowH * 0.5);

    fill(245, 252, 248);
    textSize(12.8);
    text(g.label, 56, ry + rowH * 0.5);
  }

  // Bottom 15-second status banner in right card
  const timerBoxY = camH - 56;
  fill(
    isPoseMatched
      ? color(32, 96, 66)
      : anyOrangeOrGreen
      ? color(85, 64, 32)
      : color(75, 36, 40)
  );
  stroke(borderCol);
  strokeWeight(2);
  rect(18, timerBoxY, panelW - 36, 42, 12);

  noStroke();
  fill(255);
  textSize(14.5);
  textAlign(CENTER, CENTER);
  const remaining = Math.max(0, HOLD_TARGET_SECONDS - holdSeconds);
  text(
    celebrationRemaining > 0
      ? "✨ Fuldført! Glider videre til næste stilling..."
      : isPoseMatched
      ? `🌿 Hold roen i grøn: ${remaining.toFixed(1)} sek. tilbage`
      : anyOrangeOrGreen
      ? "🟠 Næsten på plads — finjustér de orange linjer til grøn"
      : `🔴 Følg stemmen for at samle linjerne i grøn (${HOLD_TARGET_SECONDS}s)`,
    panelW * 0.5,
    timerBoxY + 21
  );

  pop();

  drawSessionBar(pad, contentY + camH + 16);
}

// ---------------- Bottom session bar: mode, strictness, hold time, pause, sound ----------------
function drawSessionBar(pad, y) {
  const h = 40;
  push();
  fill(22, 46, 36, 215);
  stroke(140, 225, 180, 65);
  strokeWeight(1);
  rect(pad, y, width - pad * 2, (h + 6) * (showSettings && width < 1500 ? 2 : 1) + 10, 14);

  let x = pad + 12;
  let by = y + 8;
  const wrap = (w) => {
    if (x + w > width - pad - 12) {
      x = pad + 12;
      by += h + 6;
    }
  };
  const btn = (label, active, onClick, tone) => {
    textSize(12.5);
    const w = textWidth(label) + 20;
    wrap(w);
    fill(active ? color(68, 168, 122) : tone || color(32, 62, 48, 200));
    stroke(active ? color(155, 245, 200) : color(140, 210, 175, 50));
    strokeWeight(1);
    rect(x, by, w, h, 10);
    noStroke();
    fill(245, 255, 250);
    textAlign(CENTER, CENTER);
    text(label, x + w * 0.5, by + h * 0.5);
    uiButtons.push({ x, y: by, w, h, onClick });
    x += w + 6;
  };
  const sep = (label) => {
    noStroke();
    fill(175, 220, 195);
    textSize(11.5);
    textAlign(LEFT, CENTER);
    wrap(textWidth(label) + 60);
    text(label, x + 4, by + h * 0.5);
    x += textWidth(label) + 12;
  };

  sep("Hvor gør det ondt?");
  MODES.forEach((m, i) => btn(m.label, currentModeIndex === i, () => setMode(i)));
  if (!showSettings) { pop(); return; }
  x += 10;
  sep("Præcision");
  STRICTNESS_LEVELS.forEach((l, i) =>
    btn(l.label, strictnessIndex === i, () => (strictnessIndex = i))
  );
  x += 10;
  sep("Hold");
  HOLD_OPTIONS.forEach((sec, i) =>
    btn(`${sec}s`, holdOptionIndex === i, () => {
      holdOptionIndex = i;
      HOLD_TARGET_SECONDS = sec;
      holdSeconds = Math.min(holdSeconds, sec);
    })
  );
  x += 10;
  btn(sessionPaused ? "▶ Fortsæt" : "⏸ Pause", sessionPaused, togglePause);
  btn(ambientEnabled ? "🎵 Rolig lyd: TIL" : "🎵 Rolig lyd", ambientEnabled, () =>
    setAmbient(!ambientEnabled)
  );
  btn(showCameraGuides ? "◎ Mål: TIL" : "◎ Mål: FRA", showCameraGuides, () => {
    showCameraGuides = !showCameraGuides;
  });
  btn(closeUpMode ? "🪑 Tæt på: TIL" : "🪑 Tæt på", closeUpMode, () => {
    closeUpMode = !closeUpMode;
  });
  pop();
}
