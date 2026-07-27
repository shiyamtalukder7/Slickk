const DEFAULT_BKT_PARAMETERS = Object.freeze({
  initialMastery: 0.25,
  learnRate: 0.12,
  guessRate: 0.2,
  slipRate: 0.1,
});

function probability(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(0.999, Math.max(0.001, parsed));
}

function updateMastery(
  previousMastery,
  observation,
  parameters = DEFAULT_BKT_PARAMETERS
) {
  if (!['correct', 'incorrect'].includes(observation)) {
    throw new TypeError(
      'Mastery requires verified correct or incorrect evidence.'
    );
  }

  const prior = probability(
    previousMastery,
    parameters.initialMastery
  );
  const learnRate = probability(
    parameters.learnRate,
    DEFAULT_BKT_PARAMETERS.learnRate
  );
  const guessRate = probability(
    parameters.guessRate,
    DEFAULT_BKT_PARAMETERS.guessRate
  );
  const slipRate = probability(
    parameters.slipRate,
    DEFAULT_BKT_PARAMETERS.slipRate
  );
  const likelihoodKnown =
    observation === 'correct'
      ? 1 - slipRate
      : slipRate;
  const likelihoodUnknown =
    observation === 'correct'
      ? guessRate
      : 1 - guessRate;
  const evidence =
    prior * likelihoodKnown +
    (1 - prior) * likelihoodUnknown;
  const posterior =
    (prior * likelihoodKnown) / evidence;
  const learnedAfterAttempt =
    posterior + (1 - posterior) * learnRate;

  return Number(
    Math.min(0.999, learnedAfterAttempt).toFixed(4)
  );
}

function masteryLevel(score, evidenceCount = 0) {
  const mastery = probability(
    score,
    DEFAULT_BKT_PARAMETERS.initialMastery
  );

  if (evidenceCount < 2) {
    return 'insufficient_evidence';
  }

  if (mastery < 0.45) {
    return 'needs_support';
  }

  if (mastery < 0.7) {
    return 'developing';
  }

  if (mastery < 0.88) {
    return 'strong';
  }

  return 'mastered';
}

function nextReviewDate(
  score,
  observation,
  fromDate = new Date()
) {
  const mastery = probability(
    score,
    DEFAULT_BKT_PARAMETERS.initialMastery
  );
  const days =
    observation === 'incorrect'
      ? 0
      : mastery < 0.45
        ? 1
        : mastery < 0.7
          ? 3
          : mastery < 0.88
            ? 7
            : 14;
  const nextReview = new Date(fromDate);

  nextReview.setUTCDate(
    nextReview.getUTCDate() + days
  );

  return nextReview.toISOString();
}

module.exports = {
  DEFAULT_BKT_PARAMETERS,
  masteryLevel,
  nextReviewDate,
  updateMastery,
};
