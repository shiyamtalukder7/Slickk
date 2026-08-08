const TEACHING_OUTCOME_VERSION =
  'teaching-outcome-memory-v1';

const OUTCOMES = Object.freeze({
  effective: 'effective',
  ineffective: 'ineffective',
  unknown: 'unknown',
});

function cleanText(value, maximum = 500) {
  return String(value || '')
    .replace(/\u0000/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximum);
}

function normalizeTopicKey(value) {
  const normalized = cleanText(value, 160)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120);

  return normalized || 'general-learning';
}

function bounded(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.min(1, Math.max(0, number))
    : fallback;
}

function memoryNumbers(item = {}) {
  const effectiveCount = Math.max(
    0,
    Number(item.effectiveCount) || 0
  );
  const ineffectiveCount = Math.max(
    0,
    Number(item.ineffectiveCount) || 0
  );
  const unknownCount = Math.max(
    0,
    Number(item.unknownCount) || 0
  );
  const decisiveCount =
    effectiveCount + ineffectiveCount;
  const effectivenessRate =
    decisiveCount > 0
      ? effectiveCount / decisiveCount
      : 0.5;

  return {
    effectiveCount,
    ineffectiveCount,
    unknownCount,
    decisiveCount,
    totalObservations:
      decisiveCount + unknownCount,
    effectivenessRate,
  };
}

const STRATEGY_REVALIDATION_VERSION =
  'strategy-revalidation-v1';
const DEFAULT_STRATEGY_REVALIDATION_WINDOW_MS =
  30 * 24 * 60 * 60 * 1000;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(
    object || {},
    key
  );
}

function selectionMemoryNumbers(item = {}) {
  const hasRecentWindow =
    hasOwn(item, 'recentEffectiveCount') ||
    hasOwn(item, 'recentIneffectiveCount') ||
    hasOwn(item, 'recentUnknownCount');

  if (!hasRecentWindow) {
    return {
      ...memoryNumbers(item),
      hasRecentWindow: false,
    };
  }

  return {
    ...memoryNumbers({
      effectiveCount:
        item.recentEffectiveCount,
      ineffectiveCount:
        item.recentIneffectiveCount,
      unknownCount:
        item.recentUnknownCount,
    }),
    hasRecentWindow: true,
  };
}

