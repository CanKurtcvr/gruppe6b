/**
 * gemini-assistant.js — Siri-style Voice Assistant powered by Google Gemini.
 *
 * Flow:
 * 1. User presses button (physical button, screen Siri orb, or spacebar).
 * 2. SpeechRecognizer listens in Danish (da-DK).
 * 3. Transcribed question is sent to Google Gemini API (gemini-2.0-flash / gemini-1.5-flash / gemini-2.5-flash).
 * 4. Gemini returns a concise, natural spoken response.
 * 5. SpeechController speaks the answer aloud (Gemini AI voice or Danish browser voice).
 */
class GeminiAssistant {
  constructor(options = {}) {
    this.apiKey =
      options.apiKey ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("gemini_api_key") || ""
        : "");
    this.speech = options.speech || null;
    this.recognizer = options.recognizer || null;
    this.state = "idle"; // "idle" | "listening" | "thinking" | "speaking"
    this.history = [];
    this.lastQuery = "";
    this.lastResponse = "";
    this.systemPrompt =
      options.systemPrompt ||
      "Du er en saglig, professionel og ligeværdig sundhedskonsulent for voksne kvinder på 65+ år. " +
      "Tal i en helt normal, respektfuld og voksen tone – aldrig belærende, nedladende eller som om du taler til et barn. " +
      "Svar med fokus på overgangsalder, knoglesundhed (osteoporose, kalk, D-vitamin, motion) og livskvalitet. " +
      "Giv konkrete, nøgterne og brugbare råd i et klart talesprog i 1-2 korte sætninger (max 40 ord), da svaret læses højt. " +
      "Undgå overdreven sukkersødme, 'kære ven', barnlige vendinger, punktopstillinger, stjerner og emojis.";

    // Callbacks
    this.onStateChange = options.onStateChange || null;
    this.onTranscript = options.onTranscript || null;
    this.onResponse = options.onResponse || null;
    this.onError = options.onError || null;

    if (this.recognizer) {
      this._bindRecognizer();
    }
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

  _setState(newState) {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  _bindRecognizer() {
    this.recognizer.onStart = () => {
      this._setState("listening");
    };

    this.recognizer.onInterim = (text) => {
      if (this.onTranscript) {
        this.onTranscript(text, false);
      }
    };

    this.recognizer.onFinal = async (text) => {
      const trimmed = (text || "").trim();
      if (this.onTranscript) {
        this.onTranscript(trimmed, true);
      }
      if (trimmed) {
        await this.handleUserQuery(trimmed);
      } else {
        this._setState("idle");
      }
    };

    this.recognizer.onError = (errMsg) => {
      if (this.state === "listening") {
        this._setState("idle");
      }
      if (this.onError) {
        this.onError(errMsg);
      }
    };

    this.recognizer.onEnd = () => {
      if (this.state === "listening") {
        this._setState("idle");
      }
    };
  }

  /**
   * Toggle push-to-talk / Siri interaction.
   */
  async activate() {
    // 1. If currently speaking: press to STOP playback immediately!
    if (this.state === "speaking") {
      this.stop();
      return;
    }

    // 2. If thinking: cancel immediately!
    if (this.state === "thinking") {
      this.stop();
      return;
    }

    // 3. If currently listening: 2nd press finishes!
    if (this.state === "listening") {
      if (this.recognizer) {
        const text = this.recognizer.finalize();
        // If user hasn't spoken anything, just return to idle cleanly
        if (!text) {
          this._setState("idle");
        }
      } else {
        this._setState("idle");
      }
      return;
    }

    // 4. Otherwise idle: start listening!
    this.startListening();
  }

  startListening() {
    if (this.speech) this.speech.stop();
    this.lastQuery = "";
    if (this.onTranscript) this.onTranscript("", false);

    if (this.recognizer) {
      const ok = this.recognizer.start();
      if (!ok) this._setState("idle");
    } else {
      this._setState("idle");
    }
  }

  stop() {
    if (this.recognizer) this.recognizer.stop();
    if (this.speech) this.speech.stop();
    this._setState("idle");
  }

  /**
   * Process spoken user query through Gemini AI.
   */
  async handleUserQuery(queryText) {
    this.lastQuery = queryText;
    this._setState("thinking");

    try {
      const answer = await this.queryGemini(queryText);
      this.lastResponse = answer;
      if (this.onResponse) {
        this.onResponse(answer, queryText);
      }

      this._setState("speaking");
      if (this.speech) {
        if (this.hasKey && (!this.speech.isGeminiVoice || !this.speech.selectedVoice)) {
          this.speech.setVoiceByName("gemini:Kore");
        }
        await this.speech.speak(answer);
      }
      this._setState("idle");
    } catch (err) {
      console.warn("[GeminiAssistant] Error querying Gemini:", err);
      const userErr = err.userMessage || err.message || "Kunne ikke forbinde til Gemini.";
      this.lastResponse = `⚠️ ${userErr}`;

      if (this.onError) this.onError(userErr);
      if (this.onResponse) this.onResponse(this.lastResponse, queryText);

      this._setState("speaking");
      if (this.speech) {
        await this.speech.speak(userErr);
      }
      this._setState("idle");
    }
  }

  /**
   * Call Google Gemini API with automatic model fallback across Flash variants.
   */
  async queryGemini(prompt) {
    if (!this.hasKey) {
      return this._fallbackWithoutKey(prompt);
    }

    const candidateModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ];

    let lastError = null;
    for (const model of candidateModels) {
      try {
        const answer = await this._callModel(model, prompt);
        if (answer) return answer;
      } catch (err) {
        lastError = err;
        if (err.isAuthError) {
          throw err;
        }
        console.warn(`[GeminiAssistant] Model ${model} failed, trying next:`, err.message);
      }
    }

    throw lastError || new Error("Ingen Gemini modeller svarede.");
  }

