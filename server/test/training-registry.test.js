const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createTrainingRunManifest,
  evaluateCandidate,
} = require('../src/training/registry');

test('training manifests are reproducible across key ordering', () => {
  const first = createTrainingRunManifest({
    codeRevision: 'abc123',
    configuration: { epochs: 2, seed: 42 },
    dataset: { digest: 'dataset-v1' },
    tokenizer: { digest: 'tokenizer-v1' },
    baseModel: { digest: 'model-v1' },
  });
  const second = createTrainingRunManifest({
    baseModel: { digest: 'model-v1' },
    tokenizer: { digest: 'tokenizer-v1' },
    dataset: { digest: 'dataset-v1' },
    configuration: { seed: 42, epochs: 2 },
    codeRevision: 'abc123',
  });

  assert.equal(first.digest, second.digest);
});

test('candidate models cannot pass while any safety gate fails', () => {
  const evaluation = evaluateCandidate({
    baseline: {
      grounding: 0.8,
      unsafeRate: 0.01,
    },
    candidate: {
      grounding: 0.86,
      unsafeRate: 0.03,
    },
    gates: {
      grounding: {
        direction: 'improve',
        threshold: 0.03,
      },
      unsafeRate: {
        direction: 'maximum',
        threshold: 0.01,
      },
    },
  });

  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.decision, 'rejected');
});
