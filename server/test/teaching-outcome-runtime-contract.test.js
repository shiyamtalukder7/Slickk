const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function source(relative) {
  return readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      relative
    ),
    'utf8'
  );
}

test(
  'runtime reads outcome memory before reflection and records one shared contract',
  () => {
    const app =
      source('server/src/app.js');

    const readIndex =
      app.indexOf(
        'getTeachingOutcomeMemory'
      );
    const reflectionIndex =
      app.indexOf(
        'createReflectiveTeachingState({',
        readIndex
      );
    const functionIndex =
      app.indexOf(
        'function recordLearning'
      );
    const observationIndex =
      app.indexOf(
        'createTeachingOutcomeObservation',
        functionIndex
      );

    assert.ok(readIndex >= 0);
    assert.ok(
      reflectionIndex > readIndex
    );
    assert.ok(functionIndex >= 0);
    assert.ok(
      observationIndex > functionIndex
    );
    assert.match(
      app,
      /conversationStore\s*\.\s*recordTeachingOutcome/
    );

    const recordLearningCalls =
      (
        app.match(
          /(?:const|let)\s+learnerProfile\s*=\s*recordLearning\(/g
        ) || []
      ).length;

    assert.equal(
      recordLearningCalls,
      2
    );
  }
);

test(
  'storage keeps teaching outcomes separate from subject progress and mastery',
  () => {
    const storage =
      source(
        'server/src/storage/conversations.js'
      );

    assert.match(
      storage,
      /CREATE TABLE IF NOT EXISTS teaching_outcome_events/
    );
    assert.match(
      storage,
      /descriptive_only INTEGER NOT NULL DEFAULT 1/
    );
    assert.match(
      storage,
      /getTeachingOutcomeMemory/
    );
    assert.match(
      storage,
      /recordTeachingOutcome/
    );

    const outcomeFunction =
      storage.slice(
        storage.indexOf(
          'function recordTeachingOutcome'
        ),
        storage.indexOf(
          'function recordLearningTurn'
        )
      );

    assert.doesNotMatch(
      outcomeFunction,
      /updateAssessmentEvidence/
    );
    assert.doesNotMatch(
      outcomeFunction,
      /mastery_score/
    );
  }
);

test(
  'reflection treats outcome memory as bounded descriptive preference',
  () => {
    const reflection =
      source(
        'server/src/reflection/engine.js'
      );

    assert.match(
      reflection,
      /selectBoundedRepresentation/
    );
    assert.match(
      reflection,
      /descriptiveOnly:\s*true/
    );
    assert.match(
      reflection,
      /usedForSelection/
    );
    assert.match(
      reflection,
      /mayChangeMastery:\s*false/
    );
  }
);
