# Gruppe 6b — Projekter

Dette repository indeholder to adskilte projekter:

## 1. [`yoga helper/`](./yoga%20helper) — Hjemme Øvelser
En dansk yoga- og udstrækningsapp med live kamera-feedback (pose estimation), rød/orange/grøn kropsvejledning og rolig dansk stemmeguide.

- **Frontend & API**: TanStack Start + React (`src/routes/index.tsx`, `src/data/home-options.ts`, `src/routes/api/public/tts.ts`)
- **Kamera- & øvelsesmotor**: p5.js + MediaPipe (`public/aifit/Main.js`, `public/aifit/extras.js`, `public/aifit/modules/*`)
- **Kørsel & test**:
  ```bash
  cd "yoga helper"
  bun install
  bun run dev
  bun run test
  ```

## 2. [`Health Necklace/`](./Health%20Necklace) — Knap-Taler & Sundhedsekspert 65+
Et 1-knap stemme- og Gemini AI-assistent-interface designet til en fysisk Health Necklace / Bluetooth-knap med dansk talegenkendelse og Gemini AI-stemmer.

- **Kerne-moduler**: p5.js sketch (`src/sketch.js`), Gemini assistent & TTS (`src/gemini-assistant.js`, `src/gemini-tts.js`), talegenkendelse (`src/recognition.js`), knap/gamepad-input (`src/portal/`) og valgfri macOS-knapserver (`server.py`)
- **Kørsel & test**:
  ```bash
  cd "Health Necklace"
  npm start        # eller: python3 server.py
  npm test
  npm run build
  ```
