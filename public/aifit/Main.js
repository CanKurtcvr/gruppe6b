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
let currentFeedback = "Træd stille ind foran kameraet og find din plads";
let currentGuidelines = [];
let currentLimbStates = {
  torso: "red",
  leftArm: "red",
  rightArm: "red",
  leftLeg: "red",
  rightLeg: "red",
};
let completedPoses = new Set();
let sessionSummaryActive = false;
let sessionSummaryData = null;
let sessionStartMs = 0;
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
  const lvl = DISTANCE_LEVELS[distanceLevelIndex];
  if (lvl.off) return "ok";
  if (m.shoulderWidth < CAM_W * lvl.far) return "far";
  const nose = pose.nose;
  if (lvl.edge >= 0 && (!ptOK(nose, 0.3) || nose.y < CAM_H * lvl.edge)) return "head";
  const ls = pose.left_shoulder, rs = pose.right_shoulder;
  if (ptOK(ls, 0.3) && ptOK(rs, 0.3) && lvl.edge >= 0) {
    const cx = (ls.x + rs.x) / 2;
    const margin = CAM_W * (0.12 + lvl.edge);
    if (cx < margin) return "edgeLeft";
    if (cx > CAM_W - margin) return "edgeRight";
  }
  if (closeUpMode) return "ok";
  // Siddende øvelser: fødderne skal ikke være med i billedet.
  const curPose = YOGA_POSES[currentPoseIndex];
  if (currentPosture === "sit" || (curPose && curPose.posture === "sit")) return "ok";
  const ankleSeen = (p) => ptOK(p, 0.3) && p.y < CAM_H * (1 - Math.max(0, lvl.edge) * 0.5);
  if (!ankleSeen(pose.left_ankle) && !ankleSeen(pose.right_ankle)) return "close";
  return "ok";
}
// Screen text + spoken line for each distance problem.
// The camera image is mirrored, so "left in camera" means the user's right.
const DISTANCE_MSG = {
  far: ["📏 Kom et skridt tættere", "Kom gerne et lille skridt tættere på kameraet."],
  close: ["📏 Træd tilbage – fødderne skal ses", "Træd stille et par skridt tilbage... så jeg kan se dine fødder."],
  head: ["📏 Hovedet er udenfor – træd tilbage", "Dit hoved er lidt udenfor billedet... træd et skridt tilbage."],
  edgeLeft: ["⬅ Gå lidt mod venstre", "Gå et lille skridt til venstre, så du står midt i billedet."],
  edgeRight: ["➡ Gå lidt mod højre", "Gå et lille skridt til højre, så du står midt i billedet."],
};
let lastFrameMatched = false;
let lastBreathCueAt = 0;
const exercisePreparation = createExercisePreparation();
let lastPreparationNumber = 0;

// Background removal (Selfie Segmentation) onto Green Wellness Gradient
let removeBackgroundEnabled = false;
let selfieSegmentation = null;
let segmentationReady = false;
let segmentationBusy = false;
let personLayerCanvas = null;
let personLayerCtx = null;

