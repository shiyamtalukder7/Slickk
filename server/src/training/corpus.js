const { createHash } = require('node:crypto');

const TRAINING_ELIGIBLE_RIGHTS = new Set([
  'public-domain',
  'open-license',
]);

const TEACHING_TASKS = Object.freeze([
  {
    kind: 'diagnose-prior-knowledge',
    goal: 'Reveal the learner’s prerequisite knowledge before teaching.',
  },
  {
    kind: 'grounded-explanation',
    goal: 'Teach one source-grounded idea clearly and concisely.',
  },
  {
    kind: 'guided-hint',
    goal: 'Protect productive struggle while offering the smallest useful hint.',
  },
  {
    kind: 'misconception-repair',
    goal: 'Contrast a likely misconception with the source-grounded concept.',
  },
  {
    kind: 'reasoning-check',
    goal: 'Ask one question that requires reasoning rather than repetition.',
  },
  {
    kind: 'teach-back',
    goal: 'Require explanation in the learner’s own words.',
  },
  {
    kind: 'transfer',
    goal: 'Apply the concept to a meaningfully different example.',
  },
]);

function digest(value) {
  return createHash('sha256')
    .update(String(value))
    .digest('hex');
}

function isTrainingEligible(source) {
  return (
    TRAINING_ELIGIBLE_RIGHTS.has(source?.rights) &&
    String(source?.content || '').trim().length >= 40
  );
}

function sourceKey(source) {
  return digest(
    [
      source.documentSha256,
      source.page,
      source.chunkIndex,
      String(source.content || '').trim(),
    ].join('|')
  );
}

function splitFor(key, evaluationFraction) {
  const bucket = Number.parseInt(key.slice(0, 8), 16) / 0xffffffff;
  return bucket < evaluationFraction
    ? 'evaluation'
    : 'training';
}

function buildCurriculumTrainingPlan({
  sources = [],
  targetExamples = 1_000_000,
  evaluationFraction = 0.1,
  sourceInventory = [],
}) {
  const target = Math.min(
    1_000_000,
    Math.max(1, Number(targetExamples) || 1_000_000)
  );
  const evalFraction = Math.min(
    0.3,
    Math.max(0.05, Number(evaluationFraction) || 0.1)
  );
  const eligible = new Map();
  const excludedByRights = {};
  const inventoriedRights = new Set();

  for (const item of sourceInventory) {
    if (!item.trainingEligible) {
      const rights = item.rights || 'missing-rights';
      excludedByRights[rights] =
        Number(item.chunkCount) || 0;
      inventoriedRights.add(rights);
    }
  }

  for (const source of sources) {
    if (!isTrainingEligible(source)) {
      const reason = source?.rights || 'missing-rights';
      if (!inventoriedRights.has(reason)) {
        excludedByRights[reason] =
          (excludedByRights[reason] || 0) + 1;
      }
      continue;
    }

    eligible.set(sourceKey(source), source);
  }

  const examples = [];

  for (const [key, source] of eligible) {
    const split = splitFor(key, evalFraction);

    for (const task of TEACHING_TASKS) {
      const id = digest(`${key}|${task.kind}`);
      examples.push({
        schemaVersion: 1,
        id,
        split,
        status: 'awaiting-reviewed-response',
        task,
        learnerContext: {
          curriculum: source.curriculum,
          grade: source.grade,
          subject: source.subject,
          language: source.language,
        },
        source: {
          documentId: source.documentId,
          documentSha256: source.documentSha256,
          title: source.title,
          page: source.page,
          chunkIndex: source.chunkIndex,
          rights: source.rights,
          content: source.content,
        },
        reviewRequirements: {
          educatorReview: true,
          factualGrounding: true,
          ageAppropriateness: true,
          safetyReview: true,
        },
      });
    }
  }

  const trainingCount = examples.filter(
    (item) => item.split === 'training'
  ).length;
  const evaluationCount =
    examples.length - trainingCount;

  return {
    schemaVersion: 1,
    targetExamples: target,
    availableExamples: examples.length,
    shortfall: Math.max(0, target - examples.length),
    uniqueEligibleSources: eligible.size,
    excludedByRights,
    teachingTasks: TEACHING_TASKS.map(
      (task) => task.kind
    ),
    split: {
      training: trainingCount,
      evaluation: evaluationCount,
    },
    readyForWeightTraining: false,
    readinessReason:
      'Every generated response requires educator, grounding, age, and safety review before it can become a training example.',
    examples,
  };
}

module.exports = {
  TEACHING_TASKS,
  TRAINING_ELIGIBLE_RIGHTS,
  buildCurriculumTrainingPlan,
  digest,
  isTrainingEligible,
  sourceKey,
  splitFor,
};