function selectBoundedRepresentation({
  candidates = [],
  previousRepresentation = '',
  memory = [],
  fallback = '',
  minimumDecisiveEvidence = 2,
  minimumEffectivenessRate = 0.67,
} = {}) {
  const allowed = candidates
    .map((item) => cleanText(item, 80))
    .filter(
      (item) =>
        item &&
        item !== previousRepresentation
    );
  const fallbackRepresentation =
    allowed.includes(fallback)
      ? fallback
      : allowed[0] || fallback || '';
  const normalizedMemory = (
    Array.isArray(memory)
      ? memory
      : []
  )
    .map((item) => {
      const representation =
        cleanText(item?.representation, 80);
      const lifetime =
        memoryNumbers(item);
      const selection =
        selectionMemoryNumbers(item);
      const hasExplicitRevalidation =
        hasOwn(
          item,
          'revalidationEligible'
        ) ||
        hasOwn(
          item,
          'revalidationStatus'
        );
      const eligibleForSelection =
        hasExplicitRevalidation
          ? item.revalidationEligible === true
          : true;

      return {
        representation,
        ...selection,
        lifetimeEffectiveCount:
          lifetime.effectiveCount,
        lifetimeIneffectiveCount:
          lifetime.ineffectiveCount,
        lifetimeUnknownCount:
          lifetime.unknownCount,
        lifetimeDecisiveCount:
          lifetime.decisiveCount,
        lifetimeTotalObservations:
          lifetime.totalObservations,
        eligibleForSelection,
        hasExplicitRevalidation,
        revalidationStatus:
          cleanText(
            item?.revalidationStatus,
            80
          ) || (
            hasExplicitRevalidation
              ? 'not-eligible'
              : 'legacy-compatible'
          ),
        revalidationReason:
          cleanText(
            item?.revalidationReason,
            160
          ),
        revalidationConfidence:
          bounded(
            item?.revalidationConfidence,
            1
          ),
        conflictingEvidence:
          item?.conflictingEvidence === true,
        lastObservedAt:
          cleanText(
            item?.lastObservedAt,
            80
          ),
        lastDecisiveAt:
          cleanText(
            item?.lastDecisiveAt,
            80
          ),
      };
    })
    .filter((item) => item.representation);
  const rankedPositive =
    normalizedMemory
      .filter(
        (item) =>
          item.eligibleForSelection &&
          allowed.includes(
            item.representation
          ) &&
          item.decisiveCount >=
            minimumDecisiveEvidence &&
          item.effectivenessRate >=
            minimumEffectivenessRate
      )
      .sort(
        (left, right) =>
          right.effectivenessRate -
            left.effectivenessRate ||
          right.revalidationConfidence -
            left.revalidationConfidence ||
          right.decisiveCount -
            left.decisiveCount ||
          right.totalObservations -
            left.totalObservations ||
          left.representation.localeCompare(
            right.representation
          )
      );
  const selectedPositive =
    rankedPositive[0];

  if (selectedPositive) {
    return {
      representation:
        selectedPositive.representation,
      usedMemory: true,
      revalidationRequired: false,
      revalidationVersion:
        STRATEGY_REVALIDATION_VERSION,
      descriptiveOnly: true,
      reason:
        'bounded-student-topic-preference',
      evidence: {
        revalidationStatus:
          selectedPositive
            .revalidationStatus,
        revalidationConfidence:
          Number(
            selectedPositive
              .revalidationConfidence
              .toFixed(3)
          ),
        conflictingEvidence:
          selectedPositive
            .conflictingEvidence,
        decisiveCount:
          selectedPositive.decisiveCount,
        effectivenessRate:
          Number(
            selectedPositive
              .effectivenessRate
              .toFixed(3)
          ),
        effectiveCount:
          selectedPositive.effectiveCount,
        ineffectiveCount:
          selectedPositive
            .ineffectiveCount,
        lastObservedAt:
          selectedPositive.lastObservedAt,
        lastDecisiveAt:
          selectedPositive.lastDecisiveAt,
      },
    };
  }

  const previousEvidence =
    normalizedMemory.find(
      (item) =>
        item.representation ===
        previousRepresentation
    );
  const repeatedNegativeEvidence =
    previousEvidence &&
    previousEvidence
      .eligibleForSelection &&
    previousEvidence.decisiveCount >=
      minimumDecisiveEvidence &&
    previousEvidence.ineffectiveCount >=
      minimumDecisiveEvidence &&
    previousEvidence.effectivenessRate <=
      1 - minimumEffectivenessRate;

  if (repeatedNegativeEvidence) {
    return {
      representation:
        fallbackRepresentation,
      usedMemory: true,
      revalidationRequired: false,
      revalidationVersion:
        STRATEGY_REVALIDATION_VERSION,
      descriptiveOnly: true,
      reason:
        'bounded-negative-avoidance',
      evidence: {
        revalidationStatus:
          previousEvidence
            .revalidationStatus,
        revalidationConfidence:
          Number(
            previousEvidence
              .revalidationConfidence
              .toFixed(3)
          ),
        conflictingEvidence:
          previousEvidence
            .conflictingEvidence,
        avoidedRepresentation:
          previousRepresentation,
        decisiveCount:
          previousEvidence.decisiveCount,
        effectivenessRate:
          Number(
            previousEvidence
              .effectivenessRate
              .toFixed(3)
          ),
        effectiveCount:
          previousEvidence.effectiveCount,
        ineffectiveCount:
          previousEvidence
            .ineffectiveCount,
        lastObservedAt:
          previousEvidence.lastObservedAt,
        lastDecisiveAt:
          previousEvidence.lastDecisiveAt,
      },
    };
  }

  const blockedEvidence =
    normalizedMemory
      .filter(
        (item) =>
          item.hasExplicitRevalidation &&
          !item.eligibleForSelection &&
          item.lifetimeDecisiveCount >=
            minimumDecisiveEvidence
      )
      .sort(
        (left, right) =>
          (
            right.representation ===
            previousRepresentation
              ? 1
              : 0
          ) -
            (
              left.representation ===
              previousRepresentation
                ? 1
                : 0
            ) ||
          right.lifetimeDecisiveCount -
            left.lifetimeDecisiveCount ||
          left.representation.localeCompare(
            right.representation
          )
      )[0];

  if (blockedEvidence) {
    return {
      representation:
        fallbackRepresentation,
      usedMemory: false,
      revalidationRequired: true,
      revalidationVersion:
        STRATEGY_REVALIDATION_VERSION,
      descriptiveOnly: true,
      reason:
        'strategy-revalidation-required',
      evidence: {
        representation:
          blockedEvidence.representation,
        revalidationStatus:
          blockedEvidence
            .revalidationStatus,
        revalidationReason:
          blockedEvidence
            .revalidationReason,
        revalidationConfidence:
          Number(
            blockedEvidence
              .revalidationConfidence
              .toFixed(3)
          ),
        conflictingEvidence:
          blockedEvidence
            .conflictingEvidence,
        lifetimeDecisiveCount:
          blockedEvidence
            .lifetimeDecisiveCount,
        recentDecisiveCount:
          blockedEvidence.decisiveCount,
        lastObservedAt:
          blockedEvidence.lastObservedAt,
        lastDecisiveAt:
          blockedEvidence.lastDecisiveAt,
      },
    };
  }

  return {
    representation:
      fallbackRepresentation,
    usedMemory: false,
    revalidationRequired: false,
    revalidationVersion:
      STRATEGY_REVALIDATION_VERSION,
    descriptiveOnly: true,
    reason: 'subject-sequence-fallback',
    evidence: null,
  };
}

