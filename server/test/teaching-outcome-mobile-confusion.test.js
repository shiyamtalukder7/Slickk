const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createTutorPlan,
} = require('../src/pedagogy/orchestrator');
const {
  createReflectiveTeachingState,
} = require('../src/reflection/engine');
const {
  createTeachingOutcomeObservation,
} = require('../src/outcomes/memory');

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
        'Imagine 5 counters on a number line. Can you name another group of 5?',
      metadata: {
        learningTwin: {
          topic: 'Number 5',
        },
        tutorDecision: {
          teachingAction: {
            kind:
              'build-mental-connection',
          },
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
  'exact stored mobile confusion creates negative evidence and uses bounded avoidance',
  () => {
    const message =
      'I still do not understandthe number 5.';
    const priorHistory = history();
    const plan = createTutorPlan({
      requestData: {
        message,
        grade: 'Class 7',
        subject: 'Auto',
        materialContext: {
          verified: false,
          materialIds: [],
        },
      },
      history: priorHistory,
      learnerProfile: {},
    });

    assert.equal(
      plan.turnKind,
      'confusion'
    );
    assert.equal(
      plan.signals.confusion,
      true
    );
    assert.equal(
      plan.signals.answerAttempt,
      false
    );

    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message,
        },
        history: priorHistory,
        pedagogyPlan: plan,
        outcomeMemory: [
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
      reflection.outcome,
      'previous-step-not-yet-effective'
    );
    assert.equal(
      reflection.decision
        .mustChangeRepresentation,
      true
    );
    assert.equal(
      reflection.decision
        .selectedRepresentation,
      'analogy'
    );
    assert.equal(
      reflection.outcomeMemory
        .usedForSelection,
      true
    );
    assert.equal(
      reflection.outcomeMemory
        .selectionReason,
      'bounded-negative-avoidance'
    );

    const observation =
      createTeachingOutcomeObservation({
        studentId: 'local-student',
        conversationId:
          'conversation-mobile-1',
        studentMessageId:
          'student-message-2',
        pedagogyPlan: plan,
        reflection,
        learningTwin: {
          evidenceVerified: false,
          observation: '',
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
      observation.metadata
        .mayChangeMastery,
      false
    );
  }
);
