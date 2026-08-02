# Slickk LLM Intelligence Core

This Express service is the private intelligence core behind the Slickk app.
Slickk LLM combines learner state, pedagogy, curriculum retrieval, tools,
verification, and a replaceable model provider. Ollama is the initial local
runtime; it is not Slickk's product identity or permanent model dependency.

## Requirements

- Node.js 24.15 or newer
- A supported model runtime (currently Ollama) at `http://127.0.0.1:11434`
- The configured local model installed in that runtime

## Configuration

Copy `.env.example` to `.env` when you want persistent local settings.
Environment variables set in the terminal take priority.

The default runtime model is `slickk-tutor-3b-backup` because it is already
verified on the current 16-GB development laptop. Model quality will be
benchmarked before changing the default.

Use `SLICKK_MODEL_PROVIDER`, `SLICKK_MODEL_URL`, and `SLICKK_MODEL_NAME` for new
configuration. The older `OLLAMA_URL` and `OLLAMA_MODEL` names remain supported
so existing installations continue to work.

Conversation data is stored locally in `server/data/slickk.db` by default.
Database files are gitignored and must never be committed.

## Bangladesh school directory

The local directory is populated from the official BANBEIS 2024
workbooks for schools, schools and colleges, madrasahs, and technical
institutions. The current import contains 36,206 unique EIIN
institutions across all 64 districts. Search also checks the official
DPE IPEMIS primary-school directory and caches matching primary schools
locally. The profile screen always keeps an explicit
`Other / My school is not listed` option.

Re-import downloaded official BANBEIS workbooks with:

```powershell
npm run import:schools:2024 -- --file data\school-sources\banbeis-schools-2024.xlsx --file data\school-sources\banbeis-school-college-2024.xlsx --file data\school-sources\banbeis-madrasah-2024.xlsx --file data\school-sources\banbeis-government-technical-2024.xlsx --file data\school-sources\banbeis-independent-technical-2024.xlsx
```

The workbook source files and local database are gitignored. Do not
label the directory as exhaustive: newer, non-EIIN, international, and
unlisted schools must remain enterable through the Other option.

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
- `GET /health` verifies the selected Slickk LLM runtime, model, and storage.
- `GET /api/profile-options` lists curricula, classes, languages, and subjects.
- `GET /api/curricula/english-medium` lists official international pathways.
- `GET /api/schools/search?q=...` searches local BANBEIS institutions
  plus the official DPE IPEMIS primary-school directory.
- `GET|PUT /api/students/:id/profile` loads or saves a curriculum profile.
- `GET /api/documents?studentId=...` lists public and entitled resources.
- `POST /api/documents/search` performs access-controlled curriculum search.
- `POST /api/tutor` returns the original structured mobile response.
- `POST /api/tutor/stream` returns newline-delimited streaming events:
  `start`, `token`, `complete`, or `error`.
- `GET /api/conversations?studentId=local-student` lists conversations.
- `GET /api/conversations/:id/messages` loads a saved conversation.

Every response includes an `X-Request-Id` header. Tutor metadata identifies
Slickk LLM separately from its private runtime and includes timing and token
counts so model candidates can be compared.
