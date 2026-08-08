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
  'app creates reflection before Mind Right and stores it with tutor turns',
  () => {
    const text =
      source('server/src/app.js');

    assert.match(
      text,
      /createReflectiveTeachingState/
    );
    assert.match(
      text,
      /applyReflectiveTeachingPlan/
    );
    assert.match(
      text,
      /reflection:\s*context\.requestData\.reflection/
    );
    assert.match(
      text,
      /tutorDecision:\s*context\.pedagogyPlan\.decision/
    );
  }
);

test(
  'prompt carries the reflective contract without exposing it to the student',
  () => {
    const text =
      source(
        'server/src/prompts/tutor.js'
      );

    assert.match(
      text,
      /REFLECTIVE_TEACHING_DATA/
    );
    assert.match(
      text,
      /Do not repeat the previous wording/
    );
    assert.match(
      text,
      /Never reveal or mention the Reflective Teaching state/
    );
  }
);

test(
  'Mindfulness audits reflection for typed and streaming release paths',
  () => {
    const mindfulness =
      source(
        'server/src/mindfulness/engine.js'
      );
    const tutor =
      source(
        'server/src/services/tutor.js'
      );

    assert.match(
      mindfulness,
      /auditReflectiveReply/
    );
    assert.match(
      mindfulness,
      /reflectionRepairInstruction/
    );
    assert.match(
      mindfulness,
      /reflectiveFallbackReply/
    );

    const occurrences =
      (
        tutor.match(
          /auditMindfulReply\(/g
        ) || []
      ).length;

    assert.ok(
      occurrences >= 4
    );
  }
);
