# Slickk Super App Roadmap

Slickk is an Android-first education super app for students across
Bangladesh. Its long-term objective is a multilingual, multimodal,
curriculum-aware learning system that understands how each student learns
while respecting the privacy and safety requirements of children.

This roadmap extends the original `Slickk_Professional_Technical_Book.pdf`.
Every phase must pass automated checks and focused real-device acceptance
testing before the next phase is merged.

## Foundation completed

Phases 1-16 established:

- Expo SDK 57 Android application and development builds
- typed and live voice tutoring through a local Ollama gateway
- centralized API configuration and connection diagnostics
- streamed and persistent conversations
- evidence-based Learning Twin memory and subject-aware pedagogy
- verified NCTB and international curriculum resource catalogs
- school, class, language, curriculum, and subject profiles
- access-controlled public and licensed learning resources
- returning-student profile continuity and dashboard personalization

## Phase 17 - Camera and Upload

Status: implemented; Android device acceptance testing in progress.

- Photograph worksheets, book pages, diagrams, and handwriting.
- Choose images, PDFs, text files, and Word documents.
- Keep temporary materials in app-private cache storage.
- Enforce file-count and file-size limits.
- Let students review and remove materials before analysis.

Exit gate: camera permission, capture, file selection, previews, removal,
restart behavior, and privacy copy pass on a real Android device.

## Phase 18 - OCR and Multimodal Vision

Status: evidence-region, correction, injection-detection, and persistence
foundation implemented; vision-model evaluation and Android workflow pending.

- Extract Bangla and English printed text.
- Detect handwriting, equations, tables, and page structure.
- Understand diagrams, graphs, scientific figures, and geometry.
- Preserve page and region citations for every extracted claim.
- Let the student correct OCR before a lesson begins.
- Ground tutor answers in the selected material without reproducing
  copyrighted books unnecessarily.

Exit gate: an evaluation set of representative Bangladesh school materials
meets defined accuracy, citation, latency, and failure-recovery thresholds.

## Phase 19 - Study Tools

Status: source-grounded notes, flashcard, and short-answer quiz contracts
implemented; mobile editing, persistence, and multilingual evaluation pending.

- Generate notes, summaries, flashcards, concept maps, and revision plans.
- Create quizzes from curriculum sources and student-provided material.
- Add spaced repetition and forgetting-aware review schedules.
- Make every generated resource editable and traceable to its sources.
- Support Bangla, English, bilingual instruction, and Banglish interaction.

Exit gate: generated tools remain curriculum-correct, source-grounded,
editable, and synchronized with Learning Twin evidence.

## Phase 20 - Exams and Learning Analytics

Status: deterministic short-answer scoring and measured-versus-estimated
reporting foundation implemented; exam UI and full analytics pending.

- Add chapter, term, board, and admission-style practice modes.
- Support timed exams, marking schemes, and step-level feedback.
- Show mastery trends, recurring misconceptions, and revision priorities.
- Separate measured evidence from model estimates.
- Provide age-appropriate student reports and explainable recommendations.

Exit gate: scoring is reproducible, analytics are evidence-backed, and
recommendations never present psychological or medical diagnoses.

## Phase 21 - Production Platform

Status: API credential, role, security-header, and rate-limit foundation
implemented; full identity provider, encrypted cloud sync, legal review, and
store release gates pending.

- Add student, guardian, teacher, and school identities with role controls.
- Add authenticated and rate-limited APIs.
- Add encrypted sync, backup, export, correction, and deletion controls.
- Add safety moderation, incident handling, observability, and CI/CD.
- Complete privacy, child-safety, security, and legal review.
- Produce store-ready APK/AAB releases that do not depend on Metro.

Exit gate: the public-beta definition of done in the technical book passes.

## Phase 22 - Governed Learning Data Foundation

Status: pseudonymous event, consent, purpose, provenance, retention, deletion,
and raw-private-data exclusion contracts implemented; governed dataset
operations and external review pending.

- Define consented learning-event, assessment, and teaching-method schemas.
- Minimize, pseudonymize, and separate identity from model-training data.
- Build dataset lineage, licensing, retention, deletion, and audit records.
- Create representative evaluation sets across curricula, classes, subjects,
  languages, regions, school types, and accessibility needs.
- Block raw private conversations from automatic training.

