const {
  createHmac,
  randomUUID,
} = require('node:crypto');

const BLOCKED_TRAINING_FIELDS = new Set([
  'conversation',
  'conversationText',
  'message',
  'messages',
  'rawAudio',
  'rawImage',
  'transcript',
]);

function pseudonymousLearnerId(learnerId, secret) {
  if (
    !String(learnerId || '').trim() ||
    String(secret || '').length < 24
  ) {
    throw new Error(
      'A learner ID and 24+ character governance secret are required.'
    );
  }

  return createHmac('sha256', secret)
    .update(String(learnerId).trim(), 'utf8')
    .digest('hex');
}

function blockedFields(value, prefix = '') {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const matches = BLOCKED_TRAINING_FIELDS.has(key)
      ? [path]
      : [];

    return matches.concat(blockedFields(child, path));
  });
}

function createGovernedLearningEvent({
  learnerId,
  governanceSecret,
  type,
  purpose,
  consent,
  provenance,
  retentionDays = 30,
  payload,
  trainingEligible = false,
}) {
  const allowedPurposes = [
    'deliver-learning',
    'measure-progress',
    'improve-safety',
    'approved-research',
    'model-training',
  ];
  const normalizedPurpose = String(purpose || '');
  const normalizedType = String(type || '').trim();
  const payloadValue =
    payload && typeof payload === 'object'
      ? payload
      : {};
  const forbidden = blockedFields(payloadValue);

  if (
    !normalizedType ||
    !allowedPurposes.includes(normalizedPurpose) ||
    !provenance?.source ||
    !provenance?.license
  ) {
    const error = new Error(
      'Learning events require type, allowed purpose, source provenance, and license.'
    );
    error.code = 'GOVERNANCE_METADATA_REQUIRED';
    throw error;
  }

  if (
    (normalizedPurpose === 'model-training' ||
      trainingEligible) &&
    (!consent?.granted ||
      consent?.scope !== 'model-training')
  ) {
    const error = new Error(
      'Model-training data requires explicit scoped consent.'
    );
    error.code = 'TRAINING_CONSENT_REQUIRED';
    throw error;
  }

  if (
    (normalizedPurpose === 'model-training' ||
      trainingEligible) &&
    forbidden.length > 0
  ) {
    const error = new Error(
      `Raw private fields cannot enter training data: ${forbidden.join(
        ', '
      )}`
    );
    error.code = 'RAW_PRIVATE_DATA_BLOCKED';
    throw error;
  }

  const days = Math.min(
    3650,
    Math.max(1, Number(retentionDays) || 30)
  );
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + days * 86_400_000
  );

  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    learnerKey: pseudonymousLearnerId(
      learnerId,
      governanceSecret
    ),
    type: normalizedType.slice(0, 120),
    purpose: normalizedPurpose,
    consent: {
      granted: Boolean(consent?.granted),
      scope: String(consent?.scope || 'none').slice(
        0,
        80
      ),
      recordedAt: consent?.recordedAt || null,
    },
    provenance: {
      source: String(provenance.source).slice(0, 240),
      license: String(provenance.license).slice(0, 120),
      version: String(provenance.version || '').slice(
        0,
        120
      ),
    },
    retention: {
      days,
      expiresAt: expiresAt.toISOString(),
      deletionKey: randomUUID(),
    },
    trainingEligible: Boolean(trainingEligible),
    payload: payloadValue,
    createdAt: createdAt.toISOString(),
  };
}

module.exports = {
  BLOCKED_TRAINING_FIELDS,
  blockedFields,
  createGovernedLearningEvent,
  pseudonymousLearnerId,
};
