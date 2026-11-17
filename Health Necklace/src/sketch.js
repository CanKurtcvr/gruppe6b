// =============================================================================
// Knap-Taler — 1 Knap Konfiguration & Siri Gemini AI Assistent
// =============================================================================

let canvas, imgState1, speech, recognizer, assistant, silentAudioEl = null;
let activeTab = "tab-fixed", lastButton = "–", pressCount = 0, currentMessage = "Du er 67 år gammel";

// DOM references
let textInputEl, voiceSelectEl, panelEl, togglePanelBtn, minimizeBtn, testSpeakBtn, dictateBtn;
let micIconEl, micLabelEl, fullscreenBtn, unlockOverlayEl, statusPillEl, geminiKeyBox, geminiKeyInput, saveGeminiKeyBtn;
let tabBtnFixed, tabBtnSiri, tabContentFixed, tabContentSiri, siriContainer, siriOrbBtn, siriOrbIcon, siriCaption, siriUserText, siriGeminiText;

async function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  await pSetup();
  await loadScript("portal/gamepad.js");
  await setupGamepad();
  try { imgState1 = await loadImage("state1.png"); } catch (_) {}
  speech = new SpeechController(["sounds/du_er_67.m4a", "sounds/du_er_67.wav"]);
  recognizer = new SpeechRecognizer("da-DK");
  setupAssistant();
  setupUI();
  setupMediaSessionControls();
  const saved = localStorage.getItem("customSpeechText");
  if (saved && saved.trim()) {
    currentMessage = saved.trim();
    if (textInputEl) textInputEl.value = currentMessage;
  }
}

function setupAssistant() {
  if (speech) {
    speech.setVoiceByName("gemini:Kore");
  }
  assistant = new GeminiAssistant({
    speech,
    recognizer,
    onStateChange: updateSiriVisualState,
    onTranscript: (text, isFinal) => {
      if (siriUserText) siriUserText.textContent = text || (isFinal ? "..." : "Lytter...");
    },
    onResponse: (answer) => {
      if (siriGeminiText) siriGeminiText.textContent = answer;
      if (siriCaption) siriCaption.textContent = "Gemini svarer...";
    },
    onError: (err) => {
      if (siriCaption) siriCaption.textContent = `Fejl: ${err}`;
    },
  });
}

function updateSiriVisualState(state) {
  if (!siriContainer) return;
  siriContainer.className = `siri-container state-${state}`;

  const stateMap = {
    listening: { icon: "🔴", caption: "Lytter... tal i dit eget tempo (tryk igen for at afslutte)", pill: "🎙️ Lytter...", class: "siri-active" },
    thinking: { icon: "✨", caption: "Overvejer dit spørgsmål...", pill: "✨ Tænker...", class: "siri-active" },
    speaking: { icon: "🔊", caption: "Svarer... (tryk for at stoppe)", pill: "🔊 Svarer...", class: "siri-active" },
    idle: { icon: "🎙️", caption: "Tryk for at starte (tryk igen for at afslutte)", pill: activeTab === "tab-siri" ? "Klar" : "1 knap klar", class: "" },
  };

  const curr = stateMap[state] || stateMap.idle;
  if (siriOrbIcon) siriOrbIcon.textContent = curr.icon;
  if (siriCaption) siriCaption.textContent = curr.caption;
  if (statusPillEl) {
    statusPillEl.textContent = curr.pill;
    statusPillEl.className = `status-pill ${curr.class}`.trim();
  }
}

