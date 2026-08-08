const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createTutorDecision,
  lessonRoadmap,
} = require('../src/agents/tutor-decision');

function plan(overrides = {}) {
  return {
    subject: 'Mathematics',
    subjectFamily: 'mathematics',
    supportLevel: 1,
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: false,
    },
    relevantMemory: {
      subject: null,
      activeMisconceptions: [],
    },
    ...overrides,
  };
}

test('educational agent diagnoses before teaching without evidence', () => {
  const decision = createTutorDecision({
    pedagogyPlan: plan(),
  });

  assert.equal(
    decision.action.kind,
    'diagnose-prior-knowledge'
  );
  assert.equal(decision.learnerState.evidenceCount, 0);
  assert.ok(decision.learnerState.uncertainty >= 0.9);
  assert.equal(decision.autonomy.maximumTeachingActions, 1);
  assert.equal(decision.autonomy.mayDeclareMastery, false);
});

test('confusion and misconceptions force scaffolding', () => {
  const decision = createTutorDecision({
    pedagogyPlan: plan({
      signals: {
        confusion: true,
        understandingClaim: false,
        answerAttempt: false,
      },
      relevantMemory: {
        subject: {
          masteryScore: 0.8,
          masteryEvidence: 8,
        },
        activeMisconceptions: [{ id: 'fraction-denominator' }],
      },
    }),
  });

  assert.equal(
    decision.action.kind,
    'scaffold-misconception'
  );
  assert.equal(decision.action.difficultyDelta, -1);
});

test('verified high mastery receives transfer, not a mastery declaration', () => {
  const decision = createTutorDecision({
    pedagogyPlan: plan({
      relevantMemory: {
        subject: {
          masteryScore: 0.91,
          masteryEvidence: 12,
          masteryLevel: 'mastered',
          lastTopic: 'Fractions',
        },
        activeMisconceptions: [],
      },
    }),
    curriculumEvidence: [{ citationId: 'source-1' }],
  });

  assert.equal(
    decision.action.kind,
    'independent-transfer'
  );
  assert.equal(
    decision.grounding.status,
    'curriculum-evidence-available'
  );
  assert.equal(decision.autonomy.mayDeclareMastery, false);
});

test('answer attempts are evaluated before any new explanation', () => {
  const decision = createTutorDecision({
    pedagogyPlan: plan({
      signals: {
        confusion: false,
        understandingClaim: false,
        answerAttempt: true,
      },
    }),
  });

  assert.equal(decision.action.kind, 'evaluate-answer');
  assert.equal(decision.verification.required, true);
});

test('lesson roadmap advances to transfer with independent success evidence', () => {
  const roadmap = lessonRoadmap('independent-transfer', 'Fractions');
  assert.equal(roadmap.currentIndex, 4);
  assert.equal(roadmap.phases[4].status, 'current');
  assert.equal(roadmap.phases[3].status, 'complete');
  assert.match(roadmap.successCriterion, /without a hint/);
});
