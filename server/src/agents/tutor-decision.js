const POLICY_VERSION = 'educational-agent-policy-v1';
const {
  chooseQuestionStrategy,
} = require('../pedagogy/question-taxonomy');

const ACTIONS = Object.freeze({
  diagnose: {
    kind: 'diagnose-prior-knowledge',
    instruction:
      'Ask one small diagnostic question before teaching or increasing difficulty.',
    difficultyDelta: 0,
    requiresLearnerEvidence: true,
  },
  evaluate: {
    kind: 'evaluate-answer',
    instruction:
      'Evaluate the exact answer, preserve correct reasoning, repair only the smallest error, then request one next step.',
    difficultyDelta: 0,
    requiresLearnerEvidence: true,
  },
  scaffold: {
    kind: 'scaffold-misconception',
    instruction:
      'Reduce the step size, address the most relevant misconception, give one hint, then ask an easier checking question.',
    difficultyDelta: -1,
    requiresLearnerEvidence: true,
  },
  verify: {
    kind: 'verify-teach-back',
    instruction:
      'Require the learner to explain or apply the idea in a new case before accepting mastery.',
    difficultyDelta: 0,
    requiresLearnerEvidence: true,
  },
  remediate: {
    kind: 'guided-remediation',
    instruction:
      'Reconnect the weak skill to prior knowledge, model one step, then let the learner complete the next step.',
    difficultyDelta: -1,
    requiresLearnerEvidence: true,
  },
  transfer: {
    kind: 'independent-transfer',
    instruction:
      'Use a slightly different application and ask the learner to justify the method independently.',
    difficultyDelta: 1,
    requiresLearnerEvidence: true,
  },
  teach: {
    kind: 'grounded-explanation',
    instruction:
      'Teach one essential idea with one appropriate example, then ask one evidence-producing check.',
    difficultyDelta: 0,
    requiresLearnerEvidence: true,
  },
});

function bounded(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.min(1, Math.max(0, number))
    : fallback;
}

function learnerStateFrom(plan) {
  const subject = plan.relevantMemory?.subject || {};
  const evidenceCount = Math.max(
    0,
    Number(subject.masteryEvidence) || 0
  );
  const mastery = bounded(subject.masteryScore, 0.25);
  const uncertainty = Number(
    Math.max(
      0.1,
      Math.min(
        1,
        1 - Math.min(0.9, evidenceCount / 10) +
          (plan.signals?.confusion ? 0.1 : 0)
      )
    ).toFixed(3)
  );

  return {
    mastery,
    masteryLevel:
      subject.masteryLevel || 'insufficient_evidence',
    evidenceCount,
    uncertainty,
    activeMisconceptions:
      plan.relevantMemory?.activeMisconceptions?.length || 0,
  };
}

function selectAction(plan, learnerState) {
  if (plan.signals?.answerAttempt) {
    return ACTIONS.evaluate;
  }

  if (plan.signals?.understandingClaim) {
    return ACTIONS.verify;
  }

  if (
    plan.signals?.confusion ||
    learnerState.activeMisconceptions > 0
  ) {
    return ACTIONS.scaffold;
  }

  if (learnerState.evidenceCount < 2) {
    return ACTIONS.diagnose;
  }

  if (learnerState.mastery < 0.45) {
    return ACTIONS.remediate;
  }

  if (learnerState.mastery >= 0.88) {
    return ACTIONS.transfer;
  }

  return ACTIONS.teach;
}

function lessonRoadmap(actionKind, topic, sessionAdaptation = null) {
  const phases = [
    { key: 'diagnose', label: 'Find your starting point' },
    { key: 'learn', label: 'Build the idea' },
    { key: 'practice', label: 'Practise with guidance' },
    { key: 'teach-back', label: 'Explain it yourself' },
    { key: 'transfer', label: 'Use it in a new problem' },
  ];
  const phaseByAction = {
    'diagnose-prior-knowledge': 0,
    'grounded-explanation': 1,
    'scaffold-misconception': 1,
    'guided-remediation': 2,
    'evaluate-answer': 2,
    'verify-teach-back': 3,
    'independent-transfer': 4,
  };
  const currentIndex = phaseByAction[actionKind] ?? 0;
  return {
    title: `Master ${topic}`,
    currentIndex,
    phases: phases.map((phase, index) => ({ ...phase, status: index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming' })),
    successCriterion: 'Explain the idea in your own words and solve a different example without a hint.',
    sessionMinutes: Number(sessionAdaptation?.sessionMinutes) || 20,
    pace: sessionAdaptation?.pace || 'standard',
  };
}

function createTutorDecision({
  pedagogyPlan,
  curriculumEvidence = [],
}) {
  const learnerState = learnerStateFrom(pedagogyPlan);
  const action = selectAction(
    pedagogyPlan,
    learnerState
  );
  const questionStrategy = chooseQuestionStrategy({
    actionKind: action.kind,
    subjectFamily: pedagogyPlan.subjectFamily,
  });
  const grounded = curriculumEvidence.length > 0;
  const topic =
    pedagogyPlan.relevantMemory?.subject?.lastTopic ||
    pedagogyPlan.subject;

  return {
    policyVersion: POLICY_VERSION,
    decisionSource:
      'deterministic-policy-with-bayesian-mastery-state',
    objective: `Improve independently demonstrated understanding of ${topic}.`,
    learnerState,
    action: {
      ...action,
      supportLevel: pedagogyPlan.supportLevel,
    },
    lessonRoadmap: lessonRoadmap(action.kind, topic, pedagogyPlan.sessionAdaptation),
    questionStrategy,
    grounding: {
      status: grounded
        ? 'curriculum-evidence-available'
        : 'curriculum-evidence-unavailable',
      sourceCount: curriculumEvidence.length,
      rule: grounded
        ? 'Use the supplied curriculum evidence for curriculum-specific claims.'
        : 'Do not imply textbook verification; state uncertainty when exact curriculum facts are unavailable.',
    },
    permittedTools: [
      'curriculum-search',
      ...(pedagogyPlan.subjectFamily === 'mathematics'
        ? ['calculator']
        : []),
    ],
    verification: {
      required: action.requiresLearnerEvidence,
      acceptedEvidence: [
        'correct answer with reasoning',
        'successful teach-back',
        'correct transfer to a new example',
      ],
      rejectedEvidence: [
        'confidence alone',
        'praise',
        'a simple yes',
      ],
      stopCondition:
        'End after one evidence-producing question and wait for the learner.',
    },
    autonomy: {
      maximumTeachingActions: 1,
      mayChangeLearnerRecord: false,
      mayDeclareMastery: false,
      requiresHumanApprovalForConsequentialActions: true,
    },
  };
}

module.exports = {
  ACTIONS,
  POLICY_VERSION,
  createTutorDecision,
  learnerStateFrom,
  lessonRoadmap,
  selectAction,
};
