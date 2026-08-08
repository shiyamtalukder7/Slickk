const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMindRightDecision,
  learnerStateFrom,
} = require('../src/mind-right/engine');
const {
  applyLearningTwinPolicy,
  auditMindRightReply,
  deterministicMindRightResult,
  parseSimpleArithmeticQuestion,
} = require('../src/mind-right/runtime');
const {
  createTutorPlan,
} = require('../src/pedagogy/orchestrator');
const {
  streamTutor,
} = require('../src/services/tutor');

function requestFor({
  message,
  history = [],
  learnerProfile = {},
  subject = 'Auto',
}) {
  const plan = createTutorPlan({
    requestData: {
      message,
      grade: 'Class 7',
      subject,
      materialContext: {
        verified: false,
        materialIds: [],
      },
    },
    history,
    learnerProfile,
  });

  plan.decision = createMindRightDecision({
    pedagogyPlan: plan,
    curriculumEvidence: [],
  });

  return {
    message,
    language: 'English',
    channel: 'live',
    mode: 'adaptive',
    recentMessages: history,
    pedagogyPlan: plan,
  };
}

test('simple division question is parsed deterministically', () => {
  assert.deepEqual(
    parseSimpleArithmeticQuestion(
      'What is 48 divided by 6?'
    ),
    {
      operation: 'division',
      left: 48,
      right: 6,
      answer: 8,
      expression: '48 divided by 6',
    }
  );
});

test('division practice request produces one verified question', () => {
  const requestData = requestFor({
    message: 'Give me a division question',
    history: [
      {
        role: 'tutor',
        text:
          'Can you name another group of five?',
      },
    ],
  });

  const result =
    deterministicMindRightResult(
      requestData
    );

  assert.equal(
    requestData.pedagogyPlan.turnKind,
    'practice_request'
  );
  assert.equal(
    result.reply,
    'What is 48 divided by 6?'
  );
  assert.equal(result.topic, 'Division');
  assert.equal(
    result.runtimeVerified,
    true
  );
});

test('wrong arithmetic answer is rejected with the exact reason', () => {
  const requestData = requestFor({
    message: '5',
    history: [
      {
        role: 'tutor',
        text: 'What is 48 divided by 6?',
      },
    ],
  });

  const result =
    deterministicMindRightResult(
      requestData
    );

  assert.match(result.reply, /Not yet/i);
  assert.match(
    result.reply,
    /48 divided by 6 is 8/i
  );
  assert.match(
    result.reply,
    /6 times 8 equals 48/i
  );
  assert.equal(result.topic, 'Division');
  assert.equal(result.evidenceVerified, true);
  assert.equal(result.observation, 'incorrect');
});

test('number-five concept follows the full construction contract', () => {
  const requestData = requestFor({
    message: 'Explain the number 5',
  });
  const result =
    deterministicMindRightResult(
      requestData
    );
  const audit = auditMindRightReply(
    result.reply,
    requestData,
    []
  );

  assert.match(
    result.reply,
    /represents a quantity of 5/i
  );
  assert.match(
    result.reply,
    /For example/i
  );
  assert.match(
    result.reply,
    /after 4 and before 6/i
  );
  assert.equal(audit.ok, true);
});

test('diagnostic-only concept response is rejected', () => {
  const requestData = requestFor({
    message: 'Explain the number 5',
  });
  const audit = auditMindRightReply(
    'What do you already know about the number 5?',
    requestData,
    []
  );

  assert.equal(audit.ok, false);
  assert.ok(
    audit.issues.includes(
      'DIAGNOSTIC_INSTEAD_OF_TEACHING'
    )
  );
  assert.ok(
    audit.issues.includes(
      'CONCEPT_MISSING_EXPLANATION'
    )
  );
});

test('invented past lesson context is rejected', () => {
  const requestData = requestFor({
    message: 'Give me a division question',
  });
  const audit = auditMindRightReply(
    'You struggled with this in class yesterday. What is 48 divided by 6?',
    requestData,
    []
  );

  assert.equal(audit.ok, false);
  assert.ok(
    audit.issues.includes(
      'UNSUPPORTED_PAST_CONTEXT'
    )
  );
});

test('model metadata cannot overwrite the Mind Right Learning Twin', () => {
  const requestData = requestFor({
    message: 'Explain the number 5',
  });
  const normalized =
    applyLearningTwinPolicy(
      {
        reply: 'Model reply',
        topic: 'Algebra',
        skill: 'Unrelated skill',
        misconception: 'default',
        nextAction:
          'Discuss yesterday in class.',
        confidence: 1,
        masteryDelta: 3,
      },
      requestData
    );

  assert.equal(
    normalized.topic,
    'Number 5'
  );
  assert.equal(
    normalized.skill,
    'Building a mental connection'
  );
  assert.equal(
    normalized.misconception,
    ''
  );
  assert.equal(
    normalized.masteryDelta,
    0
  );
});

