// ---------------- Strict Timer & Directional Voice Coaching Loop ----------------
function updatePoseTimer(bestPose) {
  const now = millis();
  const dt = Math.min(0.25, Math.max(0, (now - lastUpdateMs) / 1000));
  lastUpdateMs = now;

  if (sessionPaused) return;
  if (exercisePreparation.phase !== "active") {
    const wasRest = exercisePreparation.phase === "rest";
    exercisePreparation.tick(dt, { speaking: isSpeaking, voice: voiceEnabled });
    isPoseMatched = false;
    if (wasRest) {
      if (exercisePreparation.phase === "intro") {
        currentFeedback = "Se øvelsen — find din stilling";
        if (voiceEnabled) announceCurrentPose();
      } else {
        currentFeedback = `Pause — ${Math.ceil(exercisePreparation.restRemaining)} s`;
      }
    } else if (exercisePreparation.phase === "countdown") {
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
        goToPose((currentPoseIndex + 1) % YOGA_POSES.length, REST_SECONDS);
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

  if (exercisePreparation.phase === "rest" && !sessionPaused) {
    const r = Math.min(220, camH * 0.46);
    fill(pc(PAL.lilac, 215));
    circle(camW / 2, camH / 2 - 24, r);
    fill(pc(PAL.plum));
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(Math.min(30, camH * 0.07));
    text("Pause", camW / 2, camH / 2 - 24 - r * 0.25);
    textSize(Math.min(80, camH * 0.18));
    text(Math.ceil(exercisePreparation.restRemaining), camW / 2, camH / 2 - 14);
    textStyle(NORMAL);
    textSize(Math.min(18, camH * 0.04));
    text("Tryk for at springe over", camW / 2, camH / 2 - 24 + r * 0.32);
  }

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
    const ph = Math.min(height * 0.55, 400);
    const px = (width - pw) / 2;
    const py = (height - ph) / 2 - 48;
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
