const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createTeachingOutcomeObservation,
} = require('../src/outcomes/memory');
const {
  applyReflectiveTeachingPlan,
  createReflectiveTeachingState,
} = require('../src/reflection/engine');
const {
  REVALIDATION_PROBE_VERSION,
} = require('../src/revalidation/probe');

function staleMemory() {
  return [
    {
      representation:
        'worked-step',
      effectiveCount: 4,
      ineffectiveCount: 0,
      unknownCount: 0,
      recentEffectiveCount: 0,
      recentIneffectiveCount: 0,
      recentUnknownCount: 0,
      revalidationEligible: false,
      revalidationStatus: 'stale',
      revalidationReason:
        'decisive-evidence-outside-freshness-window',
      revalidationConfidence: 0,
      conflictingEvidence: false,
      lastObservedAt:
        '2026-01-01T00:00:00.000Z',
      lastDecisiveAt:
        '2026-01-01T00:00:00.000Z',
    },
  ];
}

function plan(
  overrides = {}
) {
  return {
    subjectKey:
      'subject:mathematics',
    subjectFamily:
      'mathematics',
    subject: 'Mathematics',
    focusTopic: 'Number 5',
    turnKind: 'confusion',
    lessonState: 'scaffold',
    supportLevel: 1,
    activeQuestion: '',
    signals: {
      confusion: true,
      answerAttempt: false,
      understandingClaim: false,
      needsClarification: false,
      practiceRequest: false,
    },
    relevantMemory: {
      subject: {
        lastTopic: 'Number 5',
      },
      activeMisconceptions: [],
    },
    ...overrides,
  };
}

function originalHistory() {
  return [
    {
      id: 'student-one',
      role: 'student',
      text:
        'Explain the number 5.',
    },
    {
      id: 'tutor-one',
      role: 'tutor',
      text:
        'Imagine five counters on a number line. What do you notice?',
      metadata: {
        learningTwin: {
          topic: 'Number 5',
          skill:
            'Building a mental connection',
        },
        tutorDecision: {
          teachingAction: {
            kind:
              'build-mental-connection',
          },
        },
        reflection: {
          topic: 'Number 5',
          selectedRepresentation:
            'visual-spatial',
        },
      },
    },
  ];
}

test(
  'stale strategy evidence becomes one persisted reflection probe',
  () => {
    const base = plan();
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand the number 5.',
        },
        history:
          originalHistory(),
        pedagogyPlan: base,
        outcomeMemory:
          staleMemory(),
      });
    const adapted =
      applyReflectiveTeachingPlan(
        base,
        reflection
      );

    assert.equal(
      reflection.outcomeMemory
        .revalidationRequired,
      true
    );
    assert.equal(
      reflection.revalidationProbe
        .active,
      true
    );
    assert.equal(
      reflection.revalidationProbe
        .version,
      REVALIDATION_PROBE_VERSION
    );
    assert.equal(
      reflection.revalidationProbe
        .attemptNumber,
      1
    );
    assert.equal(
      reflection.decision
        .selectedStrategy,
      'bounded-strategy-revalidation-probe'
    );
    assert.equal(
      reflection.decision
        .selectedRepresentation,
      reflection.revalidationProbe
        .selectedRepresentation
    );
    assert.equal(
      reflection.decision
        .maximumTeachingActions,
      1
    );
    assert.equal(
      reflection.decision
        .askAtMostOneQuestion,
      true
    );
    assert.equal(
      reflection.evidencePolicy
        .mayChangeMastery,
      false
    );
    assert.equal(
      reflection.evidencePolicy
        .mayCreateMisconception,
      false
    );
    assert.equal(
      adapted.revalidationProbe
        .active,
      true
    );
    assert.match(
      adapted.teachingMove,
      /exactly one bounded strategy revalidation step/i
    );
  }
);

