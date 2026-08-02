const assert = require('node:assert/strict');
const test = require('node:test');

const {
  chooseQuestionStrategy,
} = require('../src/pedagogy/question-taxonomy');

test('question strategy combines teaching action and subject method', () => {
  const strategy = chooseQuestionStrategy({
    actionKind: 'scaffold-misconception',
    subjectFamily: 'science',
  });

  assert.equal(strategy.kind, 'misconception-probe');
  assert.match(strategy.subjectRule, /prediction|causal/i);
  assert.equal(strategy.maximumQuestions, 1);
  assert.equal(strategy.mustWaitForAnswer, true);
});

test('independent transfer requires a different application', () => {
  const strategy = chooseQuestionStrategy({
    actionKind: 'independent-transfer',
    subjectFamily: 'mathematics',
  });

  assert.equal(strategy.kind, 'transfer-challenge');
  assert.equal(strategy.cognitiveLevel, 'create');
  assert.match(strategy.subjectRule, /calculation|representation/i);
});