Exit gate: every training example has provenance, permission, purpose,
retention policy, and deletion support.

## Phase 23 - Adaptive Machine Learning

Status: explainable deterministic recommendation baseline and candidate-model
comparison boundary implemented; controlled ML evaluations pending.

- Add knowledge tracing for skill mastery and uncertainty.
- Model forgetting and optimal review timing.
- Rank lesson, example, hint, and quiz recommendations.
- Personalize difficulty, pace, language, and explanation depth.
- Compare ML recommendations against deterministic educational baselines.
- Monitor bias, calibration, drift, and unequal performance.

Exit gate: controlled evaluations show learning benefit without weakening
privacy, fairness, explainability, or curriculum correctness.

## Phase 24 - School Teaching Method Intelligence

Status: educator submission, independent approval, evidence, matching, and
withdrawal/rollback contracts implemented; persistent school workflow and
pilot evaluation pending.

- Create a versioned registry of approved teaching methods from participating
  schools and teachers.
- Represent lesson structures, examples, terminology, assessment styles, and
  intervention strategies without ranking schools or teachers unfairly.
- Let authorized educators submit, review, correct, approve, and withdraw
  methods and materials.
- Match methods to curriculum, class, subject, language, and demonstrated
  student needs.
- Learn only from consented, aggregated outcomes using controlled experiments.
- Roll back any method or model version that performs poorly or causes harm.

Exit gate: no school method enters production without provenance, educator
approval, evaluation evidence, licensing, and rollback support.

## Phase 25 - Fully Voice-Controlled Tutor

Status: hands-free state, interruption, offline recovery, privacy indicator,
and consequential-action confirmation contracts implemented; long Android
session acceptance testing pending.

- Add an explicit hands-free session mode with clear privacy indicators.
- Support wake controls, listening, thinking, speaking, interruption, and
  resume states.
- Improve Bangla, English, bilingual, and Banglish speech recognition.
- Add expressive speech, pronunciation coaching, and voice-safe short answers.
- Allow voice navigation across lessons, quizzes, notes, and accessibility
  controls.
- Require confirmation before consequential actions or data sharing.

Exit gate: long real-device sessions recover from interruptions, silence,
noise, network loss, recognition errors, and model failures.

## Phase 26 - Slickk Training and Evaluation Platform

Status: reproducible training-manifest, immutable digest, baseline comparison,
and educational/safety release-gate contracts implemented; datasets, compute,
benchmarks, and actual training runs pending.

- Build reproducible data preparation, fine-tuning, evaluation, and model
  registry pipelines.
- Build an education tokenizer evaluation suite for Bangla, English,
  Banglish, mathematics, scientific notation, and curriculum terminology.
- Measure token efficiency so Bangladesh languages and equations are not
  unnecessarily fragmented or expensive to process.
- Use licensed curriculum content, educator-authored examples, synthetic
  practice data, and explicitly consented interactions.
- Convert approved sources into versioned pretraining, instruction-tuning,
  preference, tool-use, and evaluation datasets.
- Add Bangla educational benchmarks and curriculum-grounding evaluations.
- Evaluate tutoring quality, reasoning, hallucination, citation, safety,
  latency, cost, and on-device feasibility.
- Maintain model cards, dataset cards, experiment history, and rollback.
- Reproduce every training run from immutable code, configuration, dataset,
  tokenizer, base-model, and checkpoint versions.

Exit gate: a candidate model cannot ship unless it beats the current baseline
on predefined educational and safety gates.

## Phase 27 - Slickk Education LLM

Status: provider-replaceable multimodal request, original-input preservation,
bounded decoding, evidence, and external tool-permission contracts
implemented; candidate model training and measured baseline improvement
pending.

- Start by fine-tuning or adapting a strong multilingual transformer for
  Bangladesh education. Training a foundation model from scratch is considered
  only when lawful data, compute, staffing, and evaluation maturity justify it.
- Tokenize each prompt into model-readable units while retaining exact links to
  the original message, language, equation, and retrieved evidence.
- Use transformer attention to model relationships across the student's
  message, lesson history, Learning Twin memory, curriculum evidence, teaching
  plan, and available tools.
- Generate responses autoregressively through next-token prediction with
  explicit decoding limits for latency, repetition, and unsafe output.