test('unverified stored misconceptions do not control the brain', () => {
  const learnerState = learnerStateFrom({
    supportLevel: 0,
    signals: {},
    relevantMemory: {
      subject: {
        masteryScore: 0.7,
        masteryEvidence: 5,
      },
      activeMisconceptions: [
        {
          id: 'model-guess',
          correction: '',
        },
        {
          id: 'verified-gap',
          verified: true,
        },
      ],
    },
  });

  assert.equal(
    learnerState.activeMisconceptions,
    1
  );
});

test('streaming practice bypasses the model and exposes only verified output', async () => {
  let calls = 0;
  const visible = [];
  const requestData = requestFor({
    message: 'Give me a division question',
  });
  const provider = {
    async stream() {
      calls += 1;
      throw new Error(
        'The model must not run.'
      );
    },
  };

  const result = await streamTutor(
    requestData,
    undefined,
    (token) => visible.push(token),
    requestData.recentMessages,
    provider
  );

  assert.equal(calls, 0);
  assert.deepEqual(
    visible,
    ['What is 48 divided by 6?']
  );
  assert.equal(
    result.learningTwin.topic,
    'Division'
  );
});

test('streaming wrong arithmetic answer bypasses the model', async () => {
  let calls = 0;
  const visible = [];
  const history = [
    {
      role: 'tutor',
      text: 'What is 48 divided by 6?',
    },
  ];
  const requestData = requestFor({
    message: '5',
    history,
  });
  const provider = {
    async stream() {
      calls += 1;
      throw new Error(
        'The model must not run.'
      );
    },
  };

  const result = await streamTutor(
    requestData,
    undefined,
    (token) => visible.push(token),
    history,
    provider
  );

  assert.equal(calls, 0);
  assert.equal(visible.length, 1);
  assert.match(
    result.reply,
    /48 divided by 6 is 8/i
  );
  assert.equal(
    result.learningTwin.topic,
    'Division'
  );
});

test('correct arithmetic answer creates verified evidence', () => {
  const requestData = requestFor({
    message: '8',
    history: [
      {
        role: 'tutor',
        text: 'What is 48 divided by 6?',
      },
    ],
  });

  const result =
    deterministicMindRightResult(
      requestData
    );
  const normalized =
    applyLearningTwinPolicy(
      result,
      requestData
    );

  assert.match(result.reply, /^Correct\./i);
  assert.equal(
    normalized.evidenceVerified,
    true
  );
  assert.equal(
    normalized.observation,
    'correct'
  );
  assert.equal(normalized.topic, 'Division');
});

test('structured metadata is removed from the Learning Twin', () => {
  const requestData = requestFor({
    message: 'Explain the number 5',
  });
  const normalized =
    applyLearningTwinPolicy(
      {
        reply: 'Verified reply.',
        topic: '<?xml version="1.0"?>',
        skill: '{"reply":"internal"}',
        misconception: 'default',
        nextAction:
          'MIND_RIGHT_DECISION_DATA={}',
        confidence: 1,
        runtimeVerified: true,
      },
      requestData
    );

  assert.equal(
    normalized.topic,
    'Number 5'
  );
  assert.equal(
    normalized.skill,
    'Building a mental connection'
  );
  assert.equal(
    normalized.misconception,
    ''
  );
  assert.equal(
    normalized.nextAction,
    'ask one evidence-producing question'
  );
});



test(
  'concept preference question is rejected because it does not produce learner evidence',
  () => {
    const requestData = requestFor({
      message:
        'Explain why ionic compounds conduct electricity when molten',
      subject: 'Chemistry',
    });

    const audit = auditMindRightReply(
      'Ionic compounds contain charged ions. ' +
        'For example, sodium chloride has sodium and chloride ions. ' +
        'When it melts, those ions become free to move and carry charge. ' +
        'Would you like another example?',
      requestData,
      []
    );

    assert.equal(audit.ok, false);

    assert.ok(
      audit.issues.includes(
        'CONCEPT_CHECK_NOT_EVIDENCE_PRODUCING'
      )
    );
  }
);

test(
  'concept explanation question is accepted as learner evidence',
  () => {
    const requestData = requestFor({
      message:
        'Explain why ionic compounds conduct electricity when molten',
      subject: 'Chemistry',
    });

    const audit = auditMindRightReply(
      'Ionic compounds contain charged ions. ' +
        'For example, sodium chloride has sodium and chloride ions. ' +
        'When it melts, those ions become free to move and carry charge. ' +
        'Why can molten sodium chloride conduct electricity while solid sodium chloride cannot?',
      requestData,
      []
    );

    assert.equal(
      audit.ok,
      true,
      JSON.stringify(audit)
    );
  }
);
