const assert = require('node:assert/strict');
const test = require('node:test');

const {
  authorizeAgentAction,
  cancelAgentRun,
  createAgentRun,
} = require('../src/agents/policy');

test('agent tools are allow-listed and action-budgeted', () => {
  const run = createAgentRun({
    goal: 'Prepare two fraction reviews',
    principal: {
      role: 'student',
      subjectId: 'student-1',
    },
    allowedTools: ['create-practice'],
    maximumActions: 1,
  });

  assert.equal(
    authorizeAgentAction(run, {
      tool: 'create-practice',
    }).allowed,
    true
  );
  assert.equal(
    authorizeAgentAction(run, {
      tool: 'create-practice',
    }).reason,
    'action-budget-exhausted'
  );
});

test('high-impact agent actions require human approval', () => {
  const run = createAgentRun({
    goal: 'Submit finished practice',
    principal: {
      role: 'student',
      subjectId: 'student-1',
    },
    allowedTools: ['submit-assessment'],
  });

  assert.equal(
    authorizeAgentAction(run, {
      tool: 'submit-assessment',
    }).reason,
    'human-approval-required'
  );
});

test('agent runs can be cancelled by their owner', () => {
  const principal = {
    role: 'student',
    subjectId: 'student-1',
  };
  const run = createAgentRun({
    goal: 'Plan revision',
    principal,
    allowedTools: ['schedule-review'],
  });

  assert.equal(
    cancelAgentRun(run, principal).status,
    'cancelled'
  );
});
