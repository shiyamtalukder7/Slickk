# Slickk LLM architecture

## Product definition

Slickk LLM is a personalized educational intelligence system, not the name of
an Ollama model and not a generic chatbot wrapper. Its stable behavior comes
from the complete teaching system:

1. the student's consented Learning Twin and education profile;
2. deterministic pedagogy and lesson-state policies;
3. curriculum- and entitlement-filtered retrieval;
4. assessment, study, voice, document, and verification tools;
5. a replaceable language-model provider;
6. evaluation, governance, safety, and rollback gates.

The current provider uses an Ollama-compatible local runtime because it works
privately on the development laptop. Mobile and API clients identify the
system as `slickk-llm`; `local-ollama` appears only as runtime diagnostics.

## Runtime boundary

```text
Slickk mobile app
        |
Slickk LLM API and tutor state machine
        |
+-------+---------+----------+-------------+
| Learning Twin  | RAG      | Tools       | Safety/evals |
+-------+---------+----------+-------------+
        |
ModelProvider: health, generate, stream
        |
Current: local Ollama adapter
Future: evaluated Slickk adapter or another private runtime
```

No route, teaching policy, learner record, or curriculum index is owned by the
runtime adapter. Replacing a model must therefore be a configuration and
evaluation decision rather than an app rewrite.

## Educational agent controller

Every tutor turn now passes through
`educational-agent-policy-v1` before a language model is called. The controller
combines the detected turn, subject method, support level, active
misconceptions, Bayesian mastery score, verified evidence count, uncertainty,
and available curriculum evidence.

It selects exactly one auditable teaching action:

- diagnose prior knowledge;
- evaluate an answer;
- scaffold a misconception;
- verify a teach-back;
- guide remediation;
- provide a grounded explanation; or
- test independent transfer.

The controller permits at most one teaching action per turn and requires an
evidence-producing question. It cannot change learner records, declare
mastery, or execute consequential actions. Candidate learned policies may be
evaluated against this deterministic baseline later, but cannot silently
replace it.

## Path to a Slickk-trained model

Slickk must not claim to have trained a foundation model before evidence
exists. The safe path is:

1. Freeze the current system as a measurable baseline.
2. Collect only consented, minimized, de-identified educational events.
3. Build versioned datasets and human-reviewed teaching examples.
4. Define offline evaluation sets for correctness, curriculum faithfulness,
   pedagogy, multilingual quality, safety, latency, and memory use.
5. Fine-tune a suitable open base model with an efficient adapter such as
   QLoRA; do not train from scratch on this laptop.
6. Register the dataset, base-model digest, adapter, prompt, and evaluation
   results.
7. Compare blindly against the baseline and test with educators and students.
8. Promote only when every quality and safety gate passes; retain rollback.

“Educational AGI” is a research direction, not a present capability claim.
Near-term releases should claim only measured abilities.

## Curriculum training corpus

The curriculum corpus planner targets up to one million diverse examples; it
does not repeat the same sample one million times. For each unique eligible
source chunk it creates seven review jobs:

1. prior-knowledge diagnosis;
2. grounded explanation;
3. guided hint;
4. misconception repair;
5. reasoning check;
6. teach-back; and
7. transfer.

All tasks derived from one source chunk remain in the same split, preventing
source leakage between training and evaluation. A job is not a training
example until an educator approves its response for factual grounding,
age-appropriateness, teaching quality, and safety.

Only `public-domain` and explicitly `open-license` sources currently enter the
corpus. `official-public` and `licensed-user-copy` sources remain available to
retrieval but are excluded from model-weight training until their licence or
rights holder explicitly permits that use.

Generate the current governed plan with:

```powershell
Set-Location server
npm.cmd run training:plan -- --target 1000000 --limit 150000
```

The generated plan is private local data under
`server/data/training/curriculum-training-plan.json` and is gitignored.

## Configuration

New installations use:

```text
SLICKK_MODEL_PROVIDER=ollama
SLICKK_MODEL_URL=http://127.0.0.1:11434
SLICKK_MODEL_NAME=slickk-tutor-3b-backup
```

Legacy `OLLAMA_URL` and `OLLAMA_MODEL` values remain valid during migration.