- Instruction-tune the model to follow educational roles: diagnose, teach,
  demonstrate, hint, question, assess, remediate, and recommend the next useful
  learning action.
- Add preference training from educator-reviewed comparisons so helpful
  teaching is favored over answer dumping, verbosity, or unsupported claims.
- Combine the model with retrieval rather than memorizing entire textbooks.
- Teach structured tool calling for curriculum retrieval, calculators, code
  execution, OCR, diagrams, quiz generation, schedules, and progress records.
- Keep tool execution outside the neural model behind schemas, permissions,
  timeouts, audit logs, and confirmation for consequential actions.
- Require source checks, deterministic calculations, automated tests, or human
  review for important claims because fluent next-token prediction can still
  produce confident errors.
- Support local, school-server, and governed cloud deployment tiers.
- Distill smaller models for affordable Android and school-device use.
- Keep the model replaceable so product data is not locked to one provider.

Exit gate: the Slickk model demonstrates measurable improvement over the
Ollama baseline while meeting safety, privacy, latency, and cost targets.

### Phase 27 model pipeline

1. Receive text, speech transcript, image, document, or tool result.
2. Normalize language and preserve the original student input.
3. Retrieve the authorized curriculum and student-learning context.
4. Tokenize the assembled context using the evaluated tokenizer.
5. Run transformer inference over the permitted context window.
6. Predict response tokens or a validated tool request.
7. Execute approved tools outside the model when required.
8. Verify calculations, citations, safety, and output structure.
9. Deliver an age-appropriate response by text or voice.
10. Record only consented, evidence-based Learning Twin updates.

## Phase 28 - Multimodal Slickk Model

Status: exact-region multimodal claim validation, unsafe-region exclusion, and
accessible visual-description contracts implemented; trained multimodal model
and representative evaluation suite pending.

- Unite speech, text, document, image, handwriting, equation, and diagram
  understanding.
- Maintain evidence links from model output to the exact source region.
- Support conversational work across multi-page assignments and experiments.
- Generate accessible explanations for visual and hearing needs.
- Evaluate adversarial images, prompt injection in documents, and unsafe media.

Exit gate: multimodal answers remain grounded, correctable, and safe across
the defined school-material evaluation suite.

## Phase 29 - Bangladesh School Network

Status: school-tenant resource and role-action isolation contracts
implemented; persistent roster/assignment APIs, integrations, offline pilots,
and guardian workflows pending.

- Provide teacher lesson tools, assignments, assessments, and class insights.
- Provide school administration, roster, curriculum, and resource controls.
- Integrate approved public and private school systems through documented APIs.
- Support low-bandwidth, intermittent, local-server, and offline deployments.
- Add guardian communication and consent controls.
- Keep student-level access isolated by school, role, and purpose.

Exit gate: pilot schools can operate end-to-end without exposing one school's
students, licensed content, or analytics to another.

## Phase 30 - Agentic Tutor and Advanced Intelligence Research

Status: bounded goals, tool allow-lists, action/expiry budgets, human approval,
observable action logs, and owner cancellation contracts implemented;
controlled research evaluation pending.

This is a research phase, not a claim that Slickk has achieved AGI.

- Give the tutor controlled tools for planning lessons, retrieving sources,
  generating practice, scheduling reviews, and checking progress.
- Use bounded goals, permission checks, action logs, budgets, and cancellation.
- Require human approval for high-impact educational or administrative action.
- Study long-horizon tutoring, transfer between subjects, causal learning
  interventions, and collaborative teacher-AI planning.
- Maintain independent safety evaluation and never allow unrestricted
  self-modification or unsupervised deployment.

Exit gate: every agent action is authorized, observable, reversible where
possible, and demonstrably safer and more effective than the non-agentic
baseline.

## Continuous improvement cycle

After Phase 22, Slickk may run a governed improvement cycle:

1. Collect only consented and purpose-limited evidence.
2. Remove direct identity and enforce deletion requests.
3. Let educators validate teaching methods and labels.
4. Train candidate models in an isolated environment.
5. Evaluate candidates against frozen educational and safety benchmarks.
6. Pilot with explicit consent and controlled exposure.
7. Compare learning outcomes, fairness, latency, and failure rates.
8. Approve, version, monitor, and retain rollback capability.

Production models must never update themselves directly from a child's live
conversation.
