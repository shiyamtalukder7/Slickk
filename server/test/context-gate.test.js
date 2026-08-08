const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activeTutorQuestion,
  createTutorPlan,
  detectTurnKind,
  isAmbiguousShortMessage,
} = require('../src/pedagogy/orchestrator');
const {
  parseTutorRequest,
} = require('../src/contracts/tutor');

test('isolated number requires clarification', () => {
  assert.equal(
    detectTurnKind('5', []),
    'clarification'
  );
});

test('short answer follows only the active tutor question', () => {
  const history = [
    {
      role: 'tutor',
      text: 'What is 10 divided by 2?',
    },
  ];

  assert.equal(
    activeTutorQuestion(history),
    'What is 10 divided by 2?'
  );
  assert.equal(
    detectTurnKind('5', history),
    'answer'
  );
});

test('an older tutor question is not active after a student turn', () => {
  const history = [
    {
      role: 'tutor',
      text: 'What is 10 divided by 2?',
    },
    {
      role: 'student',
      text: 'I want to change topics.',
    },
  ];

  assert.equal(activeTutorQuestion(history), '');
  assert.equal(
    detectTurnKind('5', history),
    'clarification'
  );
});

test('explicit request about number 5 begins a topic', () => {
  assert.equal(
    detectTurnKind(
      'Explain the number 5',
      []
    ),
    'new_topic'
  );
});

test('verified material context is explicit and defaults to false', () => {
  const parsed = parseTutorRequest({
    message: '5',
  });

  assert.equal(parsed.success, true);
  assert.deepEqual(
    parsed.data.materialContext,
    {
      verified: false,
      materialIds: [],
    }
  );
});

test('verified material can classify a short material answer', () => {
  assert.equal(
    detectTurnKind(
      '5',
      [],
      { hasVerifiedMaterial: true }
    ),
    'material_answer'
  );
});

test('clarification plan does not invent a lesson', () => {
  const plan = createTutorPlan({
    requestData: {
      message: '5',
      grade: 'Class 7',
      subject: 'Mathematics',
      materialContext: {
        verified: false,
        materialIds: [],
      },
    },
    history: [],
    learnerProfile: {},
  });

  assert.equal(plan.turnKind, 'clarification');
  assert.equal(plan.lessonState, 'clarify_context');
  assert.equal(plan.needsClarification, true);
  assert.equal(plan.activeQuestion, '');
});

test('short-message detector does not block explicit lessons', () => {
  assert.equal(isAmbiguousShortMessage('5'), true);
  assert.equal(
    isAmbiguousShortMessage(
      'Explain the number 5'
    ),
    false
  );
});

test('explicit practice request overrides an older tutor question', () => {
  const history = [
    {
      role: 'tutor',
      text: 'Can you name another group of five?',
    },
  ];

  assert.equal(
    detectTurnKind(
      'Give me a division question',
      history
    ),
    'practice_request'
  );

  const plan = createTutorPlan({
    requestData: {
      message: 'Give me a division question',
      grade: 'Class 7',
      subject: 'Auto',
    },
    history,
    learnerProfile: {},
  });

  assert.equal(plan.focusTopic, 'Division');
  assert.equal(
    plan.signals.practiceRequest,
    true
  );
  assert.equal(
    plan.signals.answerAttempt,
    false
  );
});
test(
  'collapsed mobile confusion wording overrides an active tutor question',
  () => {
    const history = [
      {
        role: 'tutor',
        text:
          'Can you name another group of 5?',
      },
    ];

    assert.equal(
      detectTurnKind(
        'I still do not understandthe number 5.',
        history
      ),
      'confusion'
    );
    assert.equal(
      detectTurnKind('5', history),
      'answer'
    );
    assert.notEqual(
      detectTurnKind(
        'I understand the number 5.',
        history
      ),
      'confusion'
    );
  }
);
