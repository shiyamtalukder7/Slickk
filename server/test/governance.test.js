const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createGovernedLearningEvent,
  pseudonymousLearnerId,
} = require('../src/governance/events');

const secret =
  'governance-test-secret-with-32-characters';

test('learning events pseudonymize identity and carry deletion metadata', () => {
  const event = createGovernedLearningEvent({
    learnerId: 'student-1',
    governanceSecret: secret,
    type: 'assessment-result',
    purpose: 'measure-progress',
    consent: {
      granted: true,
      scope: 'learning-record',
    },
    provenance: {
      source: 'slickk-assessment',
      license: 'student-owned',
      version: '1',
    },
    payload: {
      score: 80,
    },
  });

  assert.notEqual(event.learnerKey, 'student-1');
  assert.match(event.retention.deletionKey, /^[\da-f-]+$/);
  assert.equal(
    event.learnerKey,
    pseudonymousLearnerId('student-1', secret)
  );
});

test('raw private conversations are blocked from training events', () => {
  assert.throws(
    () =>
      createGovernedLearningEvent({
        learnerId: 'student-1',
        governanceSecret: secret,
        type: 'training-example',
        purpose: 'model-training',
        trainingEligible: true,
        consent: {
          granted: true,
          scope: 'model-training',
        },
        provenance: {
          source: 'consented-interaction',
          license: 'consented-training',
        },
        payload: {
          messages: ['private child conversation'],
        },
      }),
    (error) =>
      error.code === 'RAW_PRIVATE_DATA_BLOCKED'
  );
});

test('training events require explicit model-training consent', () => {
  assert.throws(
    () =>
      createGovernedLearningEvent({
        learnerId: 'student-1',
        governanceSecret: secret,
        type: 'training-example',
        purpose: 'model-training',
        consent: {
          granted: true,
          scope: 'learning-record',
        },
        provenance: {
          source: 'assessment',
          license: 'consented-training',
        },
        payload: {
          skill: 'fractions',
          correct: true,
        },
      }),
    (error) =>
      error.code === 'TRAINING_CONSENT_REQUIRED'
  );
});
