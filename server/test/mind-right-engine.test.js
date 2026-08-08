const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MIND_RIGHT_METHOD,
  MIND_STATES,
  createMindRightDecision,
  inferMindState,
  shouldPersistLearning,
} = require('../src/mind-right/engine');

function plan(overrides = {}) {
  return {
    subject: 'Mathematics',
    subjectFamily: 'mathematics',
    turnKind: 'continuation',
    lessonState: 'guided_practice',
    needsClarification: false,
    verifiedMaterialContext: false,
    supportLevel: 0,
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

test('Mind Right is the authoritative original teaching method', () => {
  const decision = createMindRightDecision({
    pedagogyPlan: plan({
      turnKind: 'new_topic',
    }),
  });

  assert.equal(
    decision.method,
    MIND_RIGHT_METHOD
  );
  assert.equal(
    decision.system,
    'Universal Perfect Teacher Brain'
  );
  assert.equal(
    decision.teachingAction.kind,
    'build-mental-connection'
  );
  assert.deepEqual(
    decision.teachingAction.requiredStructure,
    [
      'state the core meaning',
      'give one concrete or familiar example',
      'connect the example to the formal idea',
      'ask one evidence-producing question',
    ]
  );
});

test('clarification never creates false learning progress', () => {
  const decision = createMindRightDecision({
    pedagogyPlan: plan({
      turnKind: 'clarification',
      needsClarification: true,
    }),
  });

  assert.equal(
    decision.mindState.key,
    MIND_STATES.clarify
  );
  assert.equal(
    decision.teachingAction.kind,
    'clarify-intent'
  );
  assert.equal(
    decision.learningTwinPolicy.persistLearning,
    false
  );
  assert.equal(
    shouldPersistLearning(decision),
    false
  );
  assert.equal(
    decision.learningTwinPolicy.masteryDelta,
    0
  );
});

test('answer attempts are evaluated before new teaching', () => {
  const decision = createMindRightDecision({
    pedagogyPlan: plan({
      turnKind: 'answer',
      signals: {
        confusion: false,
        understandingClaim: false,
        answerAttempt: true,
      },
    }),
  });

  assert.equal(
    decision.mindState.key,
    MIND_STATES.evaluate
  );
  assert.equal(
    decision.teachingAction.kind,
    'evaluate-current-thinking'
  );
  assert.match(
    decision.teachingAction.requiredStructure[1],
    /reason/i
  );
});

test('confusion changes representation and reduces load', () => {
  const decision = createMindRightDecision({
    pedagogyPlan: plan({
      turnKind: 'confusion',
      signals: {
        confusion: true,
        understandingClaim: false,
        answerAttempt: false,
      },
    }),
  });

  assert.equal(
    decision.mindState.key,
    MIND_STATES.recover
  );
  assert.equal(
    decision.teachingAction.kind,
    'reduce-load-and-represent-again'
  );
});

test('verified material receives source-grounded reasoning', () => {
  const decision = createMindRightDecision({
    pedagogyPlan: plan({
      verifiedMaterialContext: true,
      turnKind: 'material_answer',
      signals: {
        confusion: false,
        understandingClaim: false,
        answerAttempt: true,
      },
    }),
    curriculumEvidence: [
      { citationId: 'source-1' },
    ],
  });

  assert.equal(
    decision.mindState.key,
    MIND_STATES.material
  );
  assert.equal(
    decision.teachingAction.kind,
    'reason-from-verified-material'
  );
  assert.equal(
    decision.knowledgeHandling.sourceCount,
    1
  );
});

test('understanding claims require independent evidence', () => {
  const decision = createMindRightDecision({
    pedagogyPlan: plan({
      turnKind: 'confirmation',
      signals: {
        confusion: false,
        understandingClaim: true,
        answerAttempt: false,
      },
    }),
  });

  assert.equal(
    decision.mindState.key,
    MIND_STATES.verify
  );
  assert.equal(
    decision.evidencePolicy.mayDeclareMastery,
    false
  );
});

test('strong evidence moves to independent transfer', () => {
  const decision = createMindRightDecision({
    pedagogyPlan: plan({
      relevantMemory: {
        subject: {
          masteryScore: 0.92,
          masteryEvidence: 12,
          masteryLevel: 'mastered',
          lastTopic: 'Fractions',
        },
        activeMisconceptions: [],
      },
    }),
  });

  assert.equal(
    decision.mindState.key,
    MIND_STATES.transfer
  );
  assert.equal(
    decision.teachingAction.kind,
    'independent-transfer'
  );
  assert.equal(
    decision.autonomy.mayDeclareMastery,
    false
  );
});

test('existing misconception triggers smallest-gap repair', () => {
  const state = inferMindState({
    pedagogyPlan: plan({
      relevantMemory: {
        subject: {
          masteryScore: 0.7,
          masteryEvidence: 5,
        },
        activeMisconceptions: [
          { id: 'fraction-denominator', verified: true },
        ],
      },
    }),
  });

  assert.equal(
    state.key,
    MIND_STATES.repair
  );
  assert.equal(
    state.action.kind,
    'repair-smallest-gap'
  );
});