// Calm background themes (Default: Green Wellness Gradient)
const CAM_BGS = [
  { id: "none", label: "Ingen", colors: null },
  { id: "forest", label: "Natur", icon: "🌳", music: "forest", video: "/__l5e/assets-v1/fcfb255f-d9a8-431b-aa34-6d225c87dfef/forest-bg.mp4", colors: ["#1f3b24", "#4f7a3c", "#a8c97f"] },
  { id: "beach", label: "Havet", icon: "🌊", music: "beach", video: "/__l5e/assets-v1/c9dafba9-12f9-4406-b1cb-86456c7865a4/beach-bg.mp4", colors: ["#2a8fb8", "#9fe0ea", "#f3e2c0"] },
];
let camBgIndex = 0;
let showSettings = false;
function drawCamBackground(x, y, w, h, t) {
  const b = CAM_BGS[camBgIndex];
  if (!b || !b.colors || b.id === "green") return drawGreenWellnessGradientRect(x, y, w, h, t);
  const ctx = drawingContext;
  if (b.video) {
    const v = getBgVideo(b.video);
    if (v.paused) v.play().catch(() => {});
    if (v.readyState >= 2 && v.videoWidth) {
      const sc = Math.max(w / v.videoWidth, h / v.videoHeight);
      const vw = v.videoWidth * sc, vh = v.videoHeight * sc;
      ctx.drawImage(v, x + (w - vw) / 2, y + (h - vh) / 2, vw, vh);
      return;
    }
  }
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

function speakWithBrowserFallback(text, token, rate = 0.85) {
  if (typeof window === "undefined" || !window.speechSynthesis || token !== speechToken) {
    if (token === speechToken) isSpeaking = false;
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "da-DK";
  utter.rate = rate;
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
    `Nu skal vi lave ${p.name}. ${p.voiceIntro}`,
    { interrupt: true }
  );
  lastHintSpokenAt = millis();
}

function introduceCurrentPose() {
  const p = YOGA_POSES[currentPoseIndex];
  if (!p) return;
  exercisePreparation.start(Math.min(12, Math.max(4, (p.instruction || p.voiceIntro || "").split(/\s+/).length / 2.5)));
  lastPreparationNumber = 0;
  lastDistanceState = "ok";
  distanceOkSince = 0;
  currentGuidelines = [];
  currentFeedback = "Se øvelsen — find din stilling";
  if (!sessionPaused) announceCurrentPose();
}

function announcePreparationNumber(number) {
  if (!voiceEnabled) return;
  // Local short cues avoid generation delays between the five countdown beats.
  stopDanishVoice();
  isSpeaking = true;
  const words = ["", "en", "to", "tre", "fire", "fem"];
  speakWithBrowserFallback(words[number], speechToken, 1.15);
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

function ptOK(p, minC = 0.2) {
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
    return `Før nænsomt ${partName} ind i kameraets synsfelt.`;
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
      : `Før nænsomt ${partName} `;

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
              : "Løft nænsomt den ene fod op langs det modsatte ben for at komme ind i Træet.";
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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
      "Lad armene svæve nænsomt op over hovedet, og saml dine håndflader lige over issen.",
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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
      "Stå bredt med benene. Lad den ene hånd glide ned langs benet, mens den anden arm strækkes nænsomt mod himlen.",
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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
      "Bøj knæene dybt, sænk hofterne nænsomt ned, og saml håndfladerne præcist foran hjertet.",
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
              : "Bøj knæene og sænk hofterne nænsomt længere ned mod gulvet.",
        },
        {
          label: "Løftet bryst og lige skuldre",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold brystet løftet og skuldrene lige.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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
      "Træd stille ud i Kriger 1, og løft begge arme strakt op mod himlen med bløde skuldre.",
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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
      "Lad overkroppen glide nænsomt fremad i Hundestrækket med hænderne mod gulvet og hofterne løftet.",
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
              : "Bøj forsigtigt overkroppen frem og ned, så hofterne er øverst.",
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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
      "Støt forsigtigt med hænderne mod gulvet og løft det ene ben højt og strakt op bagud.",
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
              : "Løft nænsomt det ene ben højt op bag dig.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
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
              : "Fold overkroppen nænsomt forover fra hoften.",
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

      const allGreen = guidelines.every((g) => g.state !== "red");
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

// Difficulty (1 let, 2 mellem, 3 svær) and posture for each yoga pose
const __yogaTags = { 1: [2, "stand"], 2: [2, "stand"], 3: [2, "stand"], 4: [3, "stand"], 5: [1, "sit"], 6: [1, "sit"], 7: [1, "sit"], 8: [3, "sit"], 9: [2, "stand"], 10: [3, "stand"], 11: [3, "stand"], 12: [2, "stand"] };
YOGA_LIBRARY.forEach((p) => { if (__yogaTags[p.id]) [p.level, p.posture] = __yogaTags[p.id]; });
let YOGA_POSES = buildSession("yoga", YOGA_LIBRARY);

function setMode(index) {
  currentModeIndex = index;
  currentProgram = null;
  sessionSummaryActive = false;
  sessionStartMs = millis();
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

  introduceCurrentPose();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ---------------- Green Wellness Gradient & Scenic Backgrounds ----------------
function drawGreenWellnessGradientRect(x, y, w, h, t) {
  const ctx = drawingContext;
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x + w * 0.85, y + h);
  grad.addColorStop(0, "#2e2142");
  grad.addColorStop(0.45, "#4f3a70");
  grad.addColorStop(1, "#3a2648");
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
  radGrad.addColorStop(0, "rgba(244, 166, 198, 0.22)");
  radGrad.addColorStop(0.55, "rgba(199, 180, 239, 0.12)");
  radGrad.addColorStop(1, "rgba(46, 33, 66, 0)");
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
      fill(200 + w * 15, 160 + w * 10, 220 - w * 10, 26);
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
  fill(250, 225, 240, 95);
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
  // While the summary is up, only its own buttons respond.
  if (sessionSummaryActive) {
    for (const btn of uiButtons) {
      if (!btn.summary) continue;
      if (mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h) {
        btn.onClick();
        return;
      }
    }
    return;
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
    introduceCurrentPose();
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
    toggleFullscreen();
  }
  return false;
}

function togglePause() {
  sessionPaused = !sessionPaused;
  if (sessionPaused) {
    stopDanishVoice();
  } else {
    lastUpdateMs = millis();
    if (exercisePreparation.phase !== "active") introduceCurrentPose();
    else speakDanish("Vi fortsætter nænsomt... når du er klar.", { interrupt: true });
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
  introduceCurrentPose();
}

// ---------------- Wellness Styling for Body Lines (Red -> Orange -> Green) ----------------
function getWellnessStyleForGrade(grade) {
  if (grade === "green") {
    return {
      stroke: "rgba(126, 216, 176, 0.95)",
      core: "rgba(235, 255, 245, 0.88)",
      glow: "rgba(95, 228, 165, 0.65)",
      jointFill: [126, 216, 176],
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
    stroke: "rgba(255, 134, 154, 0.92)",
    core: "rgba(255, 228, 228, 0.78)",
    glow: "rgba(228, 100, 100, 0.52)",
    jointFill: [255, 134, 154],
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
    fill(isGreen ? color(126, 216, 176, 50) : color(244, 166, 198, 45));
    stroke(isGreen ? color(126, 216, 176, 230) : color(244, 166, 198, 230));
    strokeWeight(2);
    drawingContext.setLineDash([6, 6]);
    ellipse(z.x, z.y, z.r * 2 * pulse, z.r * 2 * pulse);
    drawingContext.setLineDash([]);

    if (false && z.label) {
      noStroke();
      fill(20, 42, 34, 185);
      textSize(11.5);
      const tw = textWidth(z.label) + 16;
      rect(z.x - tw * 0.5, z.y - z.r - 24, tw, 20, 10); // label
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
    ctx.lineWidth = 11;
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
    ellipse(p.x, p.y, 14, 14);

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

  if (sessionPaused) return;
  if (exercisePreparation.phase !== "active") {
    exercisePreparation.tick(dt, { speaking: isSpeaking, voice: voiceEnabled });
    isPoseMatched = false;
    if (exercisePreparation.phase === "countdown") {
      const number = Math.ceil(exercisePreparation.remaining);
      currentFeedback = "Gør dig klar";
      if (number !== lastPreparationNumber) {
        lastPreparationNumber = number;
        announcePreparationNumber(number);
      }
    } else if (exercisePreparation.phase === "active") {
      stopDanishVoice();
      playWellnessChime("soft");
      currentFeedback = "Begynd — find stillingen";
      lastHintSpokenAt = now;
    }
    return;
  }

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
    currentFeedback = "✨ Stillingen er fuldført i fuld harmoni... skifter videre";
    if (celebrationRemaining <= 0) {
      if (completedPoses.size >= YOGA_POSES.length) {
        const secs = sessionStartMs ? Math.round((millis() - sessionStartMs) / 1000) : 0;
        sessionSummaryData = {
          count: completedPoses.size,
          mins: Math.max(1, Math.round(secs / 60)),
          tip: SUMMARY_TIPS[Math.floor(Math.random() * SUMMARY_TIPS.length)],
        };
        sessionSummaryActive = true;
        sessionPaused = false;
        stopDanishVoice();
        speakDanish("Hele forløbet er fuldført... skønt klaret. Læn dig tilbage og nyd roen.", { interrupt: true });
        completedPoses = new Set();
      } else {
        goToPose((currentPoseIndex + 1) % YOGA_POSES.length);
      }
    }
    return;
  }

  const targetPose = YOGA_POSES[currentPoseIndex];
  if (!bestPose) {
    isPoseMatched = false;
    holdSeconds = Math.max(0, holdSeconds - dt * 1.5);
    currentFeedback = "Træd stille ind foran kameraet, så kroppen ses tydeligt";
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

  // Distance check: tell the user when they are too close / far, and when they are good.
  const distState = getDistanceState(bestPose, metrics);
  const nowMs = millis();
  if (distState !== "ok") {
    isPoseMatched = false;
    holdSeconds = Math.max(0, holdSeconds - dt * 0.5);
    currentGuidelines = [];
    currentFeedback = DISTANCE_MSG[distState][0];
    distanceOkSince = 0;
    if (lastDistanceState !== distState || nowMs - lastDistanceSpokenAt > 9000) {
      lastDistanceSpokenAt = nowMs;
      speakDanish(DISTANCE_MSG[distState][1], { interrupt: lastDistanceState !== distState });
    }
    lastDistanceState = distState;
    return;
  }
  if (lastDistanceState !== "ok") {
    if (!distanceOkSince) distanceOkSince = nowMs;
    if (nowMs - distanceOkSince > 700) {
      lastDistanceState = "ok";
      playWellnessChime("soft");
      const seatedNow = currentPosture === "sit" || ((YOGA_POSES[currentPoseIndex] || {}).posture === "sit");
      speakDanish(seatedNow ? "Perfekt... nu er du i en god afstand. Bliv siddende der." : "Perfekt... nu er du i en god afstand. Bliv stående der.", { interrupt: true });
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
      result.hint = "✨ Overkroppen er helt rigtig — hold stillingen uden hast";
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
        `Smukt... alle linjer er grønne. Lad åndedrættet flyde og bliv her i ${HOLD_TARGET_SECONDS} sekunder.`,
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
// ---------------- Pastel palette (lavender / rose / plum, analog + soft mint as "correct") ----------------
const PAL = {
  plum: [46, 33, 66],
  plumSoft: [74, 55, 102],
  lilac: [199, 180, 239],
  rose: [244, 166, 198],
  cream: [251, 245, 252],
  ink: [52, 36, 74],
  inkSoft: [118, 96, 140],
  good: [126, 216, 176],
  near: [255, 192, 122],
  bad: [255, 134, 154],
};
const pc = (a, al = 255) => color(a[0], a[1], a[2], al);
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function toggleFullscreen() {
  const el = document.documentElement;
  if (!isFullscreen()) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
}

// Smooth keypoints over frames so tracking is steadier and easier to match
let smoothPose = null;
function smoothBest(p) {
  if (!p) { smoothPose = null; return null; }
  if (!smoothPose) smoothPose = {};
  const out = Object.assign(Object.create(Object.getPrototypeOf(p)), p);
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (!v || typeof v !== "object" || !Number.isFinite(v.x)) continue;
    const prev = smoothPose[k];
    const c = v.c ?? 1;
    if (prev && c > 0.15) {
      const a = 0.45;
      out[k] = { ...v, x: prev.x + (v.x - prev.x) * a, y: prev.y + (v.y - prev.y) * a, c: Math.max(c, prev.c * 0.85) };
    } else if (prev && c <= 0.15) {
      out[k] = { ...prev, c: prev.c * 0.8 };
    }
    smoothPose[k] = out[k];
  }
  return out;
}

function draw() {
  const t = millis() * 0.001;
  drawCalmBackground();
  if (!cam) return;

  uiButtons = [];
  const raw = bodyPose?.hasResult() ? bodyPose.getBest() : null;
  const best = smoothBest(raw);
  if (!sessionStartMs) sessionStartMs = millis();
  if (!sessionSummaryActive) updatePoseTimer(best);

  const fs = isFullscreen();
  const pad = fs ? 14 : 20;
  const topBarH = fs ? 0 : 72;
  const big = Math.max(1, Math.min(width / 1280, height / 800)) * TEXT_SIZES[textSizeIndex].s; // text scale
  const hideText = !!TEXT_SIZES[textSizeIndex].hide;

  const pill = (x, y, label, active, onClick, w0) => {
    textSize(18);
    const w = w0 || textWidth(label) + 36;
    noStroke();
    fill(active ? pc(PAL.rose) : pc(PAL.cream, 40));
    rect(x, y, w, 48, 24);
    fill(active ? pc(PAL.ink) : pc(PAL.cream));
    textAlign(CENTER, CENTER);
    text(label, x + w / 2, y + 24);
    uiButtons.push({ x, y, w, h: 48, onClick });
    return w;
  };

  // --- Top bar (hidden in fullscreen) ---
  if (!fs) {
    push();
    noStroke();
    fill(pc(PAL.cream));
    textSize(26);
    textStyle(BOLD);
    textAlign(LEFT, CENTER);
    text("Hjemme Øvelser", pad + 4, 12 + topBarH * 0.5);
    textStyle(NORMAL);
    let rx = width - pad;
    const btnY = 12 + topBarH * 0.5 - 24;
    textSize(18);
    const items = [
      ["⛶ Fuld skærm", false, toggleFullscreen],
      ["⚙ Indstillinger", showSettings, () => (showSettings = !showSettings)],
      [voiceEnabled ? "🔊" : "🔇", voiceEnabled, () => { voiceEnabled = !voiceEnabled; if (!voiceEnabled) stopDanishVoice(); else if (exercisePreparation.phase !== "active") introduceCurrentPose(); }],
      ["🗣 Gentag", false, () => { voiceEnabled = true; introduceCurrentPose(); }],
    ];
    for (const [l, a, f] of items) {
      const w = textWidth(l) + 36;
      rx -= w;
      pill(rx, btnY, l, a, f, w);
      rx -= 10;
    }
    pop();
  }

  // --- Layout: big camera left, illustration right ---
  const barH = fs ? 0 : (showSettings ? 4 : 1) * 58 + 14;
  const contentY = pad + topBarH;
  const availH = height - contentY - pad - (fs ? 0 : barH + 12);
  const sideW = 58; // toggle buttons (skov / hav / musik) left of the camera
  const camAreaW = (width - pad * 3 - sideW) * (fs ? 0.7 : 0.64);
  const s = Math.max(0.3, Math.min(camAreaW / CAM_W, availH / CAM_H));
  const camW = CAM_W * s;
  const camH = CAM_H * s;
  const camX = pad + sideW + 12;
  const camY = contentY + (availH - camH) / 2;

  const limbVals = Object.values(currentLimbStates);
  const anyOrangeOrGreen = limbVals.includes("orange") || limbVals.includes("green");
  const preparing = exercisePreparation.phase !== "active";
  const stateCol = preparing ? PAL.lilac : isPoseMatched ? PAL.good : anyOrangeOrGreen ? PAL.near : PAL.bad;

  push();
  translate(camX, camY);
  noStroke();
  fill(pc(PAL.plum, 200));
  rect(-6, -6, camW + 12, camH + 12, 26);
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.roundRect(0, 0, camW, camH, 22);
  drawingContext.clip();
  push();
  scale(s);
  if (removeBackgroundEnabled) {
    drawCamBackground(0, 0, CAM_W, CAM_H, t);
    if (segmentationReady && personLayerCanvas) {
      drawingContext.drawImage(personLayerCanvas, 0, 0, CAM_W, CAM_H);
    } else {
      drawingContext.globalAlpha = 0.42;
      image(cam, 0, 0, CAM_W, CAM_H);
      drawingContext.globalAlpha = 1.0;
    }
  } else {
    image(cam, 0, 0, CAM_W, CAM_H);
  }
  if (best && !preparing) {
    drawPoseTargetGuides(best);
    drawWellnessBodyModel(best, currentLimbStates);
  }
  pop();
  drawingContext.restore();

  noFill();
  stroke(pc(stateCol, 230));
  strokeWeight(8);
  rect(0, 0, camW, camH, 22);

  // Big feedback + progress at the bottom of the camera
  const fbH = 60 * big + 50;
  const fbY = camH - fbH - 16;
  noStroke();
  fill(pc(PAL.plum, 215));
  rect(16, fbY, camW - 32, fbH, 20);
  const progress = constrain(holdSeconds / HOLD_TARGET_SECONDS, 0, 1);
  fill(pc(PAL.cream, 50));
  rect(32, fbY + fbH - 26, camW - 64, 12, 6);
  fill(pc(stateCol));
  rect(32, fbY + fbH - 26, (camW - 64) * progress, 12, 6);
  fill(pc(PAL.cream));
  textSize(26 * big);
  textAlign(LEFT, CENTER);
  const fb = sessionSummaryActive
    ? "🌸 Skønt klaret... hvile nu"
    : celebrationRemaining > 0 ? "✨ Flot! Videre til næste" : currentFeedback;
  if (!hideText || fb.startsWith("📏") || /^[⬅➡]/.test(fb)) text(fb.length > 70 ? fb.slice(0, 68) + "…" : fb, 32, fbY + (fbH - 26) / 2 + 4, camW - 64 - 110 * big);
  textAlign(RIGHT, CENTER);
  textStyle(BOLD);
  textSize(34 * big);
  text(preparing ? "" : `${Math.ceil(Math.max(0, HOLD_TARGET_SECONDS - holdSeconds))}s`, camW - 32, fbY + (fbH - 26) / 2 + 4);
  textStyle(NORMAL);

  if (exercisePreparation.phase === "countdown" && !sessionPaused) {
    fill(pc(PAL.plum, 225));
    circle(camW / 2, camH / 2 - 24, Math.min(180, camH * 0.38));
    fill(pc(PAL.cream));
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(Math.min(100, camH * 0.23));
    text(Math.ceil(exercisePreparation.remaining), camW / 2, camH / 2 - 24);
    textStyle(NORMAL);
  }

  if (sessionPaused) {
    fill(pc(PAL.plum, 170));
    rect(0, 0, camW, camH, 22);
    fill(pc(PAL.cream));
    textAlign(CENTER, CENTER);
    textSize(54 * big);
    text("⏸ Pause", camW / 2, camH / 2);
  }
  pop();

  // --- Toggle buttons (skov / hav / musik) to the left of the camera ---
  push();
  noStroke();
  textAlign(CENTER, CENTER);
  const btnD = Math.min(56, sideW - 2);
  const totalH = btnD * 3 + 28;
  let byy = camY + (camH - totalH) / 2;
  const sideBtn = (emoji, active, onClick) => {
    fill(pc(active ? PAL.rose : PAL.cream, active ? 235 : 90));
    circle(pad + sideW / 2, byy + btnD / 2, btnD);
    fill(pc(PAL.ink));
    textSize(btnD * 0.5);
    text(emoji, pad + sideW / 2, byy + btnD / 2 + 1);
    uiButtons.push({ x: pad + sideW / 2 - btnD / 2, y: byy, w: btnD, h: btnD, onClick });
    byy += btnD + 14;
  };
  const toggleBg = (idx, theme) => {
    if (camBgIndex === idx) {
      camBgIndex = 0;
      removeBackgroundEnabled = false;
      setAmbient(false);
      musicTheme = "calm";
    } else {
      camBgIndex = idx;
      removeBackgroundEnabled = true;
      setMusicTheme(theme);
    }
  };
  sideBtn("🌳", camBgIndex === 1, () => toggleBg(1, "forest"));
  sideBtn("🌊", camBgIndex === 2, () => toggleBg(2, "beach"));
  sideBtn("🎵", ambientEnabled, () => setAmbient(!ambientEnabled));
  pop();

  // --- Right panel: illustration first, minimal big text ---
  const panelX = camX + camW + pad;
  const panelW = width - panelX - pad;
  const panelY = camY;
  const panelH = camH;
  const targetPose = YOGA_POSES[currentPoseIndex];
  push();
  translate(panelX, panelY);
  noStroke();
  fill(pc(PAL.cream, 245));
  rect(0, 0, panelW, panelH, 26);

  const headH = 30 * big + 30;
  fill(pc(PAL.ink));
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(Math.min(30 * big, panelW / 14));
  text(targetPose.name, 22, 14 + headH / 2, panelW - 44);
  textStyle(NORMAL);

  // Illustration
  const navH = 64;
  const imgX = 16, imgY = headH + 18, imgW = panelW - 32, imgH = panelH - imgY - navH - 30;
  fill(pc(PAL.lilac, 70));
  rect(imgX, imgY, imgW, imgH, 20);
  const cropImg = targetPose.cropImg;
  if (cropImg) {
    const sc = Math.min((imgW - 20) / cropImg.width, (imgH - 20) / cropImg.height);
    const dw = cropImg.width * sc, dh = cropImg.height * sc;
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.roundRect(imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh, 16);
    drawingContext.clip();
    image(cropImg, imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh);
    drawingContext.restore();
  } else if (targetPose.emoji) {
    textAlign(CENTER, CENTER);
    textSize(Math.min(imgW, imgH) * 0.45);
    text(targetPose.emoji, imgX + imgW / 2, imgY + imgH / 2);
  }

  // Nav: big prev / counter / next
  const ny = panelH - navH - 16;
  const nb = (x, label, onClick) => {
    fill(pc(PAL.rose));
    rect(x, ny, navH, navH, 32);
    fill(pc(PAL.ink));
    textAlign(CENTER, CENTER);
    textSize(30);
    text(label, x + navH / 2, ny + navH / 2);
    uiButtons.push({ x: panelX + x, y: panelY + ny, w: navH, h: navH, onClick });
  };
  nb(16, "←", () => goToPose((currentPoseIndex - 1 + YOGA_POSES.length) % YOGA_POSES.length));
  nb(panelW - 16 - navH, "→", () => goToPose((currentPoseIndex + 1) % YOGA_POSES.length));
  fill(pc(PAL.inkSoft));
  textAlign(CENTER, CENTER);
  textSize(22 * big);
  text(`${currentPoseIndex + 1} / ${YOGA_POSES.length}`, panelW / 2, ny + navH / 2);
  pop();

  // --- End-of-session summary overlay ---
  if (sessionSummaryActive && sessionSummaryData) {
    push();
    noStroke();
    const pw = Math.min(width - pad * 2, 640);
    const ph = Math.min(height * 0.6, 440);
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;
    fill(pc(PAL.plum, 238));
    rect(px, py, pw, ph, 30);
    fill(pc(PAL.cream));
    textAlign(CENTER, CENTER);
    textSize(42);
    text("🌸 Skønt klaret!", width / 2, py + 62);
    fill(pc(PAL.lilac));
    textSize(23);
    text(`Du fuldførte ${sessionSummaryData.count} øvelser på ca. ${sessionSummaryData.mins} minutter.`, width / 2, py + 118);
    fill(pc(PAL.cream));
    textSize(20);
    text(sessionSummaryData.tip, px + 50, py + 162, pw - 100);
    fill(pc(PAL.rose));
    rect(px + pw / 2 - 190, py + ph - 116, 170, 56, 28);
    rect(px + pw / 2 + 20, py + ph - 116, 170, 56, 28);
    fill(pc(PAL.ink));
    textSize(20);
    text("🔁 Start forfra", px + pw / 2 - 105, py + ph - 88);
    text("✕ Vis øvelser", px + pw / 2 + 105, py + ph - 88);
    uiButtons.push({ x: px + pw / 2 - 190, y: py + ph - 116, w: 170, h: 56, summary: true, onClick: () => { sessionSummaryActive = false; setMode(currentModeIndex); } });
    uiButtons.push({ x: px + pw / 2 + 20, y: py + ph - 116, w: 170, h: 56, summary: true, onClick: () => { sessionSummaryActive = false; } });
    pop();
  }

  // Floating exit button in fullscreen
  if (fs) {
    push();
    textSize(18);
    const l = "✕ Luk fuld skærm";
    const w = textWidth(l) + 36;
    pill(camX + 16, camY + 16, l, false, toggleFullscreen, w);
    pop();
  } else {
    drawSessionBar(pad, height - pad - barH);
  }
}

// ---------------- Bottom session bar: mode, strictness, hold time, pause, sound ----------------
function drawSessionBar(pad, y) {
  const h = 46;
  push();
  noStroke();
  fill(pc(PAL.plum, 210));
  rect(pad, y, width - pad * 2, (showSettings ? 4 : 1) * 58 + 14, 22);

  let x = pad + 14;
  let by = y + 12;
  const wrap = (w) => {
    if (x + w > width - pad - 14) { x = pad + 14; by += h + 12; }
  };
  const btn = (label, active, onClick) => {
    textSize(17);
    const w = textWidth(label) + 30;
    wrap(w);
    noStroke();
    fill(active ? pc(PAL.rose) : pc(PAL.cream, 34));
    rect(x, by, w, h, 23);
    fill(active ? pc(PAL.ink) : pc(PAL.cream));
    textAlign(CENTER, CENTER);
    text(label, x + w * 0.5, by + h * 0.5);
    uiButtons.push({ x, y: by, w, h, onClick });
    x += w + 8;
  };
  const sep = (label) => {
    fill(pc(PAL.lilac));
    textSize(16);
    textAlign(LEFT, CENTER);
    wrap(textWidth(label) + 80);
    text(label, x + 4, by + h * 0.5);
    x += textWidth(label) + 16;
  };
  const swatch = (i) => {
    const b = CAM_BGS[i];
    wrap(h + 8);
    const cx = x + h / 2, cy = by + h / 2;
    const ctx = drawingContext;
    if (b.colors) {
      const g = ctx.createLinearGradient(cx - 20, cy - 20, cx + 20, cy + 20);
      b.colors.forEach((c, k) => g.addColorStop(k / (b.colors.length - 1), c));
      ctx.fillStyle = g;
    } else ctx.fillStyle = "#5a4a6e";
    ctx.beginPath(); ctx.arc(cx, cy, h / 2 - 3, 0, Math.PI * 2); ctx.fill();
    if (!b.colors || b.icon) { fill(255); textAlign(CENTER, CENTER); textSize(18); text(b.icon || "📷", cx, cy + 1); }
    noFill();
    stroke(camBgIndex === i ? pc(PAL.rose) : pc(PAL.cream, 50));
    strokeWeight(camBgIndex === i ? 3 : 1);
    circle(cx, cy, h);
    noStroke();
    uiButtons.push({ x, y: by, w: h, h, onClick: () => { camBgIndex = i; removeBackgroundEnabled = !!CAM_BGS[i].colors; const mt = CAM_BGS[i].music || "calm"; if (CAM_BGS[i].music || (ambientEnabled && musicTheme !== "calm")) setMusicTheme(mt); } });
    x += h + 8;
  };

  sep("Hvor gør det ondt?");
  MODES.forEach((m, i) => btn(m.label, currentModeIndex === i, () => setMode(i)));
  if (!showSettings) { pop(); return; }
  x = pad + 14; by += h + 12;
  sep("Baggrund");
  CAM_BGS.forEach((_, i) => swatch(i));
  x += 10;
  sep("Sværhed");
  LEVELS.forEach((l) => btn(l.label, currentLevel === l.id, () => { currentLevel = l.id; setMode(currentModeIndex); }));
  POSTURES.forEach((pz) => btn(pz.label, currentPosture === pz.id, () => { currentPosture = pz.id; setMode(currentModeIndex); }));
  x += 10;
  sep("Præcision");
  STRICTNESS_LEVELS.forEach((l, i) => btn(l.label, strictnessIndex === i, () => (strictnessIndex = i)));
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
  btn(sessionPaused ? "▶" : "⏸", sessionPaused, togglePause);
  x += 10;
  sep("Afstand");
  DISTANCE_LEVELS.forEach((l, i) => btn(l.label, distanceLevelIndex === i, () => { distanceLevelIndex = i; lastDistanceState = "ok"; }));
  x += 10;
  sep("Tekst");
  TEXT_SIZES.forEach((l, i) => btn(l.label, textSizeIndex === i, () => (textSizeIndex = i)));
  x += 10;
  sep("Musik");
  btn(ambientEnabled ? "🎵 Til" : "🎵 Fra", ambientEnabled, () => setAmbient(!ambientEnabled));
  btn("−", false, () => setMusicVolume(Math.max(0.1, musicVolume - 0.15)));
  btn("+", false, () => setMusicVolume(Math.min(1, musicVolume + 0.15)));
  btn("◎ Mål", showCameraGuides, () => { showCameraGuides = !showCameraGuides; });
  btn("🪑 Tæt på", closeUpMode, () => { closeUpMode = !closeUpMode; });
  pop();
}
