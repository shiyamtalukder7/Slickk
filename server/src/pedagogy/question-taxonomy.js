const QUESTION_STRATEGIES = Object.freeze({
  diagnose: {
    kind: 'diagnostic-probe',
    cognitiveLevel: 'understand',
    instruction:
      'Ask what the learner already knows with one low-pressure question that reveals their starting model.',
  },
  evaluate: {
    kind: 'reasoning-probe',
    cognitiveLevel: 'analyze',
    instruction:
      'Ask the learner to justify the step or identify where their reasoning changed.',
  },
  scaffold: {
    kind: 'misconception-probe',
    cognitiveLevel: 'understand',
    instruction:
      'Ask one easier contrast or prediction that exposes the smallest mistaken assumption.',
  },
  verify: {
    kind: 'teach-back',
    cognitiveLevel: 'apply',
    instruction:
      'Ask the learner to explain the idea in their own words or apply it to a small new case.',
  },
  remediate: {
    kind: 'guided-retrieval',
    cognitiveLevel: 'apply',
    instruction:
      'Ask for the next reachable step while withholding the remainder of the solution.',
  },
  transfer: {
    kind: 'transfer-challenge',
    cognitiveLevel: 'create',
    instruction:
      'Ask the learner to choose and justify a method in a meaningfully different example.',
  },
  teach: {
    kind: 'concept-check',
    cognitiveLevel: 'apply',
    instruction:
      'Ask one short prediction, comparison, or application that cannot be answered by repeating the explanation.',
  },
});

const SUBJECT_QUESTION_RULES = Object.freeze({
  mathematics:
    'Require a visible calculation, representation, or reason for the chosen operation.',
  science:
    'Prefer prediction, causal explanation, evidence interpretation, or experiment design.',
  language:
    'Prefer meaning in context, learner-produced language, or correction of one useful feature.',
  humanities:
    'Prefer chronology, cause, comparison, perspective, or evidence for a claim.',
  computing:
    'Prefer output prediction, tracing, bug localization, or a focused test.',
  engineering:
    'Prefer assumptions, units, constraints, tradeoffs, or predicted system behavior.',
  health:
    'Prefer mechanism, comparison, or safe academic evidence without personal diagnosis.',
  business:
    'Prefer calculation, classification, incentive, stakeholder, or tradeoff reasoning.',
  law:
    'Prefer issue identification, rule application, changed facts, or evidence-backed reasoning.',
  creative:
    'Prefer intent, technique choice, constraint, reflection, or comparison of alternatives.',
  general:
    'Prefer explanation in the learner’s own words or application to a new example.',
});

function strategyKeyForAction(actionKind) {
  const mapping = {
    'diagnose-prior-knowledge': 'diagnose',
    'evaluate-answer': 'evaluate',
    'scaffold-misconception': 'scaffold',
    'verify-teach-back': 'verify',
    'guided-remediation': 'remediate',
    'independent-transfer': 'transfer',
    'grounded-explanation': 'teach',
  };

  return mapping[actionKind] || 'teach';
}

function chooseQuestionStrategy({
  actionKind,
  subjectFamily = 'general',
}) {
  const key = strategyKeyForAction(actionKind);

  return {
    ...QUESTION_STRATEGIES[key],
    subjectRule:
      SUBJECT_QUESTION_RULES[subjectFamily] ||
      SUBJECT_QUESTION_RULES.general,
    maximumQuestions: 1,
    mustWaitForAnswer: true,
  };
}

module.exports = {
  QUESTION_STRATEGIES,
  SUBJECT_QUESTION_RULES,
  chooseQuestionStrategy,
  strategyKeyForAction,
};
