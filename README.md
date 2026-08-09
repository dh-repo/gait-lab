# Gait Lab

Browser-side **walking video analysis** — upload a clip (or use the store sample), pick a person when several appear, and get structured ratings plus educated guesses about gait, stability, symmetry, and related patterns.

> **Not a medical device.** Outputs are clip-level computer-vision estimates and multi-cause hypotheses — not diagnoses, fall-risk certificates, or cognitive ability scores.

## Features

- **Multi-person** scan + selection (prefers largest / most persistent track)
- **Angle-adaptive** metrics (side / front / oblique)
- **Structured report** with domain ratings (0–100, bands, stars)
- **Metric favorability** table and ranked **hypothesis board**
- **Dual-task protocol** support (walk-only vs walk + cognitive pair)
- On-device pose via **MediaPipe Pose Landmarker** (WASM) — video stays in the browser

## Stack

React 19 · TypeScript · Vite · TanStack Start/Router · Tailwind v4 · MediaPipe Tasks Vision · Recharts

## Quick start

```bash
npm install
npm run dev
```

App binds to `0.0.0.0:8080`. Open the preview URL your environment exposes.

```bash
npm run build
npm run typecheck
```

## Sample video

`public/sample-walk.mp4` is a multi-person convenience-store aisle walk (filmed from behind) used for demos. Use **Try sample store walk** in the UI.

## Privacy

Pose estimation runs **locally in the browser**. Videos are not uploaded to a backend by this app.

## License

MIT
