/**
 * speech.js — Hybrid Speech Controller supporting:
 *   1. Google Gemini AI Voices (Kore [Female], Aoede [Female], Zephyr [Female], Puck [Male], Fenrir [Male])
 *   2. Native Danish System & Browser Voices (Sara, Google dansk) via Web Speech API.
 */
class SpeechController {
  constructor(fallbackUrls = []) {
    this.fallbackUrls = fallbackUrls;
    this.speechSynth = typeof window !== "undefined" ? window.speechSynthesis : null;
    this.gemini = typeof window !== "undefined" && window.GeminiTTS ? new window.GeminiTTS() : null;

    this.voices = [];
    // Always default to Gemini female voice Kore
    this.selectedVoice = "gemini:Kore";
    this.rate = 1.0;
    this.pitch = 1.0;
    this.isPlaying = false;
    this.currentText = "";
    this.startedAt = 0;
    this.estimatedDuration = 1500;
    this.onStateChange = null;
    this.onError = null;

    if (this.speechSynth) {
      this.loadVoices();
      if (typeof this.speechSynth.onvoiceschanged !== "undefined") {
        this.speechSynth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (!this.speechSynth) return [];
    this.voices = this.speechSynth.getVoices() || [];
    if (!this.selectedVoice) {
      this.selectedVoice = "gemini:Kore";
    }
    return this.voices;
  }

  get isGeminiVoice() {
    return Boolean(
      this.selectedVoice &&
        typeof this.selectedVoice === "string" &&
        this.selectedVoice.startsWith("gemini:")
    );
  }

  get geminiVoiceName() {
    if (!this.isGeminiVoice) return "Kore";
    return this.selectedVoice.replace("gemini:", "") || "Kore";
  }

  setVoiceByName(name) {
    if (!name) return;
    if (name.startsWith("gemini:")) {
      this.selectedVoice = name;
      return;
    }
    const v = this.voices.find((voice) => voice.name === name);
    if (v) this.selectedVoice = v;
  }

  unlock() {
    if (this.speechSynth && this.speechSynth.paused) {
      this.speechSynth.resume();
    }
    if (this.gemini) {
      this.gemini.ensureAudioContext();
    }
  }

  get progress() {
    if (this.isGeminiVoice && this.gemini && this.gemini.isPlaying) {
      return this.gemini.progress;
    }
    if (!this.isPlaying) return 0;
    const elapsed = performance.now() - this.startedAt;
    return Math.min(1.0, elapsed / Math.max(500, this.estimatedDuration));
  }

  /**
   * Speak text with chosen voice (defaults to Gemini female AI voice Kore).
   */
  async speak(text) {
    const cleanText = (text || "").trim();
    if (!cleanText) return false;

    this.unlock();
    this.currentText = cleanText;

    // 1. If Gemini Voice selected (default)
    if (this.isGeminiVoice && this.gemini) {
      const vName = this.geminiVoiceName || "Kore";
      try {
        this.isPlaying = true;
        this.startedAt = performance.now();
        if (this.onStateChange) this.onStateChange(true, cleanText);

        await this.gemini.play(cleanText, vName);
        this.isPlaying = false;
        if (this.onStateChange) this.onStateChange(false, cleanText);
        return true;
      } catch (err) {
        console.warn(`[SpeechController] Gemini TTS (${vName}) failed, trying secondary female voice:`, err);
        // Try secondary Gemini female voice Aoede
        try {
          await this.gemini.play(cleanText, "Aoede");
          this.isPlaying = false;
          if (this.onStateChange) this.onStateChange(false, cleanText);
          return true;
        } catch (err2) {
          console.warn("[SpeechController] Gemini TTS rate limit/quota reached (429). Falling back to Danish browser voice:", err2);
          if (this.onError) {
            this.onError("Gemini AI stemmekvote nået (10/dag). Skifter automatisk til lokal dansk stemme.");
          }
          // Seamless fallback so the user always hears the answer spoken!
          return this.speakWithBrowserSynth(cleanText);
        }
      }
    }

    // 2. Explicit browser synth or fallback
    return this.speakWithBrowserSynth(cleanText);
  }

  speakWithBrowserSynth(cleanText) {
    if (!this.speechSynth) return false;

    this.speechSynth.cancel();
    this.estimatedDuration = Math.max(1200, cleanText.length * 80 + 400);
    this.startedAt = performance.now();
    this.isPlaying = true;

    if (this.onStateChange) this.onStateChange(true, cleanText);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "da-DK";

    // Find best Danish voice (preferring female voice like Sara)
    let chosenVoice = null;
    if (this.selectedVoice && typeof this.selectedVoice !== "string") {
      chosenVoice = this.selectedVoice;
    } else {
      const danishVoices = (this.voices || []).filter(
        (v) => (v.lang && v.lang.toLowerCase().startsWith("da")) || (v.name && v.name.toLowerCase().includes("sara"))
      );
      chosenVoice = danishVoices.find((v) => v.name.toLowerCase().includes("sara")) || danishVoices[0] || null;
    }

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang || "da-DK";
    }
    utterance.rate = this.rate || 1.0;
    utterance.pitch = this.pitch || 1.0;

    utterance.onstart = () => {
      this.isPlaying = true;
      this.startedAt = performance.now();
      if (this.onStateChange) this.onStateChange(true, cleanText);
    };

    utterance.onend = () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false, cleanText);
    };

    utterance.onerror = (err) => {
      console.warn("[speech] browser synthesis error:", err);
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false, cleanText);
    };

    this.speechSynth.speak(utterance);
    return true;
  }

  stop() {
    if (this.gemini) this.gemini.stop();
    if (this.speechSynth) this.speechSynth.cancel();
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange(false, this.currentText);
  }
}

if (typeof window !== "undefined") {
  window.SpeechController = SpeechController;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SpeechController };
}
