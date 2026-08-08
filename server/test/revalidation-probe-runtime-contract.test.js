const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readFileSync,
} = require('node:fs');
const path = require('node:path');

function source(relative) {
  return readFileSync(
    path.join(
      process.cwd(),
      relative
    ),
    'utf8'
  );
}

test(
  'reflection creates a probe only from strategy revalidation state',
  () => {
    const reflection =
      source(
        'server/src/reflection/engine.js'
      );
    const probe =
      source(
        'server/src/revalidation/probe.js'
      );

    assert.match(
      reflection,
      /createBoundedRevalidationProbe/
    );
    assert.match(
      reflection,
      /bounded-strategy-revalidation-probe/
    );
    assert.match(
      probe,
      /revalidationRequired === true/
    );
    assert.match(
      probe,
      /probe-budget-exhausted/
    );
    assert.match(
      probe,
      /maximumTeachingActions: 1/
    );
    assert.match(
      probe,
      /askAtMostOneQuestion: true/
    );
  }
);

test(
  'probe outcomes reuse the shared teaching outcome contract',
  () => {
    const outcome =
      source(
        'server/src/outcomes/memory.js'
      );

    assert.match(
      outcome,
      /revalidationProbe:/
    );
    assert.match(
      outcome,
      /verified-correct-answer/
    );
    assert.match(
      outcome,
      /explicit-confusion/
    );
    assert.match(
      outcome,
      /answer-outcome-not-decisive/
    );
    assert.match(
      outcome,
      /mayChangeMastery:\s*false/
    );
    assert.match(
      outcome,
      /mayCreateMisconception:\s*false/
    );
  }
);

test(
  'typed and streaming tutor paths still share recordLearning',
  () => {
    const app =
      source('server/src/app.js');
    const functionIndex =
      app.indexOf(
        'function recordLearning'
      );
    const observationIndex =
      app.indexOf(
        'createTeachingOutcomeObservation',
        functionIndex
      );
    const recordLearningCalls =
      (
        app.match(
          /(?<!function )recordLearning\(\s*context,/g
        ) || []
      ).length;

    assert.ok(
      functionIndex >= 0
    );
    assert.ok(
      observationIndex >
        functionIndex
    );
    assert.equal(
      recordLearningCalls,
      2
    );
    assert.match(
      app,
      /reflection:\s*context\.requestData\.reflection/
    );
  }
);

test(
  'bounded probe metadata requires no new SQLite table',
  () => {
    const storage =
      source(
        'server/src/storage/conversations.js'
      );

    assert.doesNotMatch(
      storage,
      /CREATE TABLE IF NOT EXISTS revalidation_probe_events/
    );
    assert.match(
      storage,
      /metadata_json TEXT NOT NULL DEFAULT '\{\}'/
    );
    assert.match(
      storage,
      /recordTeachingOutcome/
    );
  }
);
