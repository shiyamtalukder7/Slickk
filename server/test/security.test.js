const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canAccessStudent,
  credentialForToken,
  parseApiCredentials,
  requireRole,
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

test('training administration requires an educator role', () => {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  assert.equal(
    requireRole(
      { principal: { role: 'student' }, requestId: 'request-1' },
      response,
      ['teacher', 'school-admin']
    ),
    false
  );
  assert.equal(response.statusCode, 403);
  assert.equal(response.payload.code, 'ROLE_ACCESS_DENIED');
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

test('guardian credentials are bound to their linked student record', () => {
  assert.equal(canAccessStudent({ role: 'guardian', subjectId: 'student-1' }, 'student-1'), true);
  assert.equal(canAccessStudent({ role: 'guardian', subjectId: 'student-1' }, 'student-2'), false);
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
