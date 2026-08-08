const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildApprovedDataset,
  reviewTrainingCandidate,
} = require('../src/training/review');

function candidate(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'example-1',
    split: 'training',
    status: 'awaiting-reviewed-response',
    task: {
      kind: 'guided-hint',
      goal: 'Offer the smallest useful hint.',
    },
    learnerContext: {
      curriculum: 'NCTB',
      grade: 'Class 7',
      subject: 'Mathematics',
      language: 'Bangla',
    },
    source: {
      documentId: 'open-math-1',
      documentSha256: 'source-sha256',
      title: 'Open Mathematics',
      page: 12,
      chunkIndex: 0,
      rights: 'open-license',
      content: 'Equivalent fractions express the same quantity.',
    },
    generatedResponse:
      'Try multiplying the numerator and denominator by the same number. What stays unchanged?',
    containsRawPrivateData: false,
    ...overrides,
  };
}

function approval(overrides = {}) {
  return {
    decision: 'approved',
    reviewerId: 'educator-42',
    reviewerRole: 'educator',
    reviewedAt: '2026-08-05T00:00:00.000Z',
    checks: {
      factualGrounding: true,
      ageAppropriateness: true,
      teachingQuality: true,
      safety: true,
    },
    notes: 'Grounded and appropriately scaffolded.',
    ...overrides,
  };
}

test('educator approval creates an immutable review record', () => {
  const reviewed = reviewTrainingCandidate(candidate(), approval());

  assert.equal(reviewed.status, 'educator-approved');
  assert.equal(reviewed.review.decision, 'approved');
  assert.equal(reviewed.review.reviewer.role, 'educator');
  assert.match(reviewed.review.candidateDigest, /^[a-f0-9]{64}$/);
  assert.match(reviewed.review.digest, /^[a-f0-9]{64}$/);
});

test('approval fails when an educational or safety check is missing', () => {
  assert.throws(
    () =>
      reviewTrainingCandidate(
        candidate(),
        approval({
          checks: {
            factualGrounding: true,
            ageAppropriateness: true,
            teachingQuality: false,
            safety: true,
          },
        })
      ),
    { code: 'TRAINING_REVIEW_CHECKS_INCOMPLETE' }
  );
});

test('raw private student data cannot enter educator review', () => {
  assert.throws(
    () =>
      reviewTrainingCandidate(
        candidate({ containsRawPrivateData: true }),
        approval()
      ),
    { code: 'TRAINING_REVIEW_PRIVATE_DATA_BLOCKED' }
  );
});

test('dataset export includes only approved training examples', () => {
  const approved = reviewTrainingCandidate(candidate(), approval());
  const evaluation = reviewTrainingCandidate(
    candidate({ id: 'evaluation-1', split: 'evaluation' }),
    approval()
  );
  const rejected = reviewTrainingCandidate(
    candidate({ id: 'rejected-1' }),
    approval({ decision: 'rejected' })
  );

  const dataset = buildApprovedDataset([approved, evaluation, rejected], {
    createdAt: '2026-08-05T00:01:00.000Z',
  });

  assert.equal(dataset.exampleCount, 1);
  assert.equal(dataset.examples[0].id, 'example-1');
  assert.equal(dataset.policy.evaluationSplitExcluded, true);
  assert.match(dataset.digest, /^[a-f0-9]{64}$/);
});

test('dataset export excludes approved examples with ineligible rights', () => {
  const reviewed = reviewTrainingCandidate(
    candidate({
      source: {
        ...candidate().source,
        rights: 'licensed-user-copy',
      },
    }),
    approval()
  );

  assert.equal(buildApprovedDataset([reviewed]).exampleCount, 0);
});
