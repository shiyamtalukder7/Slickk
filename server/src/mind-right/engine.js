const MIND_RIGHT_VERSION = 'mind-right-v1';
const MIND_RIGHT_METHOD = 'Mind Right Teaching Method';

const MIND_STATES = Object.freeze({
  clarify: 'context-clarification',
  evaluate: 'active-answer-evaluation',
  repair: 'smallest-gap-repair',
  recover: 'confusion-and-overload-recovery',
  verify: 'understanding-verification',
  construct: 'concept-construction',
  foundation: 'foundation-reconstruction',
  apply: 'guided-application',
  transfer: 'independent-transfer',
  material: 'verified-material-reasoning',
  uncertainty: 'uncertainty-management',
});

const ACTIONS = Object.freeze({
  clarify: {
    kind: 'clarify-intent',
    purpose:
      'Discover what the student message refers to without inventing a topic, answer, or upload.',
    requiredStructure: [
      'reflect the ambiguous input briefly',
      'ask exactly one clarifying question',
      'stop and wait',
    ],
    forbidden: [
      'beginning a lesson',
      'inferring a misconception',
      'updating subject progress',
      'changing mastery',
    ],
  },
  evaluate: {
    kind: 'evaluate-current-thinking',
    purpose:
      'Evaluate the student exact answer before introducing any new explanation.',
    requiredStructure: [
      'state whether the answer is correct, partly correct, or not yet correct',
      'explain the smallest decisive reason',
      'ask for one next step or transfer check',
    ],
    forbidden: [
      'generic praise without a reason',
      'changing the topic',
      'starting a new lecture before evaluation',
    ],
  },
  repair: {
    kind: 'repair-smallest-gap',
    purpose:
      'Preserve correct thinking and repair only the smallest missing or incorrect connection.',
    requiredStructure: [
      'name what is already correct',
      'identify one exact gap',
      'supply one bridge, hint, representation, or example',
      'ask one easier evidence-producing question',
    ],
    forbidden: [
      'overloading the student',
      'restarting the entire subject unnecessarily',
      'declaring a misconception without evidence',
    ],
  },
  recover: {
    kind: 'reduce-load-and-represent-again',
    purpose:
      'Reduce cognitive load and rebuild the idea through a clearer representation.',
    requiredStructure: [
      'acknowledge the exact point of difficulty',
      'reduce the step size',
      'change representation or example',
      'ask one very small check',
    ],
    forbidden: [
      'repeating the same explanation unchanged',
      'adding multiple new ideas',
      'shaming the student',
    ],
  },
  verify: {
    kind: 'verify-understanding',
    purpose:
      'Require evidence that the learner can explain or use the idea independently.',
    requiredStructure: [
      'avoid accepting confidence alone',
      'request a teach-back or changed example',
      'wait for independent evidence',
    ],
    forbidden: [
      'declaring mastery from yes, confidence, or praise',
      'giving away the verification answer',
    ],
  },
  construct: {
    kind: 'build-mental-connection',
    purpose:
      'Construct one useful connection between meaning, a concrete example, and the formal idea.',
    requiredStructure: [
      'state the core meaning',
      'give one concrete or familiar example',
      'connect the example to the formal idea',
      'ask one evidence-producing question',
    ],
    forbidden: [
      'generic offers to help',
      'multiple unrelated examples',
      'long lectures',
      'more than one question',
    ],
  },
  foundation: {
    kind: 'rebuild-required-foundation',
    purpose:
      'Teach the smallest prerequisite needed for the current objective.',
    requiredStructure: [
      'identify the prerequisite',
      'connect it to prior knowledge',
      'model one step',
      'ask the learner to complete one step',
    ],
    forbidden: [
      'lowering the final learning objective',
      'teaching unrelated background',
    ],
  },
  apply: {
    kind: 'guided-application',
    purpose:
      'Let the learner perform the next useful cognitive step with minimal support.',
    requiredStructure: [
      'give only the minimum useful support',
      'ask for one action',
      'wait for the learner response',
    ],
    forbidden: [
      'performing every step for the learner',
      'asking several questions at once',
    ],
  },
  transfer: {
    kind: 'independent-transfer',
    purpose:
      'Test whether understanding survives a changed example or unfamiliar context.',
    requiredStructure: [
      'change one important feature of the example',
      'request independent reasoning',
      'require justification',
    ],
    forbidden: [
      'declaring mastery before evidence',
      'reusing the identical example',
    ],
  },
  material: {
    kind: 'reason-from-verified-material',
    purpose:
      'Use only verified material context and connect the student response to that source.',
    requiredStructure: [
      'use the verified source context',
      'separate source evidence from inference',
      'ask one source-grounded check',
    ],
    forbidden: [
      'inventing upload contents',
      'using claimed but unverified material',
    ],
  },
  uncertainty: {
    kind: 'retrieve-or-state-uncertainty',
    purpose:
      'Avoid invention when reliable knowledge or exact curriculum evidence is unavailable.',
    requiredStructure: [
      'state what is known',
      'state what is not verified',
      'retrieve evidence or ask for the missing context',
    ],
    forbidden: [
      'fabricating facts, citations, books, pages, or certainty',
    ],
  },
});

