const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectBoundedRepresentation,
} = require('../src/outcomes/memory');
const {
  createReflectiveTeachingState,
} = require('../src/reflection/engine');

function revalidated(
  overrides = {}
) {
  return {
    representation: 'worked-step',
    effectiveCount: 3,
    ineffectiveCount: 0,
    unknownCount: 0,
    recentEffectiveCount: 3,
    recentIneffectiveCount: 0,
    recentUnknownCount: 0,
    revalidationEligible: true,
    revalidationStatus:
      'fresh-positive',
    revalidationReason:
      'recent-positive-evidence-revalidated',
    revalidationConfidence: 1,
    conflictingEvidence: false,
    lastObservedAt:
      '2026-08-07T00:00:00.000Z',
    lastDecisiveAt:
      '2026-08-07T00:00:00.000Z',
    ...overrides,
  };
}

test(
  'fresh decisive positive memory may guide a bounded strategy change',
  () => {
    const result =
      selectBoundedRepresentation({
        candidates: [
          'concrete-example',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'visual-spatial',
        fallback:
          'concrete-example',
        memory: [
          revalidated(),
        ],
      });

    assert.equal(
      result.representation,
      'worked-step'
    );
    assert.equal(
      result.usedMemory,
      true
    );
    assert.equal(
      result.revalidationRequired,
      false
    );
    assert.equal(
      result.reason,
      'bounded-student-topic-preference'
    );
    assert.equal(
      result.evidence
        .revalidationStatus,
      'fresh-positive'
    );
  }
);

test(
  'stale positive memory cannot remain a permanent preference',
  () => {
    const result =
      selectBoundedRepresentation({
        candidates: [
          'concrete-example',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'visual-spatial',
        fallback:
          'concrete-example',
        memory: [
          revalidated({
            effectiveCount: 12,
            recentEffectiveCount: 0,
            revalidationEligible: false,
            revalidationStatus: 'stale',
            revalidationReason:
              'decisive-evidence-outside-freshness-window',
            revalidationConfidence: 0,
          }),
        ],
      });

    assert.equal(
      result.representation,
      'concrete-example'
    );
    assert.equal(
      result.usedMemory,
      false
    );
    assert.equal(
      result.revalidationRequired,
      true
    );
    assert.equal(
      result.reason,
      'strategy-revalidation-required'
    );
  }
);

test(
  'stale negative memory cannot permanently blacklist a strategy',
  () => {
    const result =
      selectBoundedRepresentation({
        candidates: [
          'visual-spatial',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'worked-step',
        fallback:
          'visual-spatial',
        memory: [
          revalidated({
            representation:
              'visual-spatial',
            effectiveCount: 0,
            ineffectiveCount: 10,
            recentEffectiveCount: 0,
            recentIneffectiveCount: 0,
            revalidationEligible: false,
            revalidationStatus: 'stale',
            revalidationReason:
              'decisive-evidence-outside-freshness-window',
            revalidationConfidence: 0,
          }),
        ],
      });

    assert.equal(
      result.representation,
      'visual-spatial'
    );
    assert.equal(
      result.usedMemory,
      false
    );
    assert.equal(
      result.revalidationRequired,
      true
    );
  }
);

test(
  'balanced conflicting evidence blocks automatic preference',
  () => {
    const result =
      selectBoundedRepresentation({
        candidates: [
          'concrete-example',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'visual-spatial',
        fallback: 'analogy',
        memory: [
          revalidated({
            effectiveCount: 5,
            ineffectiveCount: 5,
            recentEffectiveCount: 1,
            recentIneffectiveCount: 1,
            revalidationEligible: false,
            revalidationStatus:
              'conflicted',
            revalidationReason:
              'recent-effective-and-ineffective-evidence-conflict',
            revalidationConfidence: 0,
            conflictingEvidence: true,
          }),
        ],
      });

    assert.equal(
      result.representation,
      'analogy'
    );
    assert.equal(
      result.usedMemory,
      false
    );
    assert.equal(
      result.revalidationRequired,
      true
    );
    assert.equal(
      result.evidence
        .conflictingEvidence,
      true
    );
  }
);

test(
  'dominant recent evidence may survive a bounded conflict penalty',
  () => {
    const result =
      selectBoundedRepresentation({
        candidates: [
          'concrete-example',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'visual-spatial',
        fallback:
          'concrete-example',
        memory: [
          revalidated({
            effectiveCount: 4,
            ineffectiveCount: 1,
            recentEffectiveCount: 3,
            recentIneffectiveCount: 1,
            revalidationEligible: true,
            revalidationStatus:
              'fresh-positive',
            revalidationConfidence: 0.5,
            conflictingEvidence: true,
          }),
        ],
      });

    assert.equal(
      result.representation,
      'worked-step'
    );
    assert.equal(
      result.usedMemory,
      true
    );
    assert.equal(
      result.evidence
        .revalidationConfidence,
      0.5
    );
    assert.equal(
      result.evidence
        .conflictingEvidence,
      true
    );
  }
);

test(
  'reflection exposes revalidation metadata without changing mastery policy',
  () => {
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand the number 5.',
        },
        history: [
          {
            id: 'student-1',
            role: 'student',
            text:
              'Explain the number 5.',
          },
          {
            id: 'tutor-1',
            role: 'tutor',
            text:
              'Five counters show the quantity. What do you notice?',
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
        ],
        pedagogyPlan: {
          subjectKey:
            'subject:mathematics',
          subjectFamily:
            'mathematics',
          subject: 'Mathematics',
          focusTopic: 'Number 5',
          turnKind: 'confusion',
          supportLevel: 1,
          signals: {
            confusion: true,
            answerAttempt: false,
            understandingClaim: false,
          },
          nextQuestion:
            'What comes after 4?',
        },
        outcomeMemory: [
          revalidated({
            effectiveCount: 10,
            recentEffectiveCount: 0,
            revalidationEligible: false,
            revalidationStatus: 'stale',
            revalidationReason:
              'decisive-evidence-outside-freshness-window',
            revalidationConfidence: 0,
          }),
        ],
      });

    assert.equal(
      reflection.decision
        .mustChangeRepresentation,
      true
    );
    assert.equal(
      reflection.outcomeMemory
        .usedForSelection,
      false
    );
    assert.equal(
      reflection.outcomeMemory
        .revalidationRequired,
      true
    );
    assert.equal(
      reflection.outcomeMemory
        .selectionReason,
      'strategy-revalidation-required'
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
  }
);
