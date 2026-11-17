# Yoga Helper — Hjemme Øvelser

En dansk yoga- og udstrækningsapp med live kamera-feedback (pose estimation), rød/orange/grøn kropsvejledning og rolig dansk stemmeguide.

## Projektstruktur

- `src/routes/index.tsx` — Startskærm med valg af sværhedsgrad, siddende/stående og færdige programmer
- `src/data/home-options.ts` — Konfigurationsdata for startskærmens trin, niveauer og programmer
- `src/routes/api/public/` — Server-endpoints til dansk stemmeguide (Google AI Studio TTS med key-rotation)
- `public/aifit/index.html` — Indgang til kamera-øvelsesmotoren
- `public/aifit/extras.js` — Stræk-bibliotek, færdige programmer, forberedelses-timer og øvelsesvalg
- `public/aifit/modules/` — Opdelte moduler fra øvelsesmotoren:
  - `state-and-distance.js` — Sessionstilstand, afstandstjek og baggrundstemaer
  - `voice-guide.js` — Syngeskål-lyd og dansk talevejledning
  - `segmentation.js` — Baggrundsfjernelse med MediaPipe Selfie Segmentation
  - `pose-grading.js` — Kropsmetrikker og rød/orange/grøn-vurdering
  - `yoga-poses.js` — Definitioner og regler for de 12 yogaøvelser
  - `scenery-and-controls.js` — Baggrundsgrafik, tastatur-/musekontroller og setup
  - `body-renderer.js` — Visning af skelet, retningslinjer og kropsfarver
- `public/aifit/Main.js` — Hovedloop (`updatePoseTimer`, `draw`, `drawSessionBar`)
- `src/test/` — Vitest-tests for routing, programmer, øvelsesforberedelse og TTS-nøglerotation

## Udvikling & Test

```bash
bun install
bun run dev      # Starter udviklingsserver
bun run test     # Kører alle Vitest-tests
bun run build    # Bygger produktionsudgaven
```
