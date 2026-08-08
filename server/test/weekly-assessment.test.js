const assert = require('node:assert/strict');
const test = require('node:test');
const { buildWeeklyAssessment } = require('../src/assessment/weekly');

test('weekly assessment rotates evidence-producing question types across weak subjects', () => {
  const assessment = buildWeeklyAssessment({
    educationProfile: { studentName: 'Ari', grade: 'Class 7', subjects: ['Mathematics'] },
    subjects: [{ subjectKey: 'mathematics', subject: 'Mathematics', masteryScore: 0.3, masteryEvidence: 3, lastTopic: 'Fractions' }],
    activeMisconceptions: [{ subject: 'Mathematics' }],
  }, { now: new Date('2026-08-05T00:00:00.000Z'), questionCount: 5 });

  assert.equal(assessment.questions.length, 5);
  assert.equal(assessment.questions[0].subject, 'Mathematics');
  assert.equal(assessment.questions[3].kind, 'misconception-check');
  assert.equal(assessment.totalPoints, 10);
  assert.match(assessment.id, /^weekly-/);
});
