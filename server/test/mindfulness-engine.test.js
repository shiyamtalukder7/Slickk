const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyMindfulnessLearningPolicy,
  auditMindfulReply,
  createMindfulnessState,
  shouldPersistMindfulLearning,
} = require('../src/mindfulness/engine');
const {
  askTutor,
} = require('../src/services/tutor');

function pedagogyPlan(overrides = {}) {
  return {
    subjectKey: 'subject:mathematics',
    subjectFamily: 'mathematics',
    subject: 'Mathematics',
    focusTopic: 'Division',
    turnKind: 'question',
    lessonState: 'explanation',
    activeQuestion: '',
    needsClarification: false,
    verifiedMaterialContext: false,
    supportLevel: 0,
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: false,
      needsClarification: false,
      practiceRequest: false,
    },
    relevantMemory: {
      subject: {
        masteryScore: 0.25,
        masteryEvidence: 0,
        lastTopic: 'Division',
      },
      activeMisconceptions: [],
    },
    decision: {
      teachingAction: {
        kind: 'build-mental-connection',
        purpose: 'Build one useful connection.',
        requiredStructure: [
          'state the core meaning',
          'give one concrete example',
          'connect the formal idea',
          'ask one question',
        ],
        forbidden: [
          'inventing sources',
        ],
      },
      learningTwinPolicy: {
        persistLearning: true,
        mayChangeMastery: false,
        mayCreateMisconception: false,
        topic: 'Division',
        skill: 'Building a mental connection',
        nextAction: 'Answer the checking question.',
        confidence: 0.35,
        masteryDelta: 0,
      },
    },
    ...overrides,
  };
}

function requestFor(plan, overrides = {}) {
  const requestData = {
    message: 'Explain division.',
    studentName: 'Student',
    studentId: 'local-student',
    grade: 'Class 7',
    language: 'English',
    subject: 'Mathematics',
    channel: 'live',
    mode: 'adaptive',
    recentMessages: [],
    pedagogyPlan: plan,
    curriculumEvidence: [],
    ...overrides,
  };

  requestData.mindfulness =
    createMindfulnessState({
      requestData,
      history:
        requestData.recentMessages,
      learnerProfile: {
        subjects: [],
      },
      pedagogyPlan: plan,
      curriculumEvidence:
        requestData.curriculumEvidence,
    });

  return requestData;
}

test('clarification mindfulness blocks learner persistence', () => {
  const plan = pedagogyPlan({
    turnKind: 'clarification',
    needsClarification: true,
    focusTopic: 'General learning',
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: false,
      needsClarification: true,
      practiceRequest: false,
    },
    decision: {
      teachingAction: {
        kind: 'clarify-intent',
      },
      learningTwinPolicy: {
        persistLearning: false,
      },
    },
  });
  const state = createMindfulnessState({
    requestData: {
      message: '5',
      channel: 'live',
    },
    pedagogyPlan: plan,
  });

  assert.equal(
    state.intent.mustClarify,
    true
  );
  assert.equal(
    state.persistence.allowLearningTurn,
    false
  );
});

test('active answer enables only verified assessment evidence', () => {
  const plan = pedagogyPlan({
    turnKind: 'answer',
    activeQuestion:
      'What is 48 divided by 6?',
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: true,
      needsClarification: false,
      practiceRequest: false,
    },
    decision: {
      teachingAction: {
        kind: 'evaluate-current-thinking',
      },
      learningTwinPolicy: {
        persistLearning: true,
      },
    },
  });
  const state = createMindfulnessState({
    requestData: {
      message: '5',
      channel: 'live',
    },
    pedagogyPlan: plan,
  });

  assert.equal(
    state.intent.mustEvaluateCurrentAnswer,
    true
  );
  assert.equal(
    state.persistence.allowAssessmentEvidence,
    true
  );
  assert.equal(
    state.intent.expectedTopic,
    'Division'
  );
});

test('verified curriculum evidence changes provenance status', () => {
  const state = createMindfulnessState({
    requestData: {
      message: 'Explain the source.',
      channel: 'typed',
    },
    pedagogyPlan: pedagogyPlan(),
    curriculumEvidence: [
      {
        citationId: 'source-1',
      },
    ],
  });

  assert.equal(
    state.knowledge.status,
    'verified-curriculum-evidence'
  );
  assert.equal(
    state.provenance.forbidUnverifiedSourceClaims,
    false
  );
});

