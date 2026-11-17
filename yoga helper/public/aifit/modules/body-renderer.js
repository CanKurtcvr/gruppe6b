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

