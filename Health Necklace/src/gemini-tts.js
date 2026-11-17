/**
 * gemini-tts.js — Integration with Google Gemini's authentic AI voice models.
 *
 * Uses official Gemini TTS models:
 *   - gemini-3.8-flash-lite-tts (Fastest, High Quota, audio/wav output)
 *   - gemini-3.8-flash-tts (HD Audio, audio/wav output)
 *   - gemini-3.1-flash-tts-preview
 *   - gemini-2.5-flash-preview-tts
 *
 * Features prebuilt voices with permanent default to Kore (Gemini female voice).
 */
class GeminiTTS {
  constructor() {
    this.apiKey =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("gemini_api_key") || ""
        : "";
    this.cache = new Map();
    this.audioCtx = null;
    this.currentSource = null;
    this.isPlaying = false;
    this.endsAt = 0;
    this.duration = 1.5;
    this.onStateChange = null;
  }

  setApiKey(key) {
    this.apiKey = (key || "").trim().replace(/^["']|["']$/g, "");
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("gemini_api_key", this.apiKey);
    }
  }

  get hasKey() {
    return Boolean(this.apiKey && this.apiKey.length > 15);
  }

  ensureAudioContext() {
    if (!this.audioCtx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Synthesize text to speech using Gemini TTS (defaults to Kore female voice).
   */
  async synthesize(text, voice = "Kore") {
    if (!this.hasKey) {
      throw new Error("Mangler gratis Gemini API nøgle. Indtast den under Indstillinger.");
    }

    const cleanText = (text || "").trim();
    if (!cleanText) {
      throw new Error("Ingen tekst at udtale.");
    }

    const targetVoice = voice || "Kore";
    const cacheKey = `${targetVoice}:::${cleanText}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const ttsModels = [
      "gemini-3.8-flash-lite-tts",
      "gemini-3.8-flash-tts",
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
    ];

    let lastErr = null;
    for (const model of ttsModels) {
      try {
        const buffer = await this._callTTS(model, cleanText, targetVoice);
        if (buffer) {
          this.cache.set(cacheKey, buffer);
          return buffer;
        }
      } catch (err) {
        lastErr = err;
        console.warn(`[GeminiTTS] ${model} failed, trying next:`, err.message);
      }
    }

    throw lastErr || new Error("Gemini TTS kunne ikke generere lyd.");
  }

  async _callTTS(model, text, voice) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      this.apiKey
    )}`;

    const body = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice || "Kore",
            },
          },
        },
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.error ? errJson.error.message : `HTTP ${res.status}`;
      throw new Error(`Gemini TTS (${model}): ${msg}`);
    }

    const data = await res.json();
    let audioBase64 = null;
    let mimeType = "audio/wav";
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          audioBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "audio/wav";
          break;
        }
      }
    }

    if (!audioBase64) {
      throw new Error("Modtog intet audiosignal fra Gemini.");
    }

    return await this.decodeAudio(audioBase64, mimeType);
  }

  /**
   * Decode base64 audio (supporting native WAV and raw PCM fallback).
   */
  async decodeAudio(base64Data, mimeType = "audio/wav") {
    const ctx = this.ensureAudioContext();
    if (!ctx) return null;

    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Standard WAV decoding via Web Audio API
    if (mimeType.includes("wav") || (bytes.length > 4 && bytes[0] === 0x52 && bytes[1] === 0x49)) {
      try {
        return await ctx.decodeAudioData(bytes.buffer.slice(0));
      } catch (err) {
        console.warn("[GeminiTTS] decodeAudioData error, trying manual PCM parse:", err);
      }
    }

    // Direct raw 16-bit PCM fallback at 24000 Hz
    const sampleRate = 24000;
    const sampleCount = Math.floor(bytes.length / 2);
    const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);

    for (let i = 0; i < sampleCount; i++) {
      const int16 = dataView.getInt16(i * 2, true);
      channelData[i] = int16 / 32768.0;
    }

    return audioBuffer;
  }

  async play(text, voice = "Kore") {
    const ctx = this.ensureAudioContext();
    if (!ctx) return false;

    const targetVoice = voice || "Kore";
    const buffer = await this.synthesize(text, targetVoice);
    if (!buffer) return false;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (_) {}
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    this.duration = buffer.duration;
    this.endsAt = ctx.currentTime + buffer.duration;
    this.isPlaying = true;
    this.currentSource = source;

    if (this.onStateChange) this.onStateChange(true, text);

    source.onended = () => {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false, text);
    };

    source.start(0);
    return true;
  }

  get progress() {
    if (!this.isPlaying || !this.audioCtx) return 0;
    const remaining = this.endsAt - this.audioCtx.currentTime;
    const elapsed = this.duration - remaining;
    return Math.max(0, Math.min(1.0, elapsed / Math.max(0.1, this.duration)));
  }

  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (_) {}
    }
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange(false, "");
  }
}

if (typeof window !== "undefined") {
  window.GeminiTTS = GeminiTTS;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { GeminiTTS };
}