function createTeachingOutcomeObservation({
  studentId,
  conversationId,
  studentMessageId,
  pedagogyPlan = {},
  reflection = {},
  learningTwin = {},
} = {}) {
  const previous =
    reflection?.previousStep || {};
  const representation = cleanText(
    previous.representation,
    80
  );
  const topic = cleanText(
    previous.topic ||
      reflection.topic ||
      pedagogyPlan.focusTopic ||
      pedagogyPlan.subject,
    160
  );
  const previousMessageId = cleanText(
    previous.messageId,
    160
  );

  if (
    !cleanText(studentId, 160) ||
    !cleanText(conversationId, 160) ||
    previous.available !== true ||
    !representation ||
    representation === 'none' ||
    representation === 'unclassified' ||
    !topic
  ) {
    return null;
  }

  const observation =
    cleanText(
      learningTwin?.observation,
      40
    ).toLowerCase();
  const verified =
    learningTwin?.evidenceVerified === true;
  let outcome = '';
  let source = '';
  let confidence = 0;

  if (
    reflection.outcome ===
      'previous-step-not-yet-effective' &&
    reflection.currentSignal
      ?.confusion === true
  ) {
    outcome = OUTCOMES.ineffective;
    source = 'explicit-confusion';
    confidence = 1;
  } else if (
    verified &&
    observation === 'correct'
  ) {
    outcome = OUTCOMES.effective;
    source = 'verified-correct-answer';
    confidence = 1;
  } else if (
    reflection.currentSignal
      ?.answerAttempt === true
  ) {
    outcome = OUTCOMES.unknown;
    source =
      verified &&
      observation === 'incorrect'
        ? 'verified-incorrect-answer'
        : 'answer-outcome-not-decisive';
    confidence = verified ? 0.8 : 0.4;
  } else if (
    reflection.currentSignal
      ?.understandingClaim === true
  ) {
    outcome = OUTCOMES.unknown;
    source = 'understanding-claim-only';
    confidence = 0.3;
  } else {
    return null;
  }

  const safeStudentId =
    cleanText(studentId, 160);
  const safeConversationId =
    cleanText(conversationId, 160);
  const safeStudentMessageId =
    cleanText(studentMessageId, 160);
  const evidenceKey = [
    safeStudentId,
    safeConversationId,
    safeStudentMessageId ||
      previousMessageId ||
      normalizeTopicKey(topic),
    previousMessageId,
    representation,
    outcome,
  ].join(':');

  return {
    version: TEACHING_OUTCOME_VERSION,
    evidenceKey,
    studentId: safeStudentId,
    conversationId:
      safeConversationId,
    subjectKey: cleanText(
      pedagogyPlan.subjectKey ||
        'subject:general',
      160
    ),
    subject: cleanText(
      pedagogyPlan.subject ||
        'General learning',
      160
    ),
    topic,
    topicKey: normalizeTopicKey(topic),
    representation,
    outcome,
    source,
    confidence: bounded(confidence),
    verifiedEvidence: verified,
    descriptiveOnly: true,
    metadata: {
      previousTutorMessageId:
        previousMessageId,
      previousAction:
        cleanText(previous.action, 160),
      revalidationProbe:
        previous
          ?.revalidationProbe
          ?.active === true
          ? {
              version:
                cleanText(
                  previous
                    .revalidationProbe
                    .version,
                  80
                ),
              attemptId:
                cleanText(
                  previous
                    .revalidationProbe
                    .attemptId,
                  160
                ),
              attemptNumber:
                Math.max(
                  1,
                  Number(
                    previous
                      .revalidationProbe
                      .attemptNumber
                  ) || 1
                ),
              reason:
                cleanText(
                  previous
                    .revalidationProbe
                    .reason,
                  160
                ),
              selectedRepresentation:
                cleanText(
                  previous
                    .revalidationProbe
                    .selectedRepresentation,
                  80
                ),
              scope:
                'student-subject-topic-representation',
              descriptiveOnly: true,
              mayChangeMastery: false,
              mayCreateMisconception:
                false,
            }
          : null,
      currentTurnKind:
        cleanText(
          pedagogyPlan.turnKind,
          80
        ),
      currentSignal: {
        confusion:
          reflection.currentSignal
            ?.confusion === true,
        answerAttempt:
          reflection.currentSignal
            ?.answerAttempt === true,
        understandingClaim:
          reflection.currentSignal
            ?.understandingClaim === true,
      },
      mayChangeMastery: false,
      mayCreateMisconception: false,
    },
  };
}

module.exports = {
  DEFAULT_STRATEGY_REVALIDATION_WINDOW_MS,
  OUTCOMES,
  STRATEGY_REVALIDATION_VERSION,
  TEACHING_OUTCOME_VERSION,
  createTeachingOutcomeObservation,
  memoryNumbers,
  normalizeTopicKey,
  selectBoundedRepresentation,
};