function bounded(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(1, Math.max(0, number))
    : fallback;
}

function learnerStateFrom(plan = {}) {
  const subject = plan.relevantMemory?.subject || {};
  const evidenceCount = Math.max(
    0,
    Number(subject.masteryEvidence) || 0
  );
  const mastery = bounded(subject.masteryScore, 0.25);
  const activeMisconceptions =
    (
      plan.relevantMemory
        ?.activeMisconceptions || []
    ).filter(
      (item) =>
        item?.verified === true ||
        String(item?.correction || '').trim()
    ).length;

  return {
    mastery,
    masteryLevel:
      subject.masteryLevel || 'insufficient_evidence',
    evidenceCount,
    activeMisconceptions,
    supportLevel:
      Math.max(0, Number(plan.supportLevel) || 0),
    uncertainty: Number(
      Math.max(
        0.1,
        Math.min(
          1,
          1 -
            Math.min(0.9, evidenceCount / 10) +
            (plan.signals?.confusion ? 0.1 : 0)
        )
      ).toFixed(3)
    ),
  };
}

function inferMindState({
  pedagogyPlan = {},
  curriculumEvidence = [],
}) {
  const learnerState = learnerStateFrom(pedagogyPlan);

  if (
    pedagogyPlan.needsClarification ||
    pedagogyPlan.turnKind === 'clarification'
  ) {
    return {
      key: MIND_STATES.clarify,
      action: ACTIONS.clarify,
      reason:
        'The student message does not contain enough verified context.',
      learnerState,
    };
  }

  if (pedagogyPlan.verifiedMaterialContext) {
    return {
      key: MIND_STATES.material,
      action: ACTIONS.material,
      reason:
        'Verified material context is available for this turn.',
      learnerState,
    };
  }

  if (pedagogyPlan.signals?.answerAttempt) {
    return {
      key: MIND_STATES.evaluate,
      action: ACTIONS.evaluate,
      reason:
        'The student is responding to an active question or verified material.',
      learnerState,
    };
  }

  if (pedagogyPlan.signals?.understandingClaim) {
    return {
      key: MIND_STATES.verify,
      action: ACTIONS.verify,
      reason:
        'Understanding was claimed but still requires independent evidence.',
      learnerState,
    };
  }

  if (pedagogyPlan.signals?.confusion) {
    return {
      key: MIND_STATES.recover,
      action: ACTIONS.recover,
      reason:
        'The student explicitly reported confusion or overload.',
      learnerState,
    };
  }

  if (
    pedagogyPlan.turnKind ===
      'practice_request' ||
    pedagogyPlan.signals?.practiceRequest
  ) {
    return {
      key: MIND_STATES.apply,
      action: ACTIONS.apply,
      reason:
        'The student explicitly requested one practice question.',
      learnerState,
    };
  }

  if (
    pedagogyPlan.turnKind === 'new_topic' ||
    pedagogyPlan.turnKind === 'question'
  ) {
    return {
      key: MIND_STATES.construct,
      action: ACTIONS.construct,
      reason:
        'The student requested a concept or explanation.',
      learnerState,
    };
  }

  if (learnerState.activeMisconceptions > 0) {
    return {
      key: MIND_STATES.repair,
      action: ACTIONS.repair,
      reason:
        'A previously evidenced misconception is relevant.',
      learnerState,
    };
  }

  if (learnerState.evidenceCount < 2) {
    return {
      key: MIND_STATES.foundation,
      action: ACTIONS.foundation,
      reason:
        'There is not yet enough evidence about the required foundation.',
      learnerState,
    };
  }

  if (learnerState.mastery >= 0.88) {
    return {
      key: MIND_STATES.transfer,
      action: ACTIONS.transfer,
      reason:
        'Strong prior evidence supports an independent transfer check.',
      learnerState,
    };
  }

  if (learnerState.mastery < 0.45) {
    return {
      key: MIND_STATES.foundation,
      action: ACTIONS.foundation,
      reason:
        'Existing evidence shows that a prerequisite connection needs rebuilding.',
      learnerState,
    };
  }

  return {
    key: MIND_STATES.apply,
    action: ACTIONS.apply,
    reason:
      curriculumEvidence.length > 0
        ? 'The learner is ready to apply verified knowledge.'
        : 'The learner is ready for guided application.',
    learnerState,
  };
}

