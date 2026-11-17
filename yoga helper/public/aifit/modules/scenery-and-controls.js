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

  prefetchCountdown();
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
  // Tapping anywhere outside a button skips the rest pause.
  if (exercisePreparation.phase === "rest" && !sessionPaused &&
      !uiButtons.some((b) => mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h)) {
    exercisePreparation.skipRest();
    currentFeedback = "Se øvelsen — find din stilling";
    announceCurrentPose();
    return false;
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

function goToPose(index, restSeconds = 0) {
  lastFrameMatched = false;
  lastBreathCueAt = millis();
  currentPoseIndex = index;
  holdSeconds = 0;
  graceRemaining = 0;
  isPoseMatched = false;
  celebrationRemaining = 0;
  halfTimeAnnounced = false;
  matchStartAnnounced = false;
  introduceCurrentPose(restSeconds);
}

