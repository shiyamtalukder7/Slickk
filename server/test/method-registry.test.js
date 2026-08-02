const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createTeachingMethodRegistry,
} = require('../src/pedagogy/method-registry');

function input() {
  return {
    schoolId: 'school-1',
    curriculum: 'NCTB',
    grade: 'Class 6',
    subject: 'Science',
    language: 'Bangla',
    license: 'school-approved',
    structure: {
      steps: ['observe', 'predict', 'explain'],
    },
  };
}

test('teaching methods require independent approval evidence', () => {
  const registry = createTeachingMethodRegistry();
  const method = registry.submit(input(), {
    role: 'teacher',
    subjectId: 'teacher-1',
  });

  assert.throws(
    () =>
      registry.approve(
        method.id,
        {
          evidenceId: 'evaluation-1',
          safe: true,
        },
        {
          role: 'teacher',
          subjectId: 'teacher-1',
        }
      ),
    /Independent educator approval/
  );

  registry.approve(
    method.id,
    {
      evidenceId: 'evaluation-1',
      outcome: 'improved concept check',
      safe: true,
    },
    {
      role: 'teacher',
      subjectId: 'teacher-2',
    }
  );

  assert.equal(
    registry.matching({
      schoolId: 'school-1',
      grade: 'Class 6',
      subject: 'Science',
    }).length,
    1
  );
});

test('withdrawn methods immediately leave matching results', () => {
  const registry = createTeachingMethodRegistry();
  const method = registry.submit(input(), {
    role: 'teacher',
    subjectId: 'teacher-1',
  });

  registry.approve(
    method.id,
    {
      evidenceId: 'evaluation-1',
      safe: true,
    },
    {
      role: 'school-admin',
      subjectId: 'admin-1',
    }
  );
  registry.withdraw(
    method.id,
    'Outcome regression',
    {
      role: 'school-admin',
      subjectId: 'admin-1',
    }
  );

  assert.equal(registry.matching({}).length, 0);
});
