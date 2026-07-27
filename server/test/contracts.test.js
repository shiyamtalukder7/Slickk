const assert = require('node:assert/strict');
const test = require('node:test');

const {
  cleanJsonText,
  parseTutorRequest,
  safelyParseTutorResult,
} = require('../src/contracts/tutor');

test('parseTutorRequest applies safe defaults', () => {
  const result = parseTutorRequest({
    message: '  Explain fractions  ',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.message, 'Explain fractions');
  assert.equal(result.data.mode, 'adaptive');
  assert.equal(result.data.language, 'English');
  assert.equal(result.data.studentId, 'local-student');
  assert.equal(result.data.subject, 'Auto');
  assert.equal(result.data.channel, 'typed');
});

test('parseTutorRequest accepts live teaching delivery', () => {
  const result = parseTutorRequest({
    message: 'Teach me gently',
    channel: 'live',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.channel, 'live');
});

test('parseTutorRequest accepts a conversation ID', () => {
  const conversationId =
    '67c50746-126c-4f5e-83b0-cd8d9714e987';
  const result = parseTutorRequest({
    message: 'Continue our lesson',
    conversationId,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.conversationId, conversationId);
});

test('parseTutorRequest rejects empty messages', () => {
  const result = parseTutorRequest({
    message: '   ',
  });

  assert.equal(result.success, false);
  assert.equal(result.issues[0].field, 'message');
});

test('parseTutorRequest rejects unsupported modes', () => {
  const result = parseTutorRequest({
    message: 'Teach me',
    mode: 'do-my-homework',
  });

  assert.equal(result.success, false);
  assert.equal(result.issues[0].field, 'mode');
});

test('cleanJsonText extracts fenced JSON', () => {
  const cleaned = cleanJsonText(
    '```json\n{"reply":"Hello"}\n```'
  );

  assert.equal(cleaned, '{"reply":"Hello"}');
});

test('safelyParseTutorResult normalizes model output', () => {
  const result = safelyParseTutorResult(
    JSON.stringify({
      reply: 'Use a common denominator.',
      topic: 'Fractions',
      skill: 'Addition',
      misconception: '',
      nextAction: 'What is 1/4 + 1/4?',
      confidence: 7,
      masteryDelta: -9,
    })
  );

  assert.equal(result.reply, 'Use a common denominator.');
  assert.equal(result.confidence, 1);
  assert.equal(result.masteryDelta, -2);
});

test('safelyParseTutorResult falls back to readable text', () => {
  const result = safelyParseTutorResult(
    'Let us solve it one step at a time.'
  );

  assert.equal(
    result.reply,
    'Let us solve it one step at a time.'
  );
  assert.equal(result.topic, 'General learning');
});