function setupUI() {
  const byId = (id) => document.getElementById(id);
  textInputEl = byId("custom-text-input");
  voiceSelectEl = byId("voice-select");
  panelEl = byId("control-panel");
  togglePanelBtn = byId("toggle-panel-btn");
  minimizeBtn = byId("minimize-btn");
  testSpeakBtn = byId("test-speak-btn");
  dictateBtn = byId("dictate-btn");
  micIconEl = byId("mic-icon");
  micLabelEl = byId("mic-label");
  fullscreenBtn = byId("fullscreen-btn");
  unlockOverlayEl = byId("audio-unlock-overlay");
  statusPillEl = byId("button-status-pill");
  tabBtnFixed = byId("tab-btn-fixed");
  tabBtnSiri = byId("tab-btn-siri");
  tabContentFixed = byId("tab-fixed");
  tabContentSiri = byId("tab-siri");
  siriContainer = byId("siri-container");
  siriOrbBtn = byId("siri-orb-btn");
  siriOrbIcon = byId("siri-orb-icon");
  siriCaption = byId("siri-caption");
  siriUserText = byId("siri-user-text");
  siriGeminiText = byId("siri-gemini-text");
  geminiKeyBox = byId("gemini-key-box");
  geminiKeyInput = byId("gemini-key-input");
  saveGeminiKeyBtn = byId("save-gemini-key-btn");

  if (tabBtnFixed && tabBtnSiri) {
    tabBtnFixed.addEventListener("click", () => switchTab("tab-fixed"));
    tabBtnSiri.addEventListener("click", () => switchTab("tab-siri"));
  }

  if (siriOrbBtn && assistant) {
    siriOrbBtn.addEventListener("click", () => {
      unlockAudio();
      assistant.activate();
    });
  }

  document.querySelectorAll(".siri-prompt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.getAttribute("data-query");
      if (q && assistant) {
        unlockAudio();
        if (siriUserText) siriUserText.textContent = q;
        assistant.handleUserQuery(q);
      }
    });
  });

  if (textInputEl) {
    textInputEl.addEventListener("input", (e) => {
      currentMessage = e.target.value.trim() || "Du er 67 år gammel";
      localStorage.setItem("customSpeechText", currentMessage);
    });
    textInputEl.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        textInputEl.blur();
        triggerSpeech();
      }
    });
  }

  if (testSpeakBtn) {
    testSpeakBtn.addEventListener("click", () => {
      unlockAudio();
      triggerSpeech();
    });
  }

  if (dictateBtn && recognizer) {
    dictateBtn.addEventListener("click", () => {
      unlockAudio();
      recognizer.isListening ? recognizer.stop() : recognizer.start();
    });
  }

  document.querySelectorAll(".preset-chip[data-text]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const txt = chip.getAttribute("data-text");
      if (txt) {
        currentMessage = txt;
        if (textInputEl) textInputEl.value = txt;
        localStorage.setItem("customSpeechText", txt);
        unlockAudio();
        triggerSpeech();
      }
    });
  });

  if (minimizeBtn && panelEl && togglePanelBtn) {
    minimizeBtn.addEventListener("click", () => {
      panelEl.classList.add("minimized");
      togglePanelBtn.style.display = "block";
    });
    togglePanelBtn.addEventListener("click", () => {
      panelEl.classList.remove("minimized");
      togglePanelBtn.style.display = "none";
    });
  }

  if (fullscreenBtn) fullscreenBtn.addEventListener("click", fullScreenToggle);

  // Preset Gemini Keys for the team
  const PRESET_GEMINI_KEYS = {
    Frederik: "AQ.Ab8RN6IDgnrGlQiLw_hV3FAcbYgjQ2juxtBLLkTGyd-0muAUmw",
    Martin: "AQ.Ab8RN6LZb6SGLezrwR2sN_rayqSXTRn932SLyhYVv7-Hgd7o0w",
    Can: "AIzaSyBiqw_NJro6hKM8aoWHV_lP3xWp9382cSA",
  };

  const keySelectEl = document.getElementById("gemini-key-select");
  const testGeminiKeyBtn = document.getElementById("test-gemini-key-btn");
  const geminiStatusText = document.getElementById("gemini-status-text");
  const activeUserBadge = document.getElementById("gemini-active-user-badge");
  const customKeyContainer = document.getElementById("custom-key-container");

  function applyKey(name, directKey = null) {
    const keyToUse = directKey || PRESET_GEMINI_KEYS[name];
    if (!keyToUse) return;
    if (assistant) assistant.setApiKey(keyToUse);
    if (speech && speech.gemini) speech.gemini.setApiKey(keyToUse);
    localStorage.setItem("gemini_selected_profile", name);
    if (activeUserBadge) { activeUserBadge.textContent = `${name}s nøgle aktiv`; activeUserBadge.style.color = "#059669"; }
    if (geminiStatusText) geminiStatusText.textContent = `Aktiv nøgle: ${name}. Gemini stemme 'Kore' klar.`;
  }

  const savedProfile = localStorage.getItem("gemini_selected_profile") || "Frederik";
  if (keySelectEl) {
    keySelectEl.value = savedProfile;
    if (savedProfile === "custom") {
      if (customKeyContainer) customKeyContainer.style.display = "flex";
      applyKey("Bruger", localStorage.getItem("gemini_api_key") || "");
    } else {
      applyKey(savedProfile);
    }
    keySelectEl.addEventListener("change", (e) => {
      const isCustom = e.target.value === "custom";
      if (customKeyContainer) customKeyContainer.style.display = isCustom ? "flex" : "none";
      if (!isCustom) applyKey(e.target.value);
    });
  } else {
    applyKey("Frederik");
  }

  if (geminiKeyInput) {
    geminiKeyInput.addEventListener("input", (e) => applyKey("Bruger", e.target.value.trim()));
  }

  if (testGeminiKeyBtn && assistant) {
    testGeminiKeyBtn.addEventListener("click", async () => {
      unlockAudio();
      if (geminiStatusText) geminiStatusText.innerHTML = '<span style="color: #4361ee;">⏳ Tester...</span>';
      const res = await assistant.testConnection();
      if (geminiStatusText) {
        geminiStatusText.innerHTML = res.ok ? `<span style="color: #059669; font-weight: 600;">✅ ${res.message}</span>` : `<span style="color: #dc2626; font-weight: 600;">❌ ${res.message}</span>`;
      }
    });
  }

  if (saveGeminiKeyBtn && geminiKeyInput) {
    saveGeminiKeyBtn.addEventListener("click", () => {
      applyKey("Bruger", geminiKeyInput.value.trim());
      if (testGeminiKeyBtn) testGeminiKeyBtn.click();
    });
  }

  if (unlockOverlayEl) unlockOverlayEl.addEventListener("click", unlockAudio);
  populateVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => populateVoices();

  if (voiceSelectEl) {
    voiceSelectEl.addEventListener("change", (e) => {
      const selected = e.target.value;
      if (speech) speech.setVoiceByName(selected);
      if (geminiKeyBox) geminiKeyBox.style.display = selected.startsWith("gemini:") ? "block" : "none";
    });
  }
}