test('unverified textbook and page claims are rejected', () => {
  const requestData = requestFor(
    pedagogyPlan()
  );
  const audit = auditMindfulReply(
    'Division shares a quantity equally. For example, twelve objects shared among three groups gives four in each group. According to page 12 of your textbook, this is the quotient. What is twelve divided by three?',
    requestData,
    []
  );

  assert.equal(audit.ok, false);
  assert.ok(
    audit.issues.includes(
      'UNVERIFIED_SOURCE_CLAIM'
    )
  );
});

test('unsupported mastery claims are rejected', () => {
  const requestData = requestFor(
    pedagogyPlan()
  );
  const audit = auditMindfulReply(
    'You have mastered division. What is twelve divided by three?',
    requestData,
    []
  );

  assert.equal(audit.ok, false);
  assert.ok(
    audit.issues.includes(
      'LEARNING_EVIDENCE_OVERCLAIM'
    )
  );
});

test('answer evaluation cannot redirect to an unrelated topic', () => {
  const plan = pedagogyPlan({
    turnKind: 'answer',
    activeQuestion:
      'What is 48 divided by 6?',
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: true,
      needsClarification: false,
      practiceRequest: false,
    },
    decision: {
      teachingAction: {
        kind: 'evaluate-current-thinking',
      },
      learningTwinPolicy: {
        persistLearning: true,
      },
    },
  });
  const requestData = requestFor(
    plan,
    {
      message: '5',
    }
  );
  const audit = auditMindfulReply(
    'Not yet. Let us explain a fraction instead. How would you define a fraction?',
    requestData,
    []
  );

  assert.equal(audit.ok, false);
  assert.ok(
    audit.issues.includes('TOPIC_DRIFT')
  );
});

test('failed mindfulness audit removes learning evidence', () => {
  const plan = pedagogyPlan({
    turnKind: 'answer',
    activeQuestion:
      'What is 48 divided by 6?',
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: true,
      needsClarification: false,
      practiceRequest: false,
    },
  });
  const requestData = requestFor(
    plan,
    {
      message: '5',
    }
  );
  const normalized =
    applyMindfulnessLearningPolicy(
      {
        topic: 'Division',
        skill: 'Evaluating division',
        misconception: 'Invented gap',
        nextAction: 'Continue.',
        confidence: 1,
        masteryDelta: 3,
        runtimeVerified: true,
        evidenceVerified: true,
        observation: 'incorrect',
      },
      requestData,
      {
        ok: false,
        issues: ['TOPIC_DRIFT'],
      }
    );

  assert.equal(
    normalized.mindfulnessVerified,
    false
  );
  assert.equal(
    normalized.evidenceVerified,
    false
  );
  assert.equal(normalized.observation, '');
  assert.equal(normalized.misconception, '');
  assert.equal(normalized.masteryDelta, 0);
  assert.equal(
    shouldPersistMindfulLearning(
      requestData.mindfulness,
      normalized
    ),
    false
  );
});

test('verified answer evidence survives a successful audit', () => {
  const plan = pedagogyPlan({
    turnKind: 'answer',
    activeQuestion:
      'What is 48 divided by 6?',
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: true,
      needsClarification: false,
      practiceRequest: false,
    },
  });
  const requestData = requestFor(
    plan,
    {
      message: '8',
    }
  );
  const reply =
    'Correct. 48 divided by 6 is 8 because 6 times 8 equals 48. What is 54 divided by 6?';
  const audit =
    auditMindfulReply(
      reply,
      requestData,
      []
    );
  const normalized =
    applyMindfulnessLearningPolicy(
      {
        reply,
        topic: 'Division',
        skill: 'Evaluating division',
        misconception: '',
        nextAction: 'Solve the checking question.',
        confidence: 1,
        masteryDelta: 0,
        runtimeVerified: true,
        evidenceVerified: true,
        observation: 'correct',
      },
      requestData,
      audit
    );

  assert.equal(audit.ok, true);
  assert.equal(
    normalized.evidenceVerified,
    true
  );
  assert.equal(
    normalized.observation,
    'correct'
  );
  assert.equal(
    normalized.mindfulnessVerified,
    true
  );
});