test(
  'explicit confusion after a probe records ineffective probe evidence only',
  () => {
    const priorProbe = {
      version:
        REVALIDATION_PROBE_VERSION,
      active: true,
      required: true,
      exhausted: false,
      attemptId:
        'probe-existing-one',
      attemptNumber: 1,
      topic: 'Number 5',
      selectedRepresentation:
        'analogy',
      reason:
        'revalidate-stale-strategy-evidence',
      descriptiveOnly: true,
      deliveryMayChangeMastery:
        false,
      deliveryMayCreateMisconception:
        false,
    };
    const history = [
      {
        id: 'student-one',
        role: 'student',
        text:
          'Explain the number 5.',
      },
      {
        id: 'tutor-probe-one',
        role: 'tutor',
        text:
          'Think of five fingers on one hand. What do you notice?',
        metadata: {
          learningTwin: {
            topic: 'Number 5',
          },
          reflection: {
            topic: 'Number 5',
            selectedRepresentation:
              'analogy',
            revalidationProbe:
              priorProbe,
          },
        },
      },
    ];
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand the number 5.',
        },
        history,
        pedagogyPlan: plan(),
        outcomeMemory:
          staleMemory(),
      });
    const observation =
      createTeachingOutcomeObservation({
        studentId: 'student-one',
        conversationId:
          'conversation-one',
        studentMessageId:
          'student-two',
        pedagogyPlan: plan(),
        reflection,
        learningTwin: {
          evidenceVerified: false,
          observation: '',
        },
      });

    assert.equal(
      reflection.previousStep
        .revalidationProbe
        .attemptId,
      'probe-existing-one'
    );
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
      'analogy'
    );
    assert.equal(
      observation.metadata
        .revalidationProbe
        .attemptId,
      'probe-existing-one'
    );
    assert.equal(
      observation.metadata
        .mayChangeMastery,
      false
    );
    assert.equal(
      observation.metadata
        .mayCreateMisconception,
      false
    );
  }
);

test(
  'verified correct answer may mark the previous probe effective without probe mastery',
  () => {
    const priorProbe = {
      version:
        REVALIDATION_PROBE_VERSION,
      active: true,
      attemptId:
        'probe-correct-one',
      attemptNumber: 1,
      topic: 'Number 5',
      selectedRepresentation:
        'worked-step',
      reason:
        'revalidate-conflicted-strategy-evidence',
    };
    const answerPlan = plan({
      turnKind: 'answer',
      activeQuestion:
        'What comes after 4?',
      signals: {
        confusion: false,
        answerAttempt: true,
        understandingClaim: false,
      },
    });
    const history = [
      {
        id: 'student-one',
        role: 'student',
        text:
          'Explain the number 5.',
      },
      {
        id: 'tutor-probe-one',
        role: 'tutor',
        text:
          'Start at 4 and take one step. What number do you reach?',
        metadata: {
          learningTwin: {
            topic: 'Number 5',
          },
          reflection: {
            topic: 'Number 5',
            selectedRepresentation:
              'worked-step',
            revalidationProbe:
              priorProbe,
          },
        },
      },
    ];
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message: '5',
        },
        history,
        pedagogyPlan:
          answerPlan,
        outcomeMemory:
          staleMemory(),
      });
    const observation =
      createTeachingOutcomeObservation({
        studentId: 'student-one',
        conversationId:
          'conversation-one',
        studentMessageId:
          'student-answer',
        pedagogyPlan:
          answerPlan,
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
        .revalidationProbe
        .attemptId,
      'probe-correct-one'
    );
    assert.equal(
      observation.metadata
        .mayChangeMastery,
      false
    );
  }
);

test(
  'an unverified probe response remains unknown strategy evidence',
  () => {
    const answerPlan = plan({
      turnKind: 'answer',
      activeQuestion:
        'What comes after 4?',
      signals: {
        confusion: false,
        answerAttempt: true,
        understandingClaim: false,
      },
    });
    const history = [
      {
        id: 'tutor-probe-one',
        role: 'tutor',
        text:
          'Start at 4 and take one step. What number do you reach?',
        metadata: {
          learningTwin: {
            topic: 'Number 5',
          },
          reflection: {
            topic: 'Number 5',
            selectedRepresentation:
              'worked-step',
            revalidationProbe: {
              version:
                REVALIDATION_PROBE_VERSION,
              active: true,
              attemptId:
                'probe-unknown-one',
              attemptNumber: 1,
              topic: 'Number 5',
              selectedRepresentation:
                'worked-step',
              reason:
                'revalidate-stale-strategy-evidence',
            },
          },
        },
      },
    ];
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message: 'Maybe 5',
        },
        history,
        pedagogyPlan:
          answerPlan,
        outcomeMemory:
          staleMemory(),
      });
    const observation =
      createTeachingOutcomeObservation({
        studentId: 'student-one',
        conversationId:
          'conversation-one',
        studentMessageId:
          'student-answer',
        pedagogyPlan:
          answerPlan,
        reflection,
        learningTwin: {
          evidenceVerified: false,
          observation: '',
        },
      });

    assert.equal(
      observation.outcome,
      'unknown'
    );
    assert.equal(
      observation.source,
      'answer-outcome-not-decisive'
    );
    assert.equal(
      observation.metadata
        .revalidationProbe
        .attemptId,
      'probe-unknown-one'
    );
  }
);