function switchTab(tabId) {
  activeTab = tabId;
  if (assistant) assistant.stop();
  if (speech) speech.stop();

  const isFixed = tabId === "tab-fixed";
  tabBtnFixed.classList.toggle("active", isFixed);
  tabBtnSiri.classList.toggle("active", !isFixed);
  tabContentFixed.classList.toggle("active", isFixed);
  tabContentSiri.classList.toggle("active", !isFixed);
  if (geminiKeyBox) geminiKeyBox.style.display = isFixed ? "none" : "block";
  if (statusPillEl) statusPillEl.textContent = isFixed ? "1 knap klar" : "Siri AI klar";
  if (!isFixed && speech) {
    speech.setVoiceByName(voiceSelectEl && voiceSelectEl.value && voiceSelectEl.value.startsWith("gemini:") ? voiceSelectEl.value : "gemini:Kore");
  }
}

function populateVoices() {
  if (!voiceSelectEl || !speech) return;
  const voices = speech.loadVoices();
  voiceSelectEl.innerHTML = "";
  const geminiGroup = document.createElement("optgroup");
  geminiGroup.label = "✨ Gemini AI Stemmer (Google AI Studio)";
  [
    { id: "gemini:Kore", name: "✨ Kore (Gemini Kvindestemme - Klar & Naturlig) ⭐" },
    { id: "gemini:Aoede", name: "✨ Aoede (Gemini Kvindestemme - Rolig & Varm)" },
    { id: "gemini:Zephyr", name: "✨ Zephyr (Gemini Kvindestemme - Frisk & Lys)" },
    { id: "gemini:Puck", name: "✨ Puck (Gemini Mandsstemme - Livlig)" },
    { id: "gemini:Fenrir", name: "✨ Fenrir (Gemini Mandsstemme - Dyb)" },
  ].forEach((gv) => {
    const opt = document.createElement("option");
    opt.value = gv.id;
    opt.textContent = gv.name;
    geminiGroup.appendChild(opt);
  });
  voiceSelectEl.appendChild(geminiGroup);

  const danishVoices = (voices || []).filter((v) => v.lang.toLowerCase().startsWith("da") || v.name.toLowerCase().includes("sara"));
  if (danishVoices.length > 0) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = "🇩🇰 Danske Browser Stemmer";
    danishVoices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      optgroup.appendChild(opt);
    });
    voiceSelectEl.appendChild(optgroup);
  }
  speech.setVoiceByName("gemini:Kore");
  voiceSelectEl.value = "gemini:Kore";
  if (geminiKeyBox) geminiKeyBox.style.display = "block";
}

