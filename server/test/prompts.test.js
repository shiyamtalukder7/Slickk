const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildStreamingTutorSystemPrompt,
} = require('../src/prompts/tutor');

function liveRequest(overrides = {}) {
  return {
    studentName: 'Student',
    grade: 'Grade 7-8',
    language: 'English',
    channel: 'live',
    mode: 'adaptive',
    ...overrides,
  };
}

test('live tutor prompt uses an adaptive private-teacher loop', () => {
  const prompt = buildStreamingTutorSystemPrompt(
    liveRequest()
  );

  assert.match(
    prompt,
    /react to that exact answer/i
  );
  assert.match(
    prompt,
    /ask exactly one natural checking question/i
  );
  assert.match(
    prompt,
    /student has space to answer/i
  );
  assert.match(
    prompt,
    /make the next question easier/i
  );
});

test('live tutor prompt requires voice-safe prose', () => {
  const prompt = buildStreamingTutorSystemPrompt(
    liveRequest()
  );

  assert.match(prompt, /plain spoken prose only/i);
  assert.match(prompt, /never use Markdown/i);
  assert.match(
    prompt,
    /three times four.*asterisk/i
  );
});
