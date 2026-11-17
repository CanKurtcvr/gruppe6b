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