  async _callModel(model, prompt) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      this.apiKey
    )}`;

    const systemInstruction = {
      parts: [
        {
          text: this.systemPrompt,
        },
      ],
    };

    const recentHistory = this.history.slice(-4);
    const contents = [
      ...recentHistory,
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ];

    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 120,
          },
        }),
      });
    } catch (networkErr) {
      const err = new Error("Netværksfejl eller manglende internet.");
      err.userMessage = "Ingen internetforbindelse til Google Gemini eller adgang er blokeret.";
      throw err;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const code = res.status;
      const apiMsg = (errData.error && errData.error.message) || `HTTP ${code}`;

      const err = new Error(apiMsg);
      if (code === 400 || apiMsg.toLowerCase().includes("api key not valid")) {
        err.userMessage = "Ugyldig Gemini API-nøgle. Tjek din nøgle fra Google AI Studio.";
        err.isAuthError = true;
      } else if (code === 403) {
        err.userMessage = "Adgang nægtet (403). Din Google API-nøgle mangler adgang til Gemini.";
        err.isAuthError = true;
      } else if (code === 429) {
        err.userMessage = "Gemini kvote overskredet (429). Vent 30 sekunder og prøv igen.";
      } else if (code === 404) {
        err.userMessage = `Modellen ${model} er ikke tilgængelig.`;
      } else {
        err.userMessage = `Gemini fejl (${code}): ${apiMsg}`;
      }
      throw err;
    }

    const data = await res.json();
    let replyText = "";
    if (
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
    ) {
      replyText = data.candidates[0].content.parts
        .map((p) => p.text || "")
        .join(" ")
        .trim();
    }

    if (!replyText) {
      throw new Error("Modtog intet tekstsvar fra Gemini.");
    }

    this.history.push({ role: "user", parts: [{ text: prompt }] });
    this.history.push({ role: "model", parts: [{ text: replyText }] });

    return replyText;
  }

  async testConnection() {
    if (!this.hasKey) {
      return { ok: false, message: "Indsæt en Gemini API-nøgle først." };
    }
    const start = performance.now();
    try {
      const answer = await this._callModel("gemini-3.5-flash-lite", "Svar kun med ordet: Klar");
      const ms = Math.round(performance.now() - start);
      return { ok: true, message: `Forbindelse OK! (${ms}ms) Gemini svarede: "${answer}"` };
    } catch (err) {
      try {
        const answer = await this._callModel("gemini-3.1-flash-lite", "Svar kun med ordet: Klar");
        const ms = Math.round(performance.now() - start);
        return { ok: true, message: `Forbindelse OK! (${ms}ms) Gemini svarede: "${answer}"` };
      } catch (err2) {
        return { ok: false, message: err2.userMessage || err2.message };
      }
    }
  }

  _fallbackWithoutKey(prompt) {
    const p = prompt.toLowerCase();
    if (p.includes("knogle") || p.includes("osteoporose") || p.includes("kalk")) {
      return "For stærke knogler efter overgangsalderen er calcium, D-vitamin og daglig vægtbærende motion helt afgørende for din livskvalitet.";
    }
    if (p.includes("overgangsalder") || p.includes("hedeture") || p.includes("hedetur")) {
      return "Overgangsalderen påvirker hormonbalancen, men god søvn, let motion og sund mad kan lindre symptomer og styrke dit velvære.";
    }
    if (p.includes("livskvalitet") || p.includes("energi") || p.includes("sundhed")) {
      return "Som kvinde over 65 år er daglig bevægelse, stærke knogler og gode fællesskaber nøglen til et sundt liv og høj livskvalitet.";
    }
    if (p.includes("67") || p.includes("hvor gammel")) {
      return "Du er 67 år gammel, og du holder dig fantastisk godt!";
    }
    return "Som sundhedsekspert for kvinder over 65 år rådgiver jeg om overgangsalder, knogler og livskvalitet. Indtast din Gemini API-nøgle for fulde AI-svar.";
  }
}

if (typeof window !== "undefined") {
  window.GeminiAssistant = GeminiAssistant;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { GeminiAssistant };
}
