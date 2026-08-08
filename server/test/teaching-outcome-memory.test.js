const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createTeachingOutcomeObservation,
  selectBoundedRepresentation,
} = require('../src/outcomes/memory');
const {
  createReflectiveTeachingState,
} = require('../src/reflection/engine');

function basePlan(overrides = {}) {
  return {
    subjectKey: 'subject:mathematics',
    subjectFamily: 'mathematics',
    subject: 'Mathematics',
    focusTopic: 'Number 5',
    turnKind: 'confusion',
    supportLevel: 1,
    signals: {
      confusion: true,
      answerAttempt: false,
      understandingClaim: false,
    },
    ...overrides,
  };
}

function history() {
  return [
    {
      id: 'student-message-1',
      role: 'student',
      text: 'Explain the number 5.',
    },
    {
      id: 'tutor-message-1',
      role: 'tutor',
      text:
        'Draw a number line and mark the position of 5.',
      metadata: {
        learningTwin: {
          topic: 'Number 5',
        },
        reflection: {
          selectedRepresentation:
            'visual-spatial',
        },
      },
    },
  ];
}

test(
  'explicit confusion becomes negative strategy evidence only',
  () => {
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand the number 5.',
        },
        history: history(),
        pedagogyPlan: basePlan(),
      });
    const observation =
      createTeachingOutcomeObservation({
        studentId: 'student-1',
        conversationId: 'conversation-1',
        studentMessageId:
          'student-message-2',
        pedagogyPlan: basePlan(),
        reflection,
        learningTwin: {
          evidenceVerified: false,
        },
      });

    assert.equal(
      observation.outcome,
      'ineffective'
    );
    assert.equal(
      observation.source,
      'explicit-confusion'
    );
    assert.equal(
      observation.representation,
      'visual-spatial'
    );
    assert.equal(
      observation.descriptiveOnly,
      true
    );
    assert.equal(
      'masteryDelta' in observation,
      false
    );
  }
);

test(
  'verified correct answer supports effectiveness without changing mastery',
  () => {
    const plan = basePlan({
      turnKind: 'answer',
      activeQuestion:
        'What comes after 4?',
      signals: {
        confusion: false,
        answerAttempt: true,
        understandingClaim: false,
      },
    });
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message: '5',
        },
        history: history(),
        pedagogyPlan: plan,
      });
    const observation =
      createTeachingOutcomeObservation({
        studentId: 'student-1',
        conversationId: 'conversation-1',
        studentMessageId:
          'student-message-2',
        pedagogyPlan: plan,
        reflection,
        learningTwin: {
          evidenceVerified: true,
          observation: 'correct',
        },
      });

    assert.equal(
      observation.outcome,
      'effective'
    );
    assert.equal(
      observation.verifiedEvidence,
      true
    );
    assert.equal(
      observation.metadata
        .mayChangeMastery,
      false
    );
  }
);

test(
  'verified incorrect answer remains an unknown strategy outcome',
  () => {
    const plan = basePlan({
      turnKind: 'answer',
      activeQuestion:
        'What comes after 4?',
      signals: {
        confusion: false,
        answerAttempt: true,
        understandingClaim: false,
      },
    });
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message: '6',
        },
        history: history(),
        pedagogyPlan: plan,
      });
    const observation =
      createTeachingOutcomeObservation({
        studentId: 'student-1',
        conversationId: 'conversation-1',
        studentMessageId:
          'student-message-2',
        pedagogyPlan: plan,
        reflection,
        learningTwin: {
          evidenceVerified: true,
          observation: 'incorrect',
        },
      });

    assert.equal(
      observation.outcome,
      'unknown'
    );
    assert.equal(
      observation.source,
      'verified-incorrect-answer'
    );
  }
);

test(
  'bounded preference requires repeated decisive evidence',
  () => {
    const oneObservation =
      selectBoundedRepresentation({
        candidates: [
          'concrete-example',
          'worked-step',
        ],
        previousRepresentation:
          'visual-spatial',
        fallback: 'concrete-example',
        memory: [
          {
            representation:
              'worked-step',
            effectiveCount: 1,
            ineffectiveCount: 0,
          },
        ],
      });

    assert.equal(
      oneObservation.representation,
      'concrete-example'
    );
    assert.equal(
      oneObservation.usedMemory,
      false
    );

    const repeatedEvidence =
      selectBoundedRepresentation({
        candidates: [
          'concrete-example',
          'worked-step',
        ],
        previousRepresentation:
          'visual-spatial',
        fallback: 'concrete-example',
        memory: [
          {
            representation:
              'worked-step',
            effectiveCount: 3,
            ineffectiveCount: 0,
          },
        ],
      });

    assert.equal(
      repeatedEvidence.representation,
      'worked-step'
    );
    assert.equal(
      repeatedEvidence.usedMemory,
      true
    );
  }
);

test(
  'reflection uses eligible topic memory only during a required strategy change',
  () => {
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand the number 5.',
        },
        history: history(),
        pedagogyPlan: basePlan(),
        outcomeMemory: [
          {
            representation:
              'worked-step',
            effectiveCount: 3,
            ineffectiveCount: 0,
            unknownCount: 0,
          },
        ],
      });

    assert.equal(
      reflection.decision
        .mustChangeRepresentation,
      true
    );
    assert.equal(
      reflection.decision
        .selectedRepresentation,
      'worked-step'
    );
    assert.equal(
      reflection.outcomeMemory
        .usedForSelection,
      true
    );
    assert.equal(
      reflection.evidencePolicy
        .mayChangeMastery,
      false
    );
  }
);
test(
  'repeated ineffective evidence activates bounded negative avoidance',
  () => {
    const selection =
      selectBoundedRepresentation({
        candidates: [
          'concrete-example',
          'visual-spatial',
          'analogy',
          'worked-step',
        ],
        previousRepresentation:
          'visual-spatial',
        fallback: 'analogy',
        memory: [
          {
            representation:
              'visual-spatial',
            effectiveCount: 0,
            ineffectiveCount: 2,
            unknownCount: 3,
          },
        ],
      });

    assert.equal(
      selection.representation,
      'analogy'
    );
    assert.equal(
      selection.usedMemory,
      true
    );
    assert.equal(
      selection.reason,
      'bounded-negative-avoidance'
    );
    assert.equal(
      selection.evidence
        .avoidedRepresentation,
      'visual-spatial'
    );
    assert.equal(
      selection.evidence
        .ineffectiveCount,
      2
    );
  }
);
