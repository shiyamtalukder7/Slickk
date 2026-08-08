const {
  questionCount,
  wordCount,
} = require('../auditing/response-shape');
const {
  auditReflectiveReply,
  reflectionRepairInstruction,
  reflectiveFallbackReply,
} = require('../reflection/engine');

const MINDFULNESS_VERSION = 'mindfulness-v1';

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function bounded(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.min(1, Math.max(0, number))
    : fallback;
}

function intentConfidence(plan = {}) {
  if (
    plan.needsClarification ||
    plan.turnKind === 'clarification'
  ) {
    return 0.45;
  }

  if (
    plan.signals?.answerAttempt &&
    plan.activeQuestion
  ) {
    return 1;
  }

  if (
    plan.turnKind === 'practice_request' ||
    plan.signals?.practiceRequest
  ) {
    return 1;
  }

  if (
    plan.turnKind === 'new_topic' ||
    plan.turnKind === 'question' ||
    plan.signals?.confusion ||
    plan.signals?.understandingClaim
  ) {
    return 0.85;
  }

  return 0.65;
}

function createMindfulnessState({
  requestData = {},
  history = [],
  learnerProfile = {},
  pedagogyPlan = requestData.pedagogyPlan || {},
  curriculumEvidence = requestData.curriculumEvidence || [],
} = {}) {
  const plan = pedagogyPlan || {};
  const decision = plan.decision || {};
  const action =
    decision.teachingAction || {};
  const sourceCount =
    Array.isArray(curriculumEvidence)
      ? curriculumEvidence.length
      : 0;
  const verifiedMaterial =
    plan.verifiedMaterialContext === true;
  const answerContext =
    plan.signals?.answerAttempt === true &&
    Boolean(cleanText(plan.activeQuestion));
  const clarification =
    plan.needsClarification === true ||
    plan.turnKind === 'clarification';
  const expectedTopic =
    cleanText(
      plan.focusTopic ||
      plan.subject ||
      plan.relevantMemory?.subject?.lastTopic
    ) || 'Current learning conversation';
  const learnerEvidence =
    Number(
      plan.relevantMemory?.subject
        ?.masteryEvidence
    ) || 0;

  return {
    version: MINDFULNESS_VERSION,
    system: 'Slickk Mindfulness',
    purpose:
      'Metacognitive control for intent, evidence, provenance, response fit, persistence, and self-correction.',
    intent: {
      turnKind:
        plan.turnKind || 'continuation',
      actionKind:
        action.kind || 'guided-application',
      expectedTopic,
      confidence:
        intentConfidence(plan),
      mustClarify:
        clarification,
      mustEvaluateCurrentAnswer:
        answerContext,
      activeQuestion:
        cleanText(plan.activeQuestion),
    },
    knowledge: {
      status:
        sourceCount > 0
          ? 'verified-curriculum-evidence'
          : verifiedMaterial
            ? 'verified-material-context'
            : 'general-knowledge-not-source-verified',
      sourceCount,
      verifiedMaterial,
      mayClaimSourceVerification:
        sourceCount > 0 ||
        verifiedMaterial,
    },
    learnerEvidence: {
      existingVerifiedCount:
        Math.max(0, learnerEvidence),
      currentTurn:
        answerContext
          ? 'pending-evaluation'
          : plan.signals?.understandingClaim
            ? 'claim-only'
            : 'not-yet-produced',
      masteryMayChangeOnlyFromVerifiedEvidence:
        true,
    },
    provenance: {
      allowed: [
        'current-student-message',
        'active-tutor-question',
        'verified-conversation-history',
        ...(sourceCount > 0
          ? ['verified-curriculum-evidence']
          : []),
        ...(verifiedMaterial
          ? ['verified-material-context']
          : []),
      ],
      forbidInventedPast:
        true,
      forbidUnverifiedSourceClaims:
        sourceCount === 0 &&
        !verifiedMaterial,
    },
    responseFit: {
      channel:
        requestData.channel || 'typed',
      maximumQuestions: 1,
      maximumWords:
        requestData.channel === 'live'
          ? 70
          : 800,
      mustStayOnExpectedTopic:
        Boolean(expectedTopic),
      mustStopAfterCheckingQuestion:
        true,
    },
    selfCorrection: {
      auditBeforeRelease: true,
      maximumDrafts: 2,
      failClosed: true,
    },
    persistence: {
      allowLearningTurn:
        !clarification,
      allowAssessmentEvidence:
        answerContext,
      allowMisconceptionCreation:
        false,
      reason:
        clarification
          ? 'Intent is unresolved.'
          : answerContext
            ? 'A current answer can create evidence only after deterministic or verified evaluation.'
            : 'The turn may update descriptive learning context but not mastery.',
    },
    history: {
      suppliedTurns:
        Array.isArray(history)
          ? history.length
          : 0,
      learnerProfileAvailable:
        Boolean(learnerProfile),
    },
  };
}

