const {
  createHash,
} = require('node:crypto');

const REVALIDATION_PROBE_VERSION =
  'bounded-revalidation-probe-v1';
const DEFAULT_MAXIMUM_PROBE_ATTEMPTS = 3;
const DEFAULT_PROBE_HISTORY_LIMIT = 24;

function cleanText(
  value,
  maximumLength = 200
) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\u0000/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximumLength);
}

function normalizeTopic(value) {
  return cleanText(value, 200)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120);
}

function sameTopic(left, right) {
  const first = normalizeTopic(left);
  const second = normalizeTopic(right);

  return Boolean(
    first &&
    second &&
    first === second
  );
}

function messageRole(message = {}) {
  return cleanText(
    message.role,
    40
  ).toLowerCase();
}

function messageTopic(message = {}) {
  return cleanText(
    message?.metadata
      ?.reflection?.topic ||
    message?.metadata
      ?.learningTwin?.topic,
    200
  );
}

function messageProbe(message = {}) {
  const probe =
    message?.metadata
      ?.reflection
      ?.revalidationProbe;

  return (
    probe &&
    typeof probe === 'object'
  )
    ? probe
    : null;
}

function clampInteger(
  value,
  minimum,
  maximum,
  fallback
) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.round(numeric)
    )
  );
}

function uniqueRepresentations(
  candidates = []
) {
  return [
    ...new Set(
      (
        Array.isArray(candidates)
          ? candidates
          : []
      )
        .map(
          (item) =>
            cleanText(item, 80)
        )
        .filter(Boolean)
    ),
  ];
}

function recentRevalidationProbeAttempts({
  history = [],
  topic = '',
  limit =
    DEFAULT_PROBE_HISTORY_LIMIT,
} = {}) {
  const safeLimit =
    clampInteger(
      limit,
      1,
      100,
      DEFAULT_PROBE_HISTORY_LIMIT
    );
  const attempts = [];

  for (
    const message of
      [...(
        Array.isArray(history)
          ? history
          : []
      )].reverse()
  ) {
    if (
      messageRole(message) !== 'tutor'
    ) {
      continue;
    }

    const probe = messageProbe(message);

    if (
      probe?.active !== true
    ) {
      continue;
    }

    const probeTopic =
      cleanText(
        probe.topic ||
        messageTopic(message),
        200
      );

    if (
      topic &&
      probeTopic &&
      !sameTopic(topic, probeTopic)
    ) {
      continue;
    }

    const selectedRepresentation =
      cleanText(
        probe.selectedRepresentation,
        80
      );

    if (!selectedRepresentation) {
      continue;
    }

    attempts.push({
      attemptId:
        cleanText(
          probe.attemptId,
          160
        ),
      attemptNumber:
        clampInteger(
          probe.attemptNumber,
          1,
          1000,
          attempts.length + 1
        ),
      topic: probeTopic,
      selectedRepresentation,
      reason:
        cleanText(
          probe.reason,
          160
        ),
      sourceMessageId:
        cleanText(
          message.id,
          160
        ),
    });

    if (
      attempts.length >= safeLimit
    ) {
      break;
    }
  }

  return attempts;
}

function probeAttemptId({
  topic,
  previousTutorMessageId,
  selectedRepresentation,
  attemptNumber,
}) {
  const payload = [
    REVALIDATION_PROBE_VERSION,
    normalizeTopic(topic),
    cleanText(
      previousTutorMessageId,
      160
    ),
    cleanText(
      selectedRepresentation,
      80
    ),
    String(attemptNumber),
  ].join('|');

  return (
    'probe-' +
    createHash('sha256')
      .update(payload)
      .digest('hex')
      .slice(0, 24)
  );
}

function inactiveProbe({
  required = false,
  exhausted = false,
  reason,
  selectedRepresentation = '',
  maximumAttempts,
  attemptsUsed = 0,
  recentRepresentations = [],
} = {}) {
  return {
    version:
      REVALIDATION_PROBE_VERSION,
    active: false,
    required:
      required === true,
    exhausted:
      exhausted === true,
    reason:
      cleanText(reason, 160),
    selectedRepresentation:
      cleanText(
        selectedRepresentation,
        80
      ),
    attemptId: '',
    attemptNumber: 0,
    attemptsUsed:
      Math.max(
        0,
        Number(attemptsUsed) || 0
      ),
    maximumAttempts,
    recentRepresentations:
      uniqueRepresentations(
        recentRepresentations
      ),
    maximumTeachingActions: 1,
    askAtMostOneQuestion: true,
    descriptiveOnly: true,
    deliveryMayChangeMastery: false,
    deliveryMayCreateMisconception:
      false,
  };
}

