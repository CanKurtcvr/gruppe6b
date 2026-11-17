/**
 * recognition.js — Web Speech Recognition (Speech-to-Text) in Danish (da-DK).
 *
 * Patient recognition engine:
 * - Does not stop prematurely on small pauses.
 * - Continuous listening until 2.5s post-speech silence OR manual second button press.
 * - Clean finish / cancel toggle support.
 */
class SpeechRecognizer {
  constructor(lang = "da-DK") {
    this.lang = lang;
    this.isListening = false;
    this.desiredListening = false;
    this.recognition = null;
    this.currentTranscript = "";
    this.silenceTimer = null;
    this.initialTimer = null;
    this.silenceDelayMs = 2500;
    this.initialWaitMs = 9000;

    this.onInterim = null;
    this.onFinal = null;
    this.onError = null;
    this.onStart = null;
    this.onEnd = null;

    const SpeechRecClass =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    this.isSupported = Boolean(SpeechRecClass);

    if (this.isSupported) {
      try {
        this.recognition = new SpeechRecClass();
        this.recognition.lang = this.lang;
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
          this.isListening = true;
          if (this.onStart) this.onStart();
        };

        this.recognition.onresult = (event) => {
          this._clearInitialTimer();

          let text = "";
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript + " ";
          }
          this.currentTranscript = text.trim();

          if (this.onInterim) {
            this.onInterim(this.currentTranscript);
          }

          // Automatically finalize if user pauses for 2.5 seconds after speaking
          this._resetSilenceTimer();
        };

        this.recognition.onerror = (event) => {
          if (event.error === "no-speech") {
            // Keep listening patiently if within initial waiting window
            if (this.desiredListening) return;
          }
          let message = event.error;
          if (event.error === "not-allowed") {
            message = "Mikrofonadgang blev afvist. Tillad mikrofon i browseren.";
            this.stop();
          }
          if (this.onError) this.onError(message, event.error);
        };

        this.recognition.onend = () => {
          // If browser closed automatically while user is still thinking, restart seamlessly
          if (this.desiredListening) {
            try {
              this.recognition.start();
              return;
            } catch (_) {}
          }
          this.isListening = false;
          this._clearTimers();
          if (this.onEnd) this.onEnd();
        };
      } catch (err) {
        console.warn("[SpeechRecognizer] Initialization error:", err);
        this.isSupported = false;
      }
    }
  }

  _clearInitialTimer() {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
  }

  _resetSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    this.silenceTimer = setTimeout(() => {
      this.finalize();
    }, this.silenceDelayMs);
  }

  _clearTimers() {
    this._clearInitialTimer();
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  start() {
    if (!this.isSupported || !this.recognition) {
      if (this.onError) {
        this.onError("Tale-til-tekst understøttes i Google Chrome, Safari eller Edge.");
      }
      return false;
    }

    try {
      this.currentTranscript = "";
      this.desiredListening = true;
      this._clearTimers();

      // Wait up to 9 seconds of complete initial silence before giving up
      this.initialTimer = setTimeout(() => {
        if (!this.currentTranscript.trim()) {
          this.stop();
        }
      }, this.initialWaitMs);

      this.recognition.lang = this.lang || "da-DK";
      this.recognition.start();
      return true;
    } catch (err) {
      console.warn("[SpeechRecognizer] start failed:", err);
      return false;
    }
  }

  finalize() {
    const text = (this.currentTranscript || "").trim();
    this.stop();
    if (text && this.onFinal) {
      this.onFinal(text);
    }
    return text;
  }

  stop() {
    this.desiredListening = false;
    this._clearTimers();
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }
    this.isListening = false;
  }

  toggle() {
    if (this.isListening) {
      this.stop();
      return false;
    }
    return this.start();
  }
}

if (typeof window !== "undefined") {
  window.SpeechRecognizer = SpeechRecognizer;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SpeechRecognizer };
}
