const assert = require('node:assert/strict');
const test = require('node:test');
const { buildCheckIn } = require('../src/wellbeing/check-in');

test('difficult check-ins create a gentle bounded learning day', () => {
  const result = buildCheckIn({ mood: 'worried', schoolDay: 'difficult' });
  assert.equal(result.learningPace, 'gentle');
  assert.equal(result.suggestedMinutes, 10);
  assert.match(result.response, /gently/);
});

test('help request directs the student to a trusted adult', () => {
  const result = buildCheckIn({ mood: 'upset', schoolDay: 'mixed', needsTrustedAdult: true });
  assert.equal(result.needsTrustedAdult, true);
  assert.match(result.response, /trusted adult/);
});

test('check-ins reject uncontrolled categories', () => {
  assert.throws(() => buildCheckIn({ mood: 'unknown', schoolDay: 'good' }), /Choose how/);
});