function objectiveFor(pedagogyPlan, mindState) {
  const topic =
    pedagogyPlan.focusTopic ||
    pedagogyPlan.subject ||
    pedagogyPlan.relevantMemory?.subject?.lastTopic ||
    'the current idea';

  if (mindState.key === MIND_STATES.clarify) {
    return (
      'Resolve the meaning of the current student ' +
      'message without inventing context.'
    );
  }

  return (
    'Improve independently demonstrated ' +
    `understanding of ${topic}.`
  );
}

function learningTwinPolicyFor(mindState, pedagogyPlan) {
  if (mindState.key === MIND_STATES.clarify) {
    return {
      persistLearning: false,
      mayChangeMastery: false,
      mayCreateMisconception: false,
      topic: 'Clarifying the question',
      skill: 'Providing enough context',
      nextAction: 'Clarify what the message refers to.',
      confidence: 1,
      masteryDelta: 0,
    };
  }

  const skillByState = {
    [MIND_STATES.evaluate]:
      'Evaluating current thinking',
    [MIND_STATES.repair]:
      'Repairing one knowledge gap',
    [MIND_STATES.recover]:
      'Rebuilding understanding',
    [MIND_STATES.verify]:
      'Demonstrating understanding',
    [MIND_STATES.construct]:
      'Building a mental connection',
    [MIND_STATES.foundation]:
      'Establishing foundations',
    [MIND_STATES.apply]:
      'Applying the idea',
    [MIND_STATES.transfer]:
      'Independent transfer',
    [MIND_STATES.material]:
      'Reasoning from verified material',
    [MIND_STATES.uncertainty]:
      'Managing uncertainty',
  };

  return {
    persistLearning: true,
    mayChangeMastery: false,
    mayCreateMisconception: false,
    topic:
      pedagogyPlan.focusTopic ||
      pedagogyPlan.subject ||
      pedagogyPlan.relevantMemory?.subject?.lastTopic ||
      'Current learning conversation',
    skill:
      skillByState[mindState.key] ||
      'Guided reasoning',
    nextAction:
      mindState.action.requiredStructure.at(-1),
    confidence: 0.35,
    masteryDelta: 0,
  };
}

function createMindRightDecision({
  pedagogyPlan,
  curriculumEvidence = [],
}) {
  const mindState = inferMindState({
    pedagogyPlan,
    curriculumEvidence,
  });
  const grounded = curriculumEvidence.length > 0;

  return {
    version: MIND_RIGHT_VERSION,
    system: 'Universal Perfect Teacher Brain',
    method: MIND_RIGHT_METHOD,
    decisionSource:
      'deterministic-mind-state-and-evidence-policy',
    objective: objectiveFor(pedagogyPlan, mindState),
    mindState: {
      key: mindState.key,
      reason: mindState.reason,
      learnerState: mindState.learnerState,
    },
    teachingAction: {
      ...mindState.action,
      maximumActions: 1,
      supportLevel: mindState.learnerState.supportLevel,
    },
    knowledgeHandling: {
      universalBookStatus: grounded
        ? 'verified-memory-available'
        : 'verified-memory-not-supplied',
      sourceCount: curriculumEvidence.length,
      rule: grounded
        ? (
            'Use supplied verified evidence for ' +
            'source-specific claims.'
          )
        : (
            'Do not imply source verification. State ' +
            'uncertainty when exact facts cannot be verified.'
          ),
    },
    evidencePolicy: {
      required:
        mindState.key !== MIND_STATES.clarify,
      acceptedEvidence: [
        'correct answer with decisive reasoning',
        'successful teach-back',
        'correct application in a changed example',
      ],
      rejectedEvidence: [
        'confidence alone',
        'praise',
        'a simple yes',
        'model inference without learner evidence',
      ],
      mayDeclareMastery: false,
    },
    stopCondition:
      'Complete one teaching action, ask at most one ' +
      'evidence-producing question, then stop and wait.',
    learningTwinPolicy:
      learningTwinPolicyFor(mindState, pedagogyPlan),
    autonomy: {
      maximumTeachingActions: 1,
      mayChangeLearnerRecord:
        mindState.key !== MIND_STATES.clarify,
      mayDeclareMastery: false,
      requiresHumanApprovalForConsequentialActions: true,
    },
  };
}

function shouldPersistLearning(decision) {
  return (
    decision?.learningTwinPolicy?.persistLearning !== false
  );
}

module.exports = {
  ACTIONS,
  MIND_RIGHT_METHOD,
  MIND_RIGHT_VERSION,
  MIND_STATES,
  createMindRightDecision,
  inferMindState,
  learnerStateFrom,
  shouldPersistLearning,
};