function createBoundedRevalidationProbe({
  representationPreference = {},
  candidates = [],
  previousRepresentation = '',
  history = [],
  topic = '',
  previousTutorMessageId = '',
  maximumAttempts =
    DEFAULT_MAXIMUM_PROBE_ATTEMPTS,
} = {}) {
  const required =
    representationPreference
      ?.revalidationRequired === true;
  const safeMaximumAttempts =
    clampInteger(
      maximumAttempts,
      1,
      6,
      DEFAULT_MAXIMUM_PROBE_ATTEMPTS
    );

  if (!required) {
    return inactiveProbe({
      required: false,
      exhausted: false,
      reason:
        'strategy-revalidation-not-required',
      selectedRepresentation:
        representationPreference
          ?.representation,
      maximumAttempts:
        safeMaximumAttempts,
    });
  }

  const safePrevious =
    cleanText(
      previousRepresentation,
      80
    );
  const safeCandidates =
    uniqueRepresentations(
      candidates
    );
  const allowed =
    safeCandidates.filter(
      (representation) =>
        representation !==
          safePrevious &&
        representation !== 'none' &&
        representation !==
          'unclassified'
    );
  const priorAttempts =
    recentRevalidationProbeAttempts({
      history,
      topic,
      limit:
        DEFAULT_PROBE_HISTORY_LIMIT,
    });
  const recentRepresentations =
    priorAttempts.map(
      (attempt) =>
        attempt.selectedRepresentation
    );
  const attemptsUsed =
    priorAttempts.length;

  if (
    attemptsUsed >=
      safeMaximumAttempts
  ) {
    return inactiveProbe({
      required: true,
      exhausted: true,
      reason:
        'probe-budget-exhausted',
      selectedRepresentation:
        representationPreference
          ?.representation,
      maximumAttempts:
        safeMaximumAttempts,
      attemptsUsed,
      recentRepresentations,
    });
  }

  const recentlyUsed =
    new Set(recentRepresentations);
  const latestRepresentation =
    recentRepresentations[0] || '';
  const selectedRepresentation =
    allowed.find(
      (representation) =>
        !recentlyUsed.has(
          representation
        )
    ) ||
    allowed.find(
      (representation) =>
        representation !==
          latestRepresentation
    ) ||
    allowed[0] ||
    (
      cleanText(
        representationPreference
          ?.representation,
        80
      ) !== safePrevious
        ? cleanText(
            representationPreference
              ?.representation,
            80
          )
        : ''
    );

  if (!selectedRepresentation) {
    return inactiveProbe({
      required: true,
      exhausted: true,
      reason:
        'no-safe-alternative-representation',
      selectedRepresentation: '',
      maximumAttempts:
        safeMaximumAttempts,
      attemptsUsed,
      recentRepresentations,
    });
  }

  const attemptNumber =
    attemptsUsed + 1;
  const status =
    cleanText(
      representationPreference
        ?.evidence
        ?.revalidationStatus,
      80
    ) || 'unresolved';
  const sourceReason =
    cleanText(
      representationPreference
        ?.evidence
        ?.revalidationReason,
      160
    );
  const reason =
    status === 'stale'
      ? 'revalidate-stale-strategy-evidence'
      : status === 'conflicted'
        ? 'revalidate-conflicted-strategy-evidence'
        : status === 'insufficient'
          ? 'revalidate-insufficient-strategy-evidence'
          : 'revalidate-unresolved-strategy-evidence';

  return {
    version:
      REVALIDATION_PROBE_VERSION,
    active: true,
    required: true,
    exhausted: false,
    attemptId:
      probeAttemptId({
        topic,
        previousTutorMessageId,
        selectedRepresentation,
        attemptNumber,
      }),
    attemptNumber,
    attemptsUsed,
    maximumAttempts:
      safeMaximumAttempts,
    topic:
      cleanText(topic, 200),
    previousRepresentation:
      safePrevious,
    selectedRepresentation,
    recentRepresentations:
      uniqueRepresentations(
        recentRepresentations
      ),
    reason,
    sourceSelectionReason:
      cleanText(
        representationPreference
          ?.reason,
        160
      ),
    sourceRevalidationStatus:
      status,
    sourceRevalidationReason:
      sourceReason,
    maximumTeachingActions: 1,
    askAtMostOneQuestion: true,
    learnerCheck: {
      kind:
        'single-low-stakes-check',
      maximumQuestions: 1,
      requiresVerifiedAnswerForEffective:
        true,
    },
    outcomePolicy: {
      effective:
        'verified-correct-answer-only',
      ineffective:
        'explicit-confusion',
      unknown:
        'unverified-or-nondecisive-response',
    },
    scope:
      'student-subject-topic-representation',
    descriptiveOnly: true,
    deliveryMayChangeMastery: false,
    deliveryMayCreateMisconception:
      false,
  };
}

module.exports = {
  DEFAULT_MAXIMUM_PROBE_ATTEMPTS,
  DEFAULT_PROBE_HISTORY_LIMIT,
  REVALIDATION_PROBE_VERSION,
  createBoundedRevalidationProbe,
  recentRevalidationProbeAttempts,
};
