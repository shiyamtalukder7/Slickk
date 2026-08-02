const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TEACHING_TASKS,
  buildCurriculumTrainingPlan,
} = require('../src/training/corpus');

function source(overrides = {}) {
  return {
    documentId: 'book-1',
    documentSha256: 'book-hash',
    title: 'Open Mathematics',
    curriculum: 'Example curriculum',
    grade: 'Class 7',
    subject: 'Mathematics',
    language: 'English',
    rights: 'open-license',
    page: 12,
    chunkIndex: 0,
    content:
      'Equivalent fractions describe the same quantity using different numerators and denominators.',
    ...overrides,
  };
}

test('training plan creates diverse tasks without duplicating to target', () => {
  const plan = buildCurriculumTrainingPlan({
    sources: [source()],
    targetExamples: 1_000_000,
  });

  assert.equal(
    plan.availableExamples,
    TEACHING_TASKS.length
  );
  assert.equal(
    plan.shortfall,
    1_000_000 - TEACHING_TASKS.length
  );
  assert.equal(plan.readyForWeightTraining, false);
  assert.ok(
    plan.examples.every(
      (item) =>
        item.status === 'awaiting-reviewed-response'
    )
  );
});

test('licensed and merely public documents are excluded from weight training', () => {
  const plan = buildCurriculumTrainingPlan({
    sources: [
      source({ rights: 'licensed-user-copy' }),
      source({
        documentId: 'official-book',
        rights: 'official-public',
      }),
    ],
    sourceInventory: [
      {
        rights: 'licensed-user-copy',
        chunkCount: 12,
        trainingEligible: false,
      },
      {
        rights: 'official-public',
        chunkCount: 20,
        trainingEligible: false,
      },
    ],
  });

  assert.equal(plan.availableExamples, 0);
  assert.equal(
    plan.excludedByRights['licensed-user-copy'],
    12
  );
  assert.equal(plan.excludedByRights['official-public'], 20);
});

test('source-level splitting prevents train-evaluation leakage', () => {
  const plan = buildCurriculumTrainingPlan({
    sources: [source()],
  });
  const splits = new Set(
    plan.examples.map((item) => item.split)
  );

  assert.equal(splits.size, 1);
});