function unlockAudio() {
  if (speech) speech.unlock();
  if (!silentAudioEl && typeof document !== "undefined") {
    silentAudioEl = document.createElement("audio");
    silentAudioEl.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
    silentAudioEl.loop = true;
    silentAudioEl.volume = 0.01;
    document.body.appendChild(silentAudioEl);
  }
  if (silentAudioEl && silentAudioEl.paused) silentAudioEl.play().catch(() => {});
  if (unlockOverlayEl) {
    unlockOverlayEl.classList.add("hidden");
    setTimeout(() => { unlockOverlayEl.style.display = "none"; }, 300);
  }
}

async function draw() {
  activeTab === "tab-siri" ? drawSiriCanvas() : drawFixedCanvas();
  drawStatusBar();
}

function drawFixedCanvas() {
  background("#ffafcc");
  const pad = gamePads && gamePads[0];
  if (pad) {
    fill(255);
    if (pad.state["FACE_1"] || pad.state["ANY"]) {
      background(100);
      ellipse(width / 2, height / 2, random(20, 300));
    }
    if (pad.state["FACE_2"]) {
      background("yellow");
      ellipse(width / 2, height / 2, random(20, 300));
      if (imgState1) image(imgState1, 40, 40);
    }
  }
  if (speech && speech.isPlaying) drawMessage();
}

function drawSiriCanvas() {
  background("#1a102f");
  push();
  noStroke();

  const time = millis() * 0.002;
  const isListening = assistant && assistant.state === "listening";
  const isThinking = assistant && assistant.state === "thinking";
  const isSpeaking = assistant && assistant.state === "speaking";

  const ringCount = isListening || isSpeaking ? 5 : 3;
  const baseR = isListening ? 140 : isSpeaking ? 120 : 80;

  for (let i = ringCount; i >= 1; i--) {
    const r = baseR + i * 40 + sin(time * 2 + i) * 15;
    const alpha = (0.25 / i) * 255;
    if (isListening) fill(236, 72, 153, alpha);
    else if (isThinking) fill(139, 92, 246, alpha);
    else if (isSpeaking) fill(59, 130, 246, alpha);
    else fill(147, 51, 234, alpha * 0.5);
    ellipse(width / 2, height / 2 + 40, r * 2, r * 2);
  }

  textAlign(CENTER, CENTER);
  fill(255);
  textSize(22);
  textStyle(BOLD);

  if (isListening) {
    text("🎙️ Lytter til din stemme...", width / 2, height / 2 + 200);
  } else if (isThinking) {
    text("✨ Gemini tænker...", width / 2, height / 2 + 200);
  } else if (isSpeaking && assistant) {
    textSize(18);
    textStyle(NORMAL);
    fill(240);
    text(`"${assistant.lastResponse}"`, width / 2, height / 2 + 200);
  }
  pop();
}

function gamepadButtonPressed(name, index) {
  lastButton = `Knap: ${name} (#${index})`;
  triggerActiveAction();
}

