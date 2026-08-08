const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MAXIMUM_PROBE_ATTEMPTS,
  REVALIDATION_PROBE_VERSION,
  createBoundedRevalidationProbe,
  recentRevalidationProbeAttempts,
} = require('../src/revalidation/probe');

function preference(
  overrides = {}
) {
  return {
    representation:
      'visual-spatial',
    usedMemory: false,
    revalidationRequired: true,
    reason:
      'strategy-revalidation-required',
    evidence: {
      representation:
        'worked-step',
      revalidationStatus: 'stale',
      revalidationReason:
        'decisive-evidence-outside-freshness-window',
    },
    ...overrides,
  };
}

function tutorProbe({
  id,
  topic = 'Number 5',
  representation,
  attemptNumber,
}) {
  return {
    id,
    role: 'tutor',
    text:
      'A small learner-facing example.',
    metadata: {
      learningTwin: {
        topic,
      },
      reflection: {
        topic,
        revalidationProbe: {
          version:
            REVALIDATION_PROBE_VERSION,
          active: true,
          attemptId:
            `attempt-${attemptNumber}`,
          attemptNumber,
          topic,
          selectedRepresentation:
            representation,
          reason:
            'revalidate-stale-strategy-evidence',
        },
      },
    },
  };
}

test(
  'probe stays inactive when revalidation is not required',
  () => {
    const probe =
      createBoundedRevalidationProbe({
        representationPreference:
          preference({
            revalidationRequired:
              false,
          }),
        candidates: [
          'concrete-example',
          'visual-spatial',
        ],
        previousRepresentation:
          'worked-step',
        topic: 'Number 5',
      });

    assert.equal(
      probe.active,
      false
    );
    assert.equal(
      probe.required,
      false
    );
    assert.equal(
      probe.reason,
      'strategy-revalidation-not-required'
    );
  }
);

test(
  'stale evidence activates one bounded alternative probe',
  () => {
    const probe =
      createBoundedRevalidationProbe({
        representationPreference:
          preference(),
        candidates: [
          'concrete-example',
          'visual-spatial',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'worked-step',
        topic: 'Number 5',
        previousTutorMessageId:
          'tutor-one',
      });

    assert.equal(
      probe.active,
      true
    );
    assert.equal(
      probe.required,
      true
    );
    assert.equal(
      probe.exhausted,
      false
    );
    assert.notEqual(
      probe.selectedRepresentation,
      'worked-step'
    );
    assert.equal(
      probe.attemptNumber,
      1
    );
    assert.match(
      probe.attemptId,
      /^probe-[a-f0-9]{24}$/u
    );
    assert.equal(
      probe.maximumTeachingActions,
      1
    );
    assert.equal(
      probe.askAtMostOneQuestion,
      true
    );
    assert.equal(
      probe.deliveryMayChangeMastery,
      false
    );
    assert.equal(
      probe.deliveryMayCreateMisconception,
      false
    );
  }
);

test(
  'a later probe rotates away from a recent failed representation',
  () => {
    const history = [
      tutorProbe({
        id: 'probe-one',
        representation:
          'visual-spatial',
        attemptNumber: 1,
      }),
    ];
    const probe =
      createBoundedRevalidationProbe({
        representationPreference:
          preference(),
        candidates: [
          'concrete-example',
          'visual-spatial',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'visual-spatial',
        history,
        topic: 'Number 5',
        previousTutorMessageId:
          'probe-one',
      });

    assert.equal(
      probe.active,
      true
    );
    assert.equal(
      probe.attemptNumber,
      2
    );
    assert.notEqual(
      probe.selectedRepresentation,
      'visual-spatial'
    );
    assert.deepEqual(
      probe.recentRepresentations,
      ['visual-spatial']
    );
  }
);

test(
  'probe history remains topic isolated',
  () => {
    const history = [
      tutorProbe({
        id: 'fractions-one',
        topic: 'Fractions',
        representation:
          'visual-spatial',
        attemptNumber: 1,
      }),
      tutorProbe({
        id: 'number-five-one',
        topic: 'Number 5',
        representation:
          'analogy',
        attemptNumber: 1,
      }),
    ];
    const attempts =
      recentRevalidationProbeAttempts({
        history,
        topic: 'Number 5',
      });

    assert.equal(
      attempts.length,
      1
    );
    assert.equal(
      attempts[0]
        .selectedRepresentation,
      'analogy'
    );
  }
);

test(
  'probe budget stops indefinite repeated experiments',
  () => {
    const history = [
      tutorProbe({
        id: 'probe-one',
        representation:
          'concrete-example',
        attemptNumber: 1,
      }),
      tutorProbe({
        id: 'probe-two',
        representation:
          'visual-spatial',
        attemptNumber: 2,
      }),
      tutorProbe({
        id: 'probe-three',
        representation:
          'analogy',
        attemptNumber: 3,
      }),
    ];
    const probe =
      createBoundedRevalidationProbe({
        representationPreference:
          preference(),
        candidates: [
          'concrete-example',
          'visual-spatial',
          'worked-step',
          'analogy',
        ],
        previousRepresentation:
          'analogy',
        history,
        topic: 'Number 5',
      });

    assert.equal(
      probe.active,
      false
    );
    assert.equal(
      probe.required,
      true
    );
    assert.equal(
      probe.exhausted,
      true
    );
    assert.equal(
      probe.reason,
      'probe-budget-exhausted'
    );
    assert.equal(
      probe.attemptsUsed,
      DEFAULT_MAXIMUM_PROBE_ATTEMPTS
    );
  }
);
