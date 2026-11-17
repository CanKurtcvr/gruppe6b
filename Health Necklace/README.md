# Health Necklace (Knap-Taler & Sundhedsekspert 65+)

Et p5.js-baseret 1-knap stemme- og AI-assistent-interface designet til en fysisk knap / Health Necklace, hvor brugeren kan aktivere oplæsning eller tale med en dansk **Gemini AI Sundhedsekspert** med ét tryk.

## Projektstruktur

- `src/index.html` & `src/style.css` — Brugerflade med 2 tilstande: **1-Knap Taler** og **Sundhedsekspert 65+**
- `src/sketch.js` — p5.js hovedloop, UI-styring og knap-håndtering (tastatur, gamepad, media-knap)
- `src/gemini-assistant.js` — Samtale-flow (lyt → tænk → svar) med Gemini API
- `src/gemini-tts.js` — Gemini AI tekst-til-tale (Puck, Kore, Aoede, Fenrir, Zephyr) med lyd-caching
- `src/speech.js` & `src/sound.js` — Lydafspilning og dansk browser-stemme fallback
- `src/recognition.js` — Dansk talegenkendelse (`da-DK` Web Speech API)
- `src/portal/` — Hardware/gamepad input-abstraktion og kant-detektering (`buttonEdge.js`)
- `server.py` — Valgfri lokal server med macOS Music play-knap-lytning (`/api/events`) til fysisk Bluetooth-knap
- `tests/` — Automatiserede enhedstests for kant-detektering, Gemini TTS, assistent, tale og genkendelse

## Kom i gang

```bash
npm start   # Starter statisk server på http://localhost:8080
# eller med fysisk Bluetooth/Music-knap på macOS:
python3 server.py
```

Åbn **http://localhost:8080** i Chrome og klik ét sted på skærmen for at aktivere lyd og mikrofon.

## Test & Validering

```bash
npm test    # Kører alle 18 tests med Node test runner
npm run build   # Syntaks-tjekker alle JS-moduler
```
