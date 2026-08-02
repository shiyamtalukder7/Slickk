function normalizedTokens(value) {
  return new Set(
    (
      String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .match(/[\p{L}\p{M}\p{N}]+/gu) || []
    ).filter((token) => token.length > 1)
  );
}

function scoreShortAnswer(answer, expectedAnswer) {
  const actual = normalizedTokens(answer);
  const expected = normalizedTokens(expectedAnswer);

  if (expected.size === 0) {
    return {
      earned: 0,
      possible: 1,
      ratio: 0,
      matchedTerms: [],
    };
  }

  const matchedTerms = [...expected].filter((term) =>
    actual.has(term)
  );
  const ratio = matchedTerms.length / expected.size;

  return {
    earned: Number(ratio.toFixed(4)),
    possible: 1,
    ratio: Number(ratio.toFixed(4)),
    matchedTerms,
  };
}

function scoreAssessment({ assessmentId, responses = [] }) {
  const items = responses.map((response) => ({
    itemId: String(response.itemId || ''),
    ...scoreShortAnswer(
      response.answer,
      response.expectedAnswer
    ),
    sources: Array.isArray(response.sources)
      ? response.sources
      : [],
  }));
  const earned = items.reduce(
    (sum, item) => sum + item.earned,
    0
  );
  const possible = items.reduce(
    (sum, item) => sum + item.possible,
    0
  );

  return {
    assessmentId: String(assessmentId || ''),
    scoredAt: new Date().toISOString(),
    scoringMethod: 'deterministic-term-coverage-v1',
    measured: {
      earned: Number(earned.toFixed(4)),
      possible,
      percentage:
        possible > 0
          ? Number(
              ((earned / possible) * 100).toFixed(2)
            )
          : 0,
      items,
    },
    estimates: {
      mastery: null,
      confidence: null,
      note: 'No model estimate was used for this score.',
    },
  };
}

module.exports = {
  normalizedTokens,
  scoreAssessment,
  scoreShortAnswer,
};
