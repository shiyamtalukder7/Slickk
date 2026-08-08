const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeTutorReply,
} = require('../src/contracts/tutor');
const {
  auditTutorResponseShape,
  constrainTutorReply,
  questionCount,
  wordCount,
} = require('../src/auditing/response-shape');
const {
  askTutor,
  streamTutor,
} = require('../src/services/tutor');

function clarificationRequest() {
  return {
    message: '5',
    language: 'English',
    channel: 'live',
    recentMessages: [],
    pedagogyPlan: {
      turnKind: 'clarification',
      lessonState: 'clarify_context',
      activeQuestion: '',
      needsClarification: true,
    },
  };
}

test('valid JSON wrapper exposes only reply', () => {
  assert.equal(
    sanitizeTutorReply(
      '{"reply":"Clean answer"}'
    ),
    'Clean answer'
  );
});

test('truncated JSON wrapper still extracts reply text', () => {
  assert.equal(
    sanitizeTutorReply(
      '{"reply":"Start with five objects. What do you notice?'
    ),
    'Start with five objects. What do you notice?'
  );
});

test('unknown structured output never leaks to student', () => {
  assert.equal(
    sanitizeTutorReply(
      '{"metadata":"internal"',
      'Safe fallback'
    ),
    'Safe fallback'
  );
});

test('live response is limited to one question and seventy words', () => {
  const longReply = [
    'Let us look at one idea together.',
    'Five tells us how many objects are in a group.',
    'Can you point to five objects?',
    'What colors are they?',
    ...Array.from(
      { length: 90 },
      () => 'extra'
    ),
  ].join(' ');

  const constrained = constrainTutorReply(
    longReply,
    { channel: 'live' }
  );

  assert.ok(wordCount(constrained) <= 70);
  assert.ok(questionCount(constrained) <= 1);
  assert.equal(
    auditTutorResponseShape(
      constrained,
      'live'
    ).ok,
    true
  );
});

test('ambiguous input bypasses the model', async () => {
  let calls = 0;
  const provider = {
    async generate() {
      calls += 1;
      throw new Error('Model should not run.');
    },
  };

  const result = await askTutor(
    clarificationRequest(),
    undefined,
    [],
    provider
  );

  assert.equal(calls, 0);
  assert.match(
    result.tutorResult.reply,
    /You entered "5"/i
  );
  assert.equal(
    result.tutorResult.topic,
    'Clarifying the question'
  );
});

test('streaming clarification emits one clean deterministic reply', async () => {
  let calls = 0;
  const tokens = [];
  const provider = {
    async stream() {
      calls += 1;
      throw new Error('Model should not run.');
    },
  };

  const result = await streamTutor(
    clarificationRequest(),
    undefined,
    (token) => tokens.push(token),
    [],
    provider
  );

  assert.equal(calls, 0);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0], result.reply);
  assert.equal(
    auditTutorResponseShape(
      result.reply,
      'live'
    ).ok,
    true
  );
});