test('model draft is retried when only mindfulness provenance fails', async () => {
  const plan = pedagogyPlan({
    focusTopic: 'Place Value',
    subject: 'Mathematics',
    decision: {
      teachingAction: {
        kind: 'build-mental-connection',
        purpose: 'Build a place-value concept.',
        requiredStructure: [
          'state the core meaning',
          'give one concrete example',
          'connect the formal idea',
          'ask one question',
        ],
        forbidden: [
          'inventing sources',
        ],
      },
      learningTwinPolicy: {
        persistLearning: true,
        mayChangeMastery: false,
        mayCreateMisconception: false,
        topic: 'Place Value',
        skill: 'Building a mental connection',
        nextAction: 'Answer the checking question.',
        confidence: 0.35,
        masteryDelta: 0,
      },
    },
  });
  const requestData = requestFor(
    plan,
    {
      message:
        'Explain place value.',
    }
  );
  let calls = 0;
  const provider = {
    async generate() {
      calls += 1;
      const reply =
        calls === 1
          ? (
              'Place value tells us that a digit changes value by position. ' +
              'For example, in 52, the 5 represents five tens. ' +
              'According to page 12 of your textbook, ' +
              'the 2 represents two ones. ' +
              'What does the 5 represent in 52?'
            )
          : (
              'Place value tells us that a digit changes value by position. ' +
              'For example, in 52, the 5 represents five tens. ' +
              'The 2 represents two ones, so position determines value. ' +
              'What does the 5 represent in 52?'
            );

      return {
        content: JSON.stringify({
          reply,
          topic: 'Place Value',
          skill:
            'Connecting digit and position',
          misconception: '',
          nextAction:
            'Explain the value of 5 in 52.',
          confidence: 0.7,
          masteryDelta: 0,
        }),
        metrics: {
          provider: 'test',
        },
      };
    },
  };

  const result = await askTutor(
    requestData,
    undefined,
    [],
    provider
  );

  assert.equal(calls, 2);
  assert.equal(
    result.mindfulnessAudit.ok,
    true
  );
  assert.doesNotMatch(
    result.tutorResult.reply,
    /textbook|page 12/i
  );
  assert.equal(
    result.tutorResult.mindfulnessVerified,
    true
  );
});
test('source-aware fallback names missing evidence without inventing it', () => {
  const {
    mindfulnessFallbackReply,
  } = require('../src/mindfulness/engine');
  const plan = pedagogyPlan({
    focusTopic: 'Place Value',
  });
  const requestData = requestFor(
    plan,
    {
      message:
        'Explain place value according to page 12 of my textbook.',
    }
  );
  const reply =
    mindfulnessFallbackReply(requestData);
  const audit =
    auditMindfulReply(
      reply,
      requestData,
      []
    );

  assert.match(
    reply,
    /do not have a verified copy of page 12/i
  );
  assert.match(
    reply,
    /upload or photograph page 12/i
  );
  assert.doesNotMatch(
    reply,
    /repeat the full question/i
  );
  assert.equal(
    audit.ok,
    true
  );
  assert.deepEqual(
    audit.issues,
    []
  );
});

test('truthful source uncertainty is not treated as a source claim', () => {
  const plan = pedagogyPlan({
    focusTopic: 'Place Value',
  });
  const requestData = requestFor(
    plan,
    {
      message:
        'Explain place value from page 12.',
    }
  );
  const audit =
    auditMindfulReply(
      'I cannot verify page 12 because it was not provided. Can you upload it?',
      requestData,
      []
    );

  assert.equal(
    audit.ok,
    true
  );
  assert.deepEqual(
    audit.issues,
    []
  );
});

test('according to a numbered textbook page is a positive source claim', () => {
  const requestData = requestFor(
    pedagogyPlan()
  );
  const audit = auditMindfulReply(
    'According to page 12 of your textbook, place value changes a digit.',
    requestData,
    []
  );

  assert.equal(
    audit.ok,
    false
  );
  assert.ok(
    audit.issues.includes(
      'UNVERIFIED_SOURCE_CLAIM'
    )
  );
});
