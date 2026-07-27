# Slickk Local Intelligence Gateway

This Express service is the local gateway between the Slickk Expo app and
Ollama. It preserves the existing `POST /api/tutor` mobile contract.

## Requirements

- Node.js 20 or newer
- Ollama running at `http://127.0.0.1:11434`
- The configured local model installed in Ollama

## Configuration

Copy `.env.example` to `.env` when you want persistent local settings.
Environment variables set in the terminal take priority.

The default model is `slickk-tutor-3b-backup` because it is the model already
verified on the current 16-GB development laptop. Model quality will be
benchmarked before changing the default.

## Commands

```powershell
npm start
npm test
npm run check
```

## Endpoints

- `GET /` returns service metadata.
- `GET /health` verifies Ollama and the selected model.
- `POST /api/tutor` validates a tutoring request and returns the current mobile
  response shape plus request and performance diagnostics.

Every response includes an `X-Request-Id` header. Tutor metadata includes
Ollama timing and token counts so latency changes can be measured.
