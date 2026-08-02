const { randomUUID } = require('node:crypto');

function createTeachingMethodRegistry() {
  const methods = new Map();

  function submit(input, actor) {
    if (
      actor?.role !== 'teacher' ||
      !actor.subjectId ||
      !input?.schoolId ||
      !input?.subject ||
      !input?.grade ||
      !input?.language ||
      !input?.license ||
      !input?.structure
    ) {
      const error = new Error(
        'An authenticated teacher and complete method provenance are required.'
      );
      error.code = 'METHOD_PROVENANCE_REQUIRED';
      throw error;
    }

    const id = randomUUID();
    const method = {
      id,
      familyId: input.familyId || id,
      version: Math.max(1, Number(input.version) || 1),
      schoolId: String(input.schoolId),
      curriculum: String(input.curriculum || ''),
      grade: String(input.grade),
      subject: String(input.subject),
      language: String(input.language),
      structure: input.structure,
      license: String(input.license),
      authorId: actor.subjectId,
      status: 'submitted',
      evaluation: null,
      approvedBy: null,
      approvedAt: null,
      withdrawnAt: null,
      createdAt: new Date().toISOString(),
    };

    methods.set(id, method);
    return structuredClone(method);
  }

  function approve(id, evaluation, actor) {
    const method = methods.get(id);

    if (
      !method ||
      !['teacher', 'school-admin'].includes(actor?.role) ||
      actor.subjectId === method.authorId ||
      !evaluation?.evidenceId ||
      evaluation?.safe !== true
    ) {
      const error = new Error(
        'Independent educator approval and safe evaluation evidence are required.'
      );
      error.code = 'METHOD_APPROVAL_REQUIRED';
      throw error;
    }

    method.status = 'approved';
    method.evaluation = {
      evidenceId: String(evaluation.evidenceId),
      outcome: String(evaluation.outcome || ''),
      safe: true,
    };
    method.approvedBy = actor.subjectId;
    method.approvedAt = new Date().toISOString();
    return structuredClone(method);
  }

  function withdraw(id, reason, actor) {
    const method = methods.get(id);

    if (
      !method ||
      !['teacher', 'school-admin'].includes(actor?.role) ||
      (!reason && actor.role !== 'school-admin')
    ) {
      const error = new Error(
        'An authorized educator and withdrawal reason are required.'
      );
      error.code = 'METHOD_WITHDRAWAL_REQUIRED';
      throw error;
    }

    method.status = 'withdrawn';
    method.withdrawalReason = String(reason || 'admin rollback');
    method.withdrawnAt = new Date().toISOString();
    return structuredClone(method);
  }

  function matching(filters) {
    return [...methods.values()]
      .filter(
        (method) =>
          method.status === 'approved' &&
          (!filters.schoolId ||
            method.schoolId === filters.schoolId) &&
          (!filters.curriculum ||
            method.curriculum === filters.curriculum) &&
          (!filters.grade ||
            method.grade === filters.grade) &&
          (!filters.subject ||
            method.subject === filters.subject) &&
          (!filters.language ||
            method.language === filters.language)
      )
      .map((method) => structuredClone(method));
  }

  return {
    approve,
    matching,
    submit,
    withdraw,
  };
}

module.exports = {
  createTeachingMethodRegistry,
};
