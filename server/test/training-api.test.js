const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const test = require('node:test');

const { createApp } = require('../src/app');
const { parseApiCredentials } = require('../src/security/api');
const { createConversationStore } = require('../src/storage/conversations');
const { createCurriculumStore } = require('../src/storage/curriculum');
const { createSchoolStore } = require('../src/storage/schools');
const {
  createTrainingReviewStore,
} = require('../src/storage/training-reviews');

const TOKENS = {
  student: 'student-training-api-token-0001',
  teacher: 'teacher-training-api-token-0001',
  admin: 'school-admin-training-token-001',
};

function candidate() {
  return {
    id: 'review-api-example-1',
    split: 'training',
    status: 'awaiting-reviewed-response',
    task: { kind: 'guided-hint', goal: 'Offer one useful hint.' },
    learnerContext: {
      curriculum: 'NCTB',
      grade: 'Class 7',
      subject: 'Mathematics',
      language: 'Bangla',
    },
    source: {
      documentId: 'open-math',
      documentSha256: 'open-math-sha256',
      title: 'Open Mathematics',
      page: 7,
      chunkIndex: 1,
      rights: 'open-license',
      content: 'A fraction represents equal parts of a whole.',
    },
    generatedResponse:
      'Draw four equal parts. If one is shaded, what fraction is shaded?',
    containsRawPrivateData: false,
  };
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

test('training review API enforces educator and administrator roles', async (context) => {
  const stores = {
    conversationStore: createConversationStore(':memory:'),
    curriculumStore: createCurriculumStore(':memory:'),
    schoolStore: createSchoolStore(':memory:'),
    trainingReviewStore: createTrainingReviewStore(':memory:'),
  };
  const credentials = parseApiCredentials(
    JSON.stringify([
      { token: TOKENS.student, role: 'student', subjectId: 'student-1' },
      { token: TOKENS.teacher, role: 'teacher', subjectId: 'teacher-1' },
      { token: TOKENS.admin, role: 'school-admin', subjectId: 'admin-1' },
    ])
  );
  const app = createApp({
    ...stores,
    apiCredentials: credentials,
    modelProvider: {
      identity: { id: 'slickk-llm' },
      runtime: { provider: 'test', model: 'test-model' },
      checkHealth: async () => ({ modelInstalled: true, installedModels: [] }),
    },
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Object.values(stores).forEach((store) => store.close());
  });

  const denied = await fetch(`${baseUrl}/api/training/reviews`, {
    headers: auth(TOKENS.student),
  });
  assert.equal(denied.status, 403);

  const queued = await fetch(`${baseUrl}/api/training/reviews`, {
    method: 'POST',
    headers: auth(TOKENS.teacher),
    body: JSON.stringify(candidate()),
  });
  assert.equal(queued.status, 201);

  const reviewed = await fetch(
    `${baseUrl}/api/training/reviews/review-api-example-1`,
    {
      method: 'PUT',
      headers: auth(TOKENS.teacher),
      body: JSON.stringify({
        decision: 'approved',
        checks: {
          factualGrounding: true,
          ageAppropriateness: true,
          teachingQuality: true,
          safety: true,
        },
        notes: 'Approved for the controlled training split.',
      }),
    }
  );
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).reviewed.status, 'educator-approved');

  const teacherExport = await fetch(`${baseUrl}/api/training/dataset`, {
    headers: auth(TOKENS.teacher),
  });
  assert.equal(teacherExport.status, 403);

  const adminExport = await fetch(`${baseUrl}/api/training/dataset`, {
    headers: auth(TOKENS.admin),
  });
  assert.equal(adminExport.status, 200);
  const payload = await adminExport.json();
  assert.equal(payload.dataset.exampleCount, 1);
  assert.equal(payload.dataset.examples[0].id, 'review-api-example-1');
});
