const assert = require('node:assert/strict');
const test = require('node:test');

const {
  rankLearningActions,
  recommendationComparison,
} = require('../src/learning/recommendations');

test('recommendations prioritize verified need and explain why', () => {
  const ranked = rankLearningActions({
    now: new Date('2026-07-30T00:00:00.000Z'),
    skills: [
      {
        skillId: 'fractions',
        subject: 'Mathematics',
        mastery: 0.3,
        uncertainty: 0.6,
        nextReviewAt: '2026-07-29T00:00:00.000Z',
        hasMisconception: true,
        evidenceCount: 4,
      },
      {
        skillId: 'addition',
        subject: 'Mathematics',
        mastery: 0.9,
        uncertainty: 0.1,
        nextReviewAt: '2026-08-10T00:00:00.000Z',
        evidenceCount: 20,
      },
    ],
  });

  assert.equal(ranked[0].skillId, 'fractions');
  assert.equal(ranked[0].action, 'guided-practice');
  assert.ok(ranked[0].reasons.length >= 3);
});

test('protected demographic fields cannot affect baseline ranking', () => {
  const common = {
    skillId: 'reading',
    mastery: 0.5,
    uncertainty: 0.4,
    evidenceCount: 3,
  };
  const first = rankLearningActions({
    skills: [{ ...common, gender: 'female' }],
  });
  const second = rankLearningActions({
    skills: [{ ...common, gender: 'male' }],
  });

  assert.deepEqual(first, second);
});

test('candidate models cannot silently replace the baseline', () => {
  const comparison = recommendationComparison({
    skills: [
      {
        skillId: 'algebra',
        mastery: 0.4,
      },
    ],
  });

  assert.equal(comparison.decision, 'baseline');
  assert.equal(comparison.candidate, null);
});
