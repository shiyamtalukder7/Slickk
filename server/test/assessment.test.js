const assert = require('node:assert/strict');
const test = require('node:test');

const {
  scoreAssessment,
  scoreShortAnswer,
} = require('../src/assessment/scoring');

test('short-answer scoring is deterministic', () => {
  const first = scoreShortAnswer(
    'Plants convert light into chemical energy.',
    'Photosynthesis converts light energy into chemical energy.'
  );
  const second = scoreShortAnswer(
    'Plants convert light into chemical energy.',
    'Photosynthesis converts light energy into chemical energy.'
  );

  assert.deepEqual(first, second);
  assert.ok(first.ratio > 0);
  assert.ok(first.ratio < 1);
});

test('assessment reports separate measurements from estimates', () => {
  const report = scoreAssessment({
    assessmentId: 'quiz-1',
    responses: [
      {
        itemId: 'question-1',
        answer: 'force mass acceleration',
        expectedAnswer: 'force mass acceleration',
        sources: [
          {
            documentId: 'physics',
            page: 9,
            regionId: 'equation-1',
          },
        ],
      },
    ],
  });

  assert.equal(report.measured.percentage, 100);
  assert.equal(report.estimates.mastery, null);
  assert.equal(
    report.measured.items[0].sources[0].page,
    9
  );
});
