const assert = require('node:assert/strict');
const test = require('node:test');
const { buildParentSummary } = require('../src/reports/parent-summary');

test('parent summary separates verified achievement from support priorities', () => {
  const summary = buildParentSummary({ studentName: 'Amina', totalTurns: 7, subjects: [
    { subject: 'Mathematics', masteryScore: 0.81, masteryEvidence: 4, correctAnswers: 4, incorrectAnswers: 0 },
    { subject: 'Biology', masteryScore: 0.42, masteryEvidence: 2, correctAnswers: 0, incorrectAnswers: 2, lastTopic: 'Cells' },
  ] }, { now: new Date('2026-08-05T00:00:00.000Z') });
  assert.equal(summary.lessonsCompleted, 7);
  assert.equal(summary.verifiedAnswers, 6);
  assert.equal(summary.accuracyPercentage, 67);
  assert.equal(summary.strengths[0].subject, 'Mathematics');
  assert.equal(summary.priorities[0].subject, 'Biology');
  assert.match(summary.evidenceNotice, /educator-verified/);
});

test('parent summary does not invent accuracy without verified evidence', () => {
  const summary = buildParentSummary({ studentName: 'Amina', subjects: [] });
  assert.equal(summary.accuracyPercentage, null);
  assert.equal(summary.verifiedAnswers, 0);
  assert.match(summary.homeSupport, /weekly check/);
});
