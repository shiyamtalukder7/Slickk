const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPersonalLearningPlan } = require('../src/learning/plan');

test('personal plan prioritizes weak misconceptions and creates tutor prompts', () => {
  const plan = buildPersonalLearningPlan({
    educationProfile: {
      studentName: 'Ari',
      grade: 'Class 7',
      subjects: ['English', 'Mathematics'],
    },
    subjects: [
      { subjectKey: 'english', subject: 'English', masteryScore: 0.8, masteryEvidence: 8 },
      { subjectKey: 'mathematics', subject: 'Mathematics', masteryScore: 0.3, masteryEvidence: 4 },
    ],
    activeMisconceptions: [{ subject: 'Mathematics' }],
  }, { now: new Date('2026-08-05T00:00:00.000Z') });

  assert.equal(plan.items[0].subject, 'Mathematics');
  assert.equal(plan.items[0].action, 'guided-practice');
  assert.match(plan.items[0].tutorPrompt, /Diagnose first/);
  assert.equal(plan.totalMinutes, 25);
});

test('personal plan gives new enrolled subjects a diagnostic check', () => {
  const plan = buildPersonalLearningPlan({
    educationProfile: { subjects: ['Science'] },
    subjects: [],
    activeMisconceptions: [],
  });

  assert.equal(plan.items[0].subject, 'Science');
  assert.equal(plan.items[0].topic, 'Diagnostic check');
  assert.equal(plan.items[0].evidenceCount, 0);
});
