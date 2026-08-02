function bounded(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.min(1, Math.max(0, number))
    : fallback;
}

function rankLearningActions({
  skills = [],
  now = new Date(),
  limit = 5,
}) {
  const currentTime = new Date(now).getTime();

  return skills
    .map((skill) => {
      const mastery = bounded(skill.mastery, 0.25);
      const uncertainty = bounded(
        skill.uncertainty,
        0.5
      );
      const reviewTime = Date.parse(
        skill.nextReviewAt || ''
      );
      const overdue =
        Number.isFinite(reviewTime) &&
        reviewTime <= currentTime
          ? 1
          : 0;
      const misconception = skill.hasMisconception
        ? 1
        : 0;
      const score =
        (1 - mastery) * 0.45 +
        uncertainty * 0.2 +
        overdue * 0.2 +
        misconception * 0.15;
      const reasons = [];

      if (mastery < 0.45) {
        reasons.push('verified mastery needs support');
      }
      if (overdue) {
        reasons.push('review is due');
      }
      if (misconception) {
        reasons.push('a recurring misconception is active');
      }
      if (uncertainty >= 0.5) {
        reasons.push('more evidence will reduce uncertainty');
      }

      return {
        skillId: String(skill.skillId || ''),
        subject: String(skill.subject || 'General'),
        action:
          misconception || mastery < 0.45
            ? 'guided-practice'
            : overdue
              ? 'spaced-review'
              : 'short-check',
        score: Number(score.toFixed(4)),
        reasons,
        evidenceCount: Math.max(
          0,
          Number(skill.evidenceCount) || 0
        ),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.skillId.localeCompare(right.skillId)
    )
    .slice(0, Math.min(20, Math.max(1, limit)));
}

function recommendationComparison(input) {
  const baseline = rankLearningActions(input);

  return {
    baseline: {
      policy: 'deterministic-learning-priority-v1',
      recommendations: baseline,
    },
    candidate: null,
    decision: 'baseline',
    note:
      'No adaptive model may replace the baseline until controlled evaluation passes.',
  };
}

module.exports = {
  rankLearningActions,
  recommendationComparison,
};