function historyText(history = []) {
  return cleanText(
    (history || [])
      .map(
        (item) =>
          item?.text ||
          item?.content ||
          ''
      )
      .join(' ')
  );
}

function unsupportedPastClaim(
  reply,
  history = []
) {
  const text = cleanText(reply);
  const claim =
    /\b(?:yesterday|last time|earlier you|you previously|we discussed before|in class yesterday|as we learned before)\b/i.exec(
      text
    );

  if (!claim) {
    return false;
  }

  return !historyText(history)
    .toLowerCase()
    .includes(claim[0].toLowerCase());
}

function containsUnverifiedSourceClaim(reply) {
  const text = cleanText(reply);
  const attributedSourceClaim =
    /\baccording to\s+(?:(?:page|chapter)\s+\d+(?:\s+of\s+(?:your|the)\s+(?:textbook|book|worksheet|syllabus))?|(?:your|the)\s+(?:textbook|book|uploaded file|upload|worksheet|syllabus|chapter|page)(?:\s+\d+)?)\b/i;
  const namedSourceClaim =
    /\b(?:your|the)\s+(?:textbook|book|uploaded file|upload|worksheet|syllabus|chapter|page)(?:\s+\d+)?\s+(?:says|states|shows|explains|describes|teaches|defines|confirms)\b/i;
  const numberedSourceClaim =
    /\b(?:page|chapter)\s+\d+(?:\s+of\s+(?:your|the)\s+(?:textbook|book|worksheet|syllabus))?\s+(?:says|states|shows|explains|describes|teaches|defines|confirms)\b/i;

  return (
    attributedSourceClaim.test(text) ||
    namedSourceClaim.test(text) ||
    numberedSourceClaim.test(text)
  );
}

function containsMasteryOverclaim(reply) {
  return /\b(?:you have mastered|you mastered|you fully understand|you clearly understand|you know this perfectly|complete mastery)\b/i.test(
    cleanText(reply)
  );
}

function containsInternalControlLeak(reply) {
  return /\b(?:MINDFULNESS_STATE_DATA|MIND_RIGHT_DECISION_DATA|PEDAGOGY_PLAN_DATA|learner memory|mind state|runtime policy|hidden reasoning)\b/i.test(
    cleanText(reply)
  );
}

