const assert = require('node:assert/strict');
const test = require('node:test');
const { sessionAdaptation } = require('../src/learning/session-adaptation');

test('recent gentle check-in reduces step size but not mastery standard', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');
  const result = sessionAdaptation({ learningPace: 'gentle', createdAt: '2026-08-05T10:00:00.000Z' }, now);
  assert.equal(result.sessionMinutes, 10);
  assert.equal(result.stepSize, 'smaller');
  assert.equal(result.mayLowerMasteryStandard, false);
});

test('stale check-in cannot keep changing future lessons', () => {
  const result = sessionAdaptation({ learningPace: 'gentle', createdAt: '2026-08-01T10:00:00.000Z' }, new Date('2026-08-05T12:00:00.000Z'));
  assert.equal(result.pace, 'standard');
  assert.equal(result.sessionMinutes, 20);
});
