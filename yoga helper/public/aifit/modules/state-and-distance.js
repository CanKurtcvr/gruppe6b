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
  // Øvelser uden benarbejde (nakke, skuldre, ryg): fødderne behøver ikke ses.
  if (curPose && Array.isArray(curPose.areas) && !curPose.areas.includes("hips")) return "ok";
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

