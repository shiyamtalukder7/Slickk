const { createHash } = require('node:crypto');

const REQUIRED_CHECKS = Object.freeze([
  'factualGrounding',
  'ageAppropriateness',
  'teachingQuality',
  'safety',
]);

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }

  return value;
}

function reviewDigest(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function reviewError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateCandidate(candidate) {
  if (!candidate?.id || !candidate?.source || !candidate?.task) {
    throw reviewError(
      'Review candidate is missing its immutable source or task identity.',
      'TRAINING_REVIEW_CANDIDATE_INVALID'
    );
  }

  if (candidate.status !== 'awaiting-reviewed-response') {
    throw reviewError(
      'Only candidates awaiting review can receive a review decision.',
      'TRAINING_REVIEW_STATE_INVALID'
    );
  }

  if (!String(candidate.generatedResponse || '').trim()) {
    throw reviewError(
      'A generated response is required before educator review.',
      'TRAINING_REVIEW_RESPONSE_REQUIRED'
    );
  }

  if (candidate.containsRawPrivateData === true) {
    throw reviewError(
      'Raw private student data cannot enter the training review queue.',
      'TRAINING_REVIEW_PRIVATE_DATA_BLOCKED'
    );
  }
}

function reviewTrainingCandidate(candidate, input) {
  validateCandidate(candidate);

  const reviewerId = String(input?.reviewerId || '').trim();
  if (!reviewerId) {
    throw reviewError(
      'An accountable educator reviewer ID is required.',
      'TRAINING_REVIEWER_REQUIRED'
    );
  }

  if (input?.reviewerRole !== 'educator') {
    throw reviewError(
      'Training examples require review by an authorized educator.',
      'TRAINING_REVIEWER_ROLE_INVALID'
    );
  }

  const checks = Object.fromEntries(
    REQUIRED_CHECKS.map((name) => [name, input?.checks?.[name] === true])
  );
  const failedChecks = REQUIRED_CHECKS.filter((name) => !checks[name]);
  const requestedDecision = input?.decision;

  if (!['approved', 'rejected'].includes(requestedDecision)) {
    throw reviewError(
      'Review decision must be approved or rejected.',
      'TRAINING_REVIEW_DECISION_INVALID'
    );
  }

  if (requestedDecision === 'approved' && failedChecks.length > 0) {
    throw reviewError(
      `Approval requires every review check: ${failedChecks.join(', ')}`,
      'TRAINING_REVIEW_CHECKS_INCOMPLETE'
    );
  }

  const reviewedAt = input?.reviewedAt || new Date().toISOString();
  const review = {
    schemaVersion: 1,
    candidateId: candidate.id,
    candidateDigest: reviewDigest({
      id: candidate.id,
      split: candidate.split,
      task: candidate.task,
      learnerContext: candidate.learnerContext,
      source: candidate.source,
      generatedResponse: candidate.generatedResponse,
    }),
    decision: requestedDecision,
    reviewer: {
      id: reviewerId,
      role: 'educator',
    },
    checks,
    notes: String(input?.notes || '').trim(),
    reviewedAt,
  };

  return {
    ...candidate,
    status:
      requestedDecision === 'approved'
        ? 'educator-approved'
        : 'educator-rejected',
    review: {
      ...review,
      digest: reviewDigest(review),
    },
  };
}

function buildApprovedDataset(reviewedCandidates, { datasetId, createdAt } = {}) {
  const approved = reviewedCandidates.filter(
    (candidate) =>
      candidate?.status === 'educator-approved' &&
      candidate?.review?.decision === 'approved' &&
      candidate?.split === 'training' &&
      candidate?.containsRawPrivateData !== true &&
      candidate?.source?.rights &&
      ['public-domain', 'open-license'].includes(candidate.source.rights) &&
      REQUIRED_CHECKS.every(
        (name) => candidate.review.checks?.[name] === true
      )
  );

  const examples = approved.map((candidate) => ({
    id: candidate.id,
    task: candidate.task,
    learnerContext: candidate.learnerContext,
    source: candidate.source,
    response: candidate.generatedResponse,
    review: {
      digest: candidate.review.digest,
      reviewerRole: candidate.review.reviewer.role,
      reviewedAt: candidate.review.reviewedAt,
    },
  }));

  const immutable = {
    schemaVersion: 1,
    datasetId: datasetId || 'slickk-education-reviewed-v1',
    policy: {
      educatorApprovedOnly: true,
      rawPrivateDataExcluded: true,
      evaluationSplitExcluded: true,
      eligibleRights: ['open-license', 'public-domain'],
      requiredChecks: REQUIRED_CHECKS,
    },
    exampleCount: examples.length,
    examples,
  };

  return {
    ...immutable,
    digest: reviewDigest(immutable),
    createdAt: createdAt || new Date().toISOString(),
  };
}

module.exports = {
  REQUIRED_CHECKS,
  buildApprovedDataset,
  reviewDigest,
  reviewTrainingCandidate,
  stableValue,
};