function containsStrongTopicRedirect(
  reply,
  expectedTopic
) {
  const text = cleanText(reply);
  const expected =
    cleanText(expectedTopic).toLowerCase();
  const redirect =
    /\b(?:define|explain|let(?:'s| us)\s+(?:study|learn|discuss))\s+(?:a\s+|the\s+)?(fraction|algebra|photosynthesis|grammar|history)\b/i.exec(
      text
    );

  return Boolean(
    redirect &&
    !expected.includes(
      redirect[1].toLowerCase()
    )
  );
}

function auditMindfulReply(
  reply,
  requestData = {},
  history = []
) {
  const text = cleanText(reply);
  const state =
    requestData.mindfulness ||
    createMindfulnessState({
      requestData,
      history,
      pedagogyPlan:
        requestData.pedagogyPlan || {},
      curriculumEvidence:
        requestData.curriculumEvidence || [],
    });
  const issues = [];
  const reflectionAudit =
    auditReflectiveReply(
      text,
      requestData,
      history
    );

  for (
    const issue of
      reflectionAudit.issues
  ) {
    issues.push(issue);
  }

  const questions = questionCount(text);
  const words = wordCount(text);
  const expectedTopic =
    state.intent?.expectedTopic ||
    requestData.pedagogyPlan?.focusTopic ||
    requestData.pedagogyPlan?.subject ||
    '';

  if (!text) {
    issues.push('EMPTY_RESPONSE');
  }

  if (containsInternalControlLeak(text)) {
    issues.push('INTERNAL_CONTROL_LEAK');
  }

  if (
    state.provenance
      ?.forbidInventedPast &&
    unsupportedPastClaim(text, history)
  ) {
    issues.push('UNSUPPORTED_PAST_CONTEXT');
  }

  if (
    state.provenance
      ?.forbidUnverifiedSourceClaims &&
    containsUnverifiedSourceClaim(text)
  ) {
    issues.push('UNVERIFIED_SOURCE_CLAIM');
  }

  if (
    containsMasteryOverclaim(text) &&
    !(
      state.persistence
        ?.allowAssessmentEvidence &&
      requestData.pedagogyPlan
        ?.signals?.answerAttempt
    )
  ) {
    issues.push('LEARNING_EVIDENCE_OVERCLAIM');
  }

  if (
    state.intent
      ?.mustClarify &&
    questions !== 1
  ) {
    issues.push('INTENT_REQUIRES_ONE_CLARIFICATION');
  }

  if (
    state.intent
      ?.mustEvaluateCurrentAnswer &&
    !/\b(?:correct|right|partly|not yet|incorrect|mistake|close)\b/i.test(
      text
    )
  ) {
    issues.push('CURRENT_ANSWER_NOT_EVALUATED');
  }

  if (
    state.responseFit
      ?.mustStayOnExpectedTopic &&
    containsStrongTopicRedirect(
      text,
      expectedTopic
    )
  ) {
    issues.push('TOPIC_DRIFT');
  }

  const maximumQuestions =
    Math.max(
      0,
      Number(
        state.responseFit
          ?.maximumQuestions
      ) || 1
    );

  if (questions > maximumQuestions) {
    issues.push('TOO_MANY_QUESTIONS');
  }

  const maximumWords =
    Math.max(
      1,
      Number(
        state.responseFit
          ?.maximumWords
      ) || 800
    );

  if (words > maximumWords) {
    issues.push('RESPONSE_TOO_LONG_FOR_CHANNEL');
  }

  return {
    ok: issues.length === 0,
    version: MINDFULNESS_VERSION,
    expectedTopic,
    questions,
    words,
    issues,
    reflection: reflectionAudit,
    checks: {
      intent: true,
      evidence: true,
      provenance: true,
      responseFit: true,
      selfCorrection: true,
      reflection: true,
    },
  };
}

function mindfulnessRepairInstruction(
  requestData,
  audit
) {
  const state =
    requestData.mindfulness ||
    createMindfulnessState({
      requestData,
      pedagogyPlan:
        requestData.pedagogyPlan || {},
      curriculumEvidence:
        requestData.curriculumEvidence || [],
    });

  return [
    'Your previous draft failed the Slickk Mindfulness audit.',
    `Current intent: ${state.intent?.turnKind || 'unknown'}.`,
    `Selected action: ${state.intent?.actionKind || 'unknown'}.`,
    `Expected topic: ${state.intent?.expectedTopic || 'current topic'}.`,
    `Knowledge status: ${state.knowledge?.status || 'unverified'}.`,
    `Detected issues: ${JSON.stringify(audit?.issues || [])}.`,
    'Rebuild the answer from the current student message and verified context only.',
    'Do not invent a past lesson, source, upload, page, mastery claim, or unrelated topic.',
    'Match the student level, ask at most one question, and stop after that question.',
    reflectionRepairInstruction(
      requestData,
      audit?.reflection || audit
    ),
    'Never mention the Mindfulness audit or any internal control state.',
  ].join('\n');
}

function mindfulnessFallbackReply(
  requestData = {}
) {
  const language =
    cleanText(requestData.language).toLowerCase();
  const message = cleanText(requestData.message);
  const sourceRequested =
    /\b(?:page\s+\d+|textbook|book|uploaded file|upload|worksheet|syllabus|chapter)\b/i.test(
      message
    );
  const pageMatch =
    /\bpage\s+(\d+)\b/i.exec(message);
  const sourceLabel = pageMatch
    ? `page ${pageMatch[1]}`
    : 'the requested source';

  if (sourceRequested) {
    if (language.includes('bangla')) {
      return (
        `${sourceLabel} এর যাচাইকৃত কপি আমার কাছে নেই, ` +
        'তাই ওই উৎসে কী লেখা আছে তা আমি নিশ্চিত করে বলতে পারি না। ' +
        'পাতাটির ছবি বা ফাইল আপলোড করবে?'
      );
    }

    if (language.includes('banglish')) {
      return (
        `${sourceLabel}-er verified copy amar kache nei, ` +
        'tai oi source-e ki lekha ache ta nishchit kore bolte parchi na. ' +
        'Page-tir chobi ba file upload korbe?'
      );
    }

    return (
      `I do not have a verified copy of ${sourceLabel}, ` +
      'so I cannot claim what that source teaches. ' +
      `Can you upload or photograph ${sourceLabel}?`
    );
  }

  const reflectiveReply =
    reflectiveFallbackReply(
      requestData
    );

  if (reflectiveReply) {
    return reflectiveReply;
  }

  if (language.includes('bangla')) {
    return (
      'আমি উত্তরটি নিরাপদভাবে যাচাই করতে পারিনি। ' +
      'যে নির্দিষ্ট ধারণা বা উদাহরণটি বুঝতে চাও, সেটি লিখবে?'
    );
  }

  if (language.includes('banglish')) {
    return (
      'Ami uttorti nirapod vabe jachai korte parini. ' +
      'Je specific concept ba example-ti bujhte chao, sheti likhbe?'
    );
  }

  return (
    'I could not safely verify this answer. ' +
    'Which exact concept or example would you like explained?'
  );
}

function applyMindfulnessLearningPolicy(
  learningTwin,
  requestData,
  audit
) {
  const source = learningTwin || {};
  const state =
    requestData.mindfulness ||
    createMindfulnessState({
      requestData,
      pedagogyPlan:
        requestData.pedagogyPlan || {},
      curriculumEvidence:
        requestData.curriculumEvidence || [],
    });
  const accepted = audit?.ok === true;
  const allowAssessment =
    state.persistence
      ?.allowAssessmentEvidence === true;
  const allowMisconception =
    state.persistence
      ?.allowMisconceptionCreation === true &&
    accepted;

  return {
    ...source,
    misconception:
      allowMisconception
        ? cleanText(source.misconception)
        : '',
    masteryDelta: 0,
    evidenceVerified:
      accepted &&
      allowAssessment &&
      source.runtimeVerified === true &&
      source.evidenceVerified === true,
    observation:
      accepted &&
      allowAssessment &&
      source.runtimeVerified === true &&
      (
        source.observation === 'correct' ||
        source.observation === 'incorrect'
      )
        ? source.observation
        : '',
    confidence:
      accepted
        ? bounded(source.confidence, 0)
        : Math.min(
            0.35,
            bounded(source.confidence, 0)
          ),
    mindfulnessVerified: accepted,
    mindfulnessVersion:
      MINDFULNESS_VERSION,
  };
}

function shouldPersistMindfulLearning(
  mindfulness,
  learningTwin
) {
  return (
    mindfulness?.persistence
      ?.allowLearningTurn !== false &&
    learningTwin?.mindfulnessVerified === true
  );
}

module.exports = {
  MINDFULNESS_VERSION,
  applyMindfulnessLearningPolicy,
  auditMindfulReply,
  createMindfulnessState,
  mindfulnessFallbackReply,
  mindfulnessRepairInstruction,
  shouldPersistMindfulLearning,
};
