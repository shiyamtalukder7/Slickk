const assert = require('node:assert/strict');
const test = require('node:test');

const {
  masteryLevel,
  nextReviewDate,
  updateMastery,
} = require('../src/learning/mastery');

test('verified correct evidence raises mastery probability', () => {
  const updated = updateMastery(0.25, 'correct');

  assert.ok(updated > 0.25);
});

test('verified incorrect evidence lowers immediate belief before learning', () => {
  const correct = updateMastery(0.6, 'correct');
  const incorrect = updateMastery(0.6, 'incorrect');

  assert.ok(incorrect < correct);
});

test('unverified conversation signals cannot update mastery', () => {
  assert.throws(
    () => updateMastery(0.5, 'student-said-yes'),
    /verified correct or incorrect evidence/
  );
});

test('mastery labels require enough evidence', () => {
  assert.equal(
    masteryLevel(0.95, 1),
    'insufficient_evidence'
  );
  assert.equal(masteryLevel(0.9, 5), 'mastered');
});

test('incorrect evidence schedules an immediate review', () => {
  const from = new Date('2026-07-28T00:00:00.000Z');

  assert.equal(
    nextReviewDate(0.4, 'incorrect', from),
    '2026-07-28T00:00:00.000Z'
  );
});
