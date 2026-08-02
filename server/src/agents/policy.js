const { randomUUID } = require('node:crypto');

function createAgentRun({
  goal,
  principal,
  allowedTools,
  maximumActions = 8,
  expiresInMs = 5 * 60_000,
}) {
  if (
    !String(goal || '').trim() ||
    !principal?.subjectId ||
    !Array.isArray(allowedTools)
  ) {
    const error = new Error(
      'Agent runs require a bounded goal, principal, and tool allow-list.'
    );
    error.code = 'INVALID_AGENT_RUN';
    throw error;
  }

  return {
    runId: randomUUID(),
    goal: String(goal).slice(0, 500),
    principal,
    allowedTools: [...new Set(allowedTools)],
    maximumActions: Math.min(
      25,
      Math.max(1, Number(maximumActions) || 8)
    ),
    actionCount: 0,
    status: 'active',
    expiresAt: new Date(
      Date.now() +
        Math.min(
          60 * 60_000,
          Math.max(10_000, expiresInMs)
        )
    ).toISOString(),
    log: [],
  };
}

function authorizeAgentAction(run, action) {
  const consequential = new Set([
    'submit-assessment',
    'change-roster',
    'share-student-data',
    'delete-data',
  ]);
  let reason = 'permitted';

  if (run.status !== 'active') {
    reason = 'run-not-active';
  } else if (Date.now() >= Date.parse(run.expiresAt)) {
    reason = 'run-expired';
  } else if (run.actionCount >= run.maximumActions) {
    reason = 'action-budget-exhausted';
  } else if (!run.allowedTools.includes(action.tool)) {
    reason = 'tool-not-allowed';
  } else if (
    consequential.has(action.tool) &&
    action.humanApproved !== true
  ) {
    reason = 'human-approval-required';
  }

  const allowed = reason === 'permitted';
  run.log.push({
    index: run.log.length + 1,
    tool: action.tool,
    allowed,
    reason,
    at: new Date().toISOString(),
  });

  if (allowed) {
    run.actionCount += 1;
  }

  return {
    allowed,
    reason,
    remainingActions: Math.max(
      0,
      run.maximumActions - run.actionCount
    ),
  };
}

function cancelAgentRun(run, principal) {
  if (
    principal.subjectId !== run.principal.subjectId &&
    principal.role !== 'school-admin'
  ) {
    const error = new Error(
      'Only the run owner or school administrator can cancel this agent.'
    );
    error.code = 'AGENT_CANCELLATION_DENIED';
    throw error;
  }

  run.status = 'cancelled';
  return run;
}

module.exports = {
  authorizeAgentAction,
  cancelAgentRun,
  createAgentRun,
};
