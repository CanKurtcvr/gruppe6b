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

// Google AI Studio API keys with automatic rotation when usage/quota is reached on a key.
const __GEMINI_TTS_KEYS = [
  "AQ.Ab8RN6LZb6SGLezrwR2sN_rayqSXTRn932SLyhYVv7-Hgd7o0w",
  "AQ.Ab8RN6IDgnrGlQiLw_hV3FAcbYgjQ2juxtBLLkTGyd-0muAUmw",
  "AIzaSyBiqw_NJro6hKM8aoWHV_lP3xWp9382cSA",
];
const __GEMINI_TTS_MODELS = [
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
];
const __DANISH_CALM_VOICE = "Sulafat";
const __DANISH_VOICE_STYLE =
  "Calm, warm, gentle and soothing female Danish yoga and mindfulness instructor. Speak naturally in clear Danish (da-DK) at a relaxed, unhurried pace.";
let __activeGeminiKeyIdx = 0;

async function fetchDirectGeminiTtsBlob(text) {
  let lastErr = new Error("Gemini TTS failed");
  const startIdx = __activeGeminiKeyIdx % __GEMINI_TTS_KEYS.length;

  for (const model of __GEMINI_TTS_MODELS) {
    for (let offset = 0; offset < __GEMINI_TTS_KEYS.length; offset++) {
      const keyIdx = (startIdx + offset) % __GEMINI_TTS_KEYS.length;
      const apiKey = __GEMINI_TTS_KEYS[keyIdx];
      try {
        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              model,
              store: false,
              input: [
                {
                  type: "user_input",
                  content: [
                    {
                      type: "text",
                      text,
                      annotations: [
                        {
                          type: "speech_metadata",
                          style: __DANISH_VOICE_STYLE,
                        },
                      ],
                    },
                  ],
                },
              ],
              response_format: { type: "audio" },
              generation_config: {
                speech_config: [{ voice: __DANISH_CALM_VOICE }],
              },
            }),
          }
        );
        if (!res.ok) throw new Error("Gemini status " + res.status);
        const data = await res.json();
        for (const step of data.steps || []) {
          for (const part of step.content || []) {
            if (part.type === "audio" && part.data) {
              const bin = atob(part.data);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              __activeGeminiKeyIdx = keyIdx;
              return new Blob([bytes], { type: part.mime_type || "audio/wav" });
            }
          }
        }
        throw new Error("Empty Gemini audio");
      } catch (err) {
        lastErr = err;
        __activeGeminiKeyIdx = (keyIdx + 1) % __GEMINI_TTS_KEYS.length;
      }
    }
  }
  throw lastErr;
}

function fetchTtsUrl(text) {
  if (ttsCache.has(text)) return ttsCache.get(text);
  const p = fetch(`/api/public/tts?text=${encodeURIComponent(text)}`)
    .then((r) => {
      if (!r.ok) throw new Error("tts " + r.status);
      return r.blob();
    })
    .catch(() => fetchDirectGeminiTtsBlob(text))
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

const POSE_OPENERS = [
  (n) => `Så er det tid til ${n}.`,
  (n) => `Nu skal vi lave ${n}.`,
  (n) => `Lad os gå videre til ${n}.`,
  (n) => `Næste øvelse er ${n}.`,
  (n) => `Vi fortsætter med ${n}.`,
  (n) => `Lad os prøve ${n}.`,
  (n) => `Nu venter ${n}.`,
];
function announceCurrentPose() {
  const p = YOGA_POSES[currentPoseIndex];
  if (!p) return;
  speakDanish(
    `${POSE_OPENERS[Math.floor(Math.random() * POSE_OPENERS.length)](p.name)} ${p.voiceIntro}`,
    { interrupt: true }
  );
  lastHintSpokenAt = millis();
}

const REST_LINES = [
  "Godt gået... hold en lille pause. Ryst skuldrene løst og træk vejret dybt.",
  "Dejligt... nu får du en pause. Slip kroppen og lad åndedrættet falde til ro.",
  "Fint arbejde... tag en kort pause, og drik gerne lidt vand.",
];
function introduceCurrentPose(restSeconds = 0) {
  const p = YOGA_POSES[currentPoseIndex];
  if (!p) return;
  exercisePreparation.start(Math.min(12, Math.max(4, (p.instruction || p.voiceIntro || "").split(/\s+/).length / 2.5)), restSeconds);
  lastPreparationNumber = 0;
  lastDistanceState = "ok";
  distanceOkSince = 0;
  currentGuidelines = [];
  if (restSeconds > 0) {
    currentFeedback = "Pause — slap af";
    if (!sessionPaused) speakDanish(REST_LINES[Math.floor(Math.random() * REST_LINES.length)], { interrupt: true });
    return;
  }
  currentFeedback = "Se øvelsen — find din stilling";
  if (!sessionPaused) announceCurrentPose();
}

const COUNT_WORDS = ["", "En.", "To.", "Tre.", "Fire.", "Fem."];
function prefetchCountdown() {
  // Prefetch from 5 down to 1 with a short stagger so the opening pose intro gets priority
  // and we avoid firing 6 simultaneous TTS requests at startup.
  [5, 4, 3, 2, 1].forEach((n, idx) => {
    const w = COUNT_WORDS[n];
    if (w) {
      setTimeout(() => {
        fetchTtsUrl(w).catch(() => {});
      }, 900 + idx * 450);
    }
  });
}
function announcePreparationNumber(number) {
  if (!voiceEnabled || !COUNT_WORDS[number]) return;
  // Use the same warm AI voice as everything else (pre-fetched), so the count doesn't sound robotic.
  speakDanish(COUNT_WORDS[number], { interrupt: true });
}

