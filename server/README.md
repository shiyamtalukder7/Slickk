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

## Curriculum PDF access

Official public, public-domain, and open-license PDFs are available to every
matching student profile. A commercial textbook must use
`licensed-user-copy` and be assigned to a school or student.

Import a free official specification:

```powershell
npm run import:pdf -- --file "C:\path\specification.pdf" --title "Official Mathematics Specification" --academic-year "2026" --grade "Class 9-10" --subject "Mathematics" --language "English" --curriculum "Cambridge International" --version "Cambridge IGCSE" --rights "official-public" --source-url "https://official-provider.example/specification"
```

Import a school-licensed textbook:

```powershell
npm run import:pdf -- --file "C:\path\licensed-book.pdf" --title "Licensed Mathematics Textbook" --academic-year "2026" --grade "Class 7" --subject "Mathematics" --language "English" --curriculum "Cambridge International" --version "Cambridge Lower Secondary" --rights "licensed-user-copy" --school-id "the-profile-school-id"
```

Use `--student-id "local-student"` instead when the family owns the licensed
copy. Licensed document text is excluded from every other profile's search.

## Endpoints

- `GET /` returns service metadata.
- `GET /health` verifies Ollama, the selected model, and local storage.
- `GET /api/profile-options` lists curricula, classes, languages, and subjects.
- `GET /api/curricula/english-medium` lists official international pathways.
- `GET /api/schools/search?q=...` searches the verified school directory.
- `GET|PUT /api/students/:id/profile` loads or saves a curriculum profile.
- `GET /api/documents?studentId=...` lists public and entitled resources.
- `POST /api/documents/search` performs access-controlled curriculum search.
- `POST /api/tutor` returns the original structured mobile response.
- `POST /api/tutor/stream` returns newline-delimited streaming events:
  `start`, `token`, `complete`, or `error`.
- `GET /api/conversations?studentId=local-student` lists conversations.
- `GET /api/conversations/:id/messages` loads a saved conversation.

Every response includes an `X-Request-Id` header. Tutor metadata includes
Ollama timing and token counts so latency changes can be measured.