function triggerActiveAction() {
  unlockAudio();
  activeTab === "tab-siri" && assistant ? assistant.activate() : triggerSpeech();
}

function setupMediaSessionControls() {
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Knap-Taler & Siri Assistent",
      artist: "Gemini Sundhedsassistent",
    });
    ["play", "pause", "stop", "nexttrack", "previoustrack"].forEach((act) => {
      try {
        navigator.mediaSession.setActionHandler(act, () => {
          lastButton = `Højttaler (${act})`;
          triggerActiveAction();
        });
      } catch (_) {}
    });
  }
  window.addEventListener("keydown", (e) => {
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;
    const k = e.key || "", c = e.code || "";
    if (k.startsWith("Media") || c.startsWith("Media") || ["AudioPlay", "Play", "Pause", "AudioVolumeUp", "AudioVolumeDown"].includes(k)) {
      e.preventDefault(); e.stopPropagation();
      lastButton = `Højttalertast: ${k || c}`;
      triggerActiveAction();
    }
  }, true);

  let lastServerEvent = 0;
  setInterval(async () => {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) return;
      const data = await res.json();
      if (data.lastEvent && data.lastEvent > lastServerEvent) {
        if (lastServerEvent !== 0) { lastButton = "Højttaler Play"; triggerActiveAction(); }
        lastServerEvent = data.lastEvent;
      }
    } catch (_) {}
  }, 350);
}

function keyPressed() {
  if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;
  if (key === "f" || key === "F") { fullScreenToggle(); return; }
  lastButton = `Tast: "${key}"`;
  triggerActiveAction();
}

function mousePressed() { unlockAudio(); }
function windowResized() { resizeCanvas(windowWidth, windowHeight); }

function triggerSpeech() {
  const textToSpeak = (textInputEl ? textInputEl.value : currentMessage) || currentMessage;
  if (!textToSpeak) return;
  currentMessage = textToSpeak;
  pressCount++;
  if (speech) speech.speak(currentMessage);
  if (statusPillEl) {
    statusPillEl.textContent = `Taler: "${currentMessage.slice(0, 16)}..."`;
    statusPillEl.classList.add("active");
    setTimeout(() => { if (statusPillEl) { statusPillEl.textContent = "1 knap klar"; statusPillEl.classList.remove("active"); } }, 2000);
  }
}

function drawMessage() {
  const p = speech.progress;
  const pulse = 1 + 0.08 * sin(p * PI * 4);
  push();
  noStroke();
  fill(0, 0, 0, 110);
  rect(0, 0, width, height);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  const baseSize = min(width / Math.max(8, currentMessage.length * 0.45), 110);
  textSize(baseSize * pulse);
  fill(255);
  drawingContext.shadowColor = "rgba(0, 0, 0, 0.4)";
  drawingContext.shadowBlur = 24;
  text(currentMessage, width / 2, height / 2 - 20);
  drawingContext.shadowBlur = 0;
  const barW = min(width * 0.6, 600);
  fill(255, 255, 255, 60);
  rect(width / 2 - barW / 2, height / 2 + 70, barW, 8, 4);
  fill("#70e000");
  rect(width / 2 - barW / 2, height / 2 + 70, barW * p, 8, 4);
  pop();
}

function drawStatusBar() {
  const pad = gamePads && gamePads[0];
  const padStatus = pad ? `🎮 Controller: ${pad.id.slice(0, 30)}` : `🎮 Venter på knaptryk...`;
  const modeText = activeTab === "tab-siri" ? "🔮 Siri Gemini AI" : "🔘 Fast sætning";
  const info = `${padStatus}  ·  Tilstand: ${modeText}  ·  Sidste aktivering: ${lastButton}  ·  Tryk: ${pressCount}`;
  push();
  noStroke();
  fill(0, 0, 0, 70);
  rect(0, height - 36, width, 36);
  fill(255);
  textSize(13);
  textAlign(LEFT, CENTER);
  text(info, 16, height - 18);
  textAlign(RIGHT, CENTER);
  text("F = fuldskærm", width - 16, height - 18);
  pop();
}
