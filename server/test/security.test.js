const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canAccessStudent,
  credentialForToken,
  parseApiCredentials,
} = require('../src/security/api');

test('API credentials retain roles without retaining raw tokens', () => {
  const token = 'a-secure-development-token-12345';
  const credentials = parseApiCredentials(
    JSON.stringify([
      {
        token,
        role: 'student',
        subjectId: 'student-1',
      },
    ])
  );

  assert.equal(credentials[0].token, undefined);
  assert.equal(
    credentialForToken(credentials, token).subjectId,
    'student-1'
  );
  assert.equal(
    credentialForToken(credentials, 'wrong-token'),
    null
  );
});

test('student credentials are bound to their own record', () => {
  assert.equal(
    canAccessStudent(
      {
        role: 'student',
        subjectId: 'student-1',
      },
      'student-1'
    ),
    true
  );
  assert.equal(
    canAccessStudent(
      {
        role: 'student',
        subjectId: 'student-1',
      },
      'student-2'
    ),
    false
  );
});

test('short or unsupported credentials are rejected', () => {
  assert.throws(
    () =>
      parseApiCredentials(
        JSON.stringify([
          {
            token: 'short',
            role: 'owner',
            subjectId: 'x',
          },
        ])
      ),
    /24\+ character token/
  );
});
