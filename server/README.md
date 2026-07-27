# Slickk Local Intelligence Gateway

This Express service is the local gateway between the Slickk Expo app and
Ollama. It preserves `POST /api/tutor` and adds a streaming tutor endpoint with
private local conversation persistence.

## Requirements

- Node.js 24.15 or newer
- Ollama running at `http://127.0.0.1:11434`
- The configured local model installed in Ollama

## Configuration

Copy `.env.example` to `.env` when you want persistent local settings.
Environment variables set in the terminal take priority.

The default model is `slickk-tutor-3b-backup` because it is the model already
verified on the current 16-GB development laptop. Model quality will be
benchmarked before changing the default.

Conversation data is stored locally in `server/data/slickk.db` by default.
Database files are gitignored and must never be committed.

## Commands

```powershell
npm start
npm test
npm run check
```

## Endpoints

- `GET /` returns service metadata.
- `GET /health` verifies Ollama, the selected model, and local storage.
- `POST /api/tutor` returns the original structured mobile response.
- `POST /api/tutor/stream` returns newline-delimited streaming events:
  `start`, `token`, `complete`, or `error`.
- `GET /api/conversations?studentId=local-student` lists conversations.
- `GET /api/conversations/:id/messages` loads a saved conversation.

Every response includes an `X-Request-Id` header. Tutor metadata includes
Ollama timing and token counts so latency changes can be measured.
