const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const test = require('node:test');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

test('gateway streams and persists the mobile tutor contract', async (context) => {
  const fakeOllama = createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          models: [{ name: 'slickk-tutor-3b-backup:latest' }],
        })
      );
      return;
    }

    if (request.url === '/api/chat') {
      const body = await readRequestBody(request);

      if (body.stream) {
        response.setHeader(
          'Content-Type',
          'application/x-ndjson'
        );
        response.write(
          `${JSON.stringify({
            message: { content: 'Seven' },
            done: false,
          })}\n`
        );
        response.write(
          `${JSON.stringify({
            message: { content: ' apples remain.' },
            done: false,
          })}\n`
        );
        response.end(
          `${JSON.stringify({
            message: { content: '' },
            done: true,
            done_reason: 'stop',
            total_duration: 2_000_000_000,
            load_duration: 100_000_000,
            prompt_eval_count: 100,
            eval_count: 20,
            eval_duration: 1_000_000_000,
          })}\n`
        );
        return;
      }

      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: JSON.stringify({
              reply: 'Two plus two equals four.',
              topic: 'Arithmetic',
              skill: 'Addition',
              misconception: '',
              nextAction: 'What is three plus two?',
              confidence: 0.8,
              masteryDelta: 1,
            }),
          },
          done: true,
          done_reason: 'stop',
          total_duration: 2_000_000_000,
          load_duration: 100_000_000,
          prompt_eval_count: 100,
          eval_count: 20,
          eval_duration: 1_000_000_000,
        })
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });

  const ollamaPort = await listen(fakeOllama);
  process.env.OLLAMA_URL = `http://127.0.0.1:${ollamaPort}`;
  process.env.OLLAMA_MODEL = 'slickk-tutor-3b-backup';

  const { createApp } = require('../src/app');
  const {
    createConversationStore,
  } = require('../src/storage/conversations');
  const {
    createCurriculumStore,
  } = require('../src/storage/curriculum');
  const {
    createSchoolStore,
  } = require('../src/storage/schools');
  const conversationStore =
    createConversationStore(':memory:');
  const curriculumStore =
    createCurriculumStore(':memory:');
  const schoolStore = createSchoolStore(':memory:');
  schoolStore.importSchools([
    {
      id: 'banbeis-123456',
      eiin: '123456',
      name: 'EXAMPLE SCHOOL',
      district: 'DHAKA',
      upazila: 'DHANMONDI',
      address: 'DHAKA',
      source: 'BANBEIS institute directory',
      sourceYear: '2015',
      sourceUrl: 'https://banbeis.gov.bd/schools.pdf',
    },
  ]);
  curriculumStore.importDocument({
    sha256: 'integration-textbook-hash',
    metadata: {
      title: 'Primary Mathematics',
      curriculum: 'NCTB',
      academicYear: '2026',
      grade: 'Class 3',
      subject: 'Mathematics',
      language: 'English',
      version: 'English Version',
      sourceUrl: 'https://nctb.gov.bd/math.pdf',
      rights: 'official-public',
    },
    pages: [
      {
        pageNumber: 21,
        text: 'What is 12 minus 5? Subtraction means taking one quantity away from another.',
      },
    ],
  });
  curriculumStore.importDocument({
    sha256: 'integration-licensed-book-hash',
    metadata: {
      title: 'Licensed International Mathematics',
      curriculum: 'Cambridge International',
      academicYear: '2026',
      grade: 'Class 3',
      subject: 'Mathematics',
      language: 'English',
      version: 'Cambridge Primary',
      sourceUrl: '',
      rights: 'licensed-user-copy',
      access: {
        schoolId: 'banbeis-123456',
      },
    },
    pages: [
      {
        pageNumber: 9,
        text: 'Place value describes the value of a digit according to its position.',
      },
    ],
  });
  const gateway = createServer(
    createApp({
      conversationStore,
      curriculumStore,
      schoolStore,
    })
  );
  const gatewayPort = await listen(gateway);

  context.after(async () => {
    conversationStore.close();
    curriculumStore.close();
    schoolStore.close();
    await close(gateway);
    await close(fakeOllama);
  });

  const healthResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/health`
  );
  const health = await healthResponse.json();

  assert.equal(healthResponse.status, 200);
  assert.equal(health.ok, true);

  const localSessionResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/session`
  );
  const localSession =
    await localSessionResponse.json();

  assert.equal(localSessionResponse.status, 200);
  assert.equal(localSession.role, 'local');
  assert.equal(
    localSession.subjectId,
    'local-student'
  );

  const optionsResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/profile-options`
  );
  const options = await optionsResponse.json();

  assert.equal(optionsResponse.status, 200);
  assert.equal(options.grades.length, 12);
  assert.equal(options.schoolDirectory.schoolCount, 119);
  assert.equal(
    options.schoolDirectory.englishMediumSchoolCount,
    118
  );

  const pathwaysResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/curricula/english-medium`
  );
  const pathways = await pathwaysResponse.json();

  assert.equal(pathwaysResponse.status, 200);
  assert.equal(pathways.pathways.length, 3);
  assert.match(
    pathways.contentPolicy.licensedTextbooks,
    /assigned school or student/i
  );

  const schoolsResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/schools/search?q=Example`
  );
  const schools = await schoolsResponse.json();

  assert.equal(schoolsResponse.status, 200);
  assert.equal(schools.schools[0].eiin, '123456');

  const profileResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/students/local-student/profile`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentName: 'Ari',
        teachingLanguage: 'english',
        curriculumTrack: 'nctb-english-version',
        grade: 'Class 3',
        school: {
          id: 'banbeis-123456',
          name: 'EXAMPLE SCHOOL',
          eiin: '123456',
          district: 'DHAKA',
          upazila: 'DHANMONDI',
          custom: false,
        },
        subjects: ['Mathematics', 'English'],
        setupComplete: true,
      }),
    }
  );
  const savedProfile = await profileResponse.json();

  assert.equal(profileResponse.status, 200);
  assert.equal(
    savedProfile.profile.curriculumTrack,
    'nctb-english-version'
  );

  const publicDocumentsResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/documents`
  );
  const publicDocuments =
    await publicDocumentsResponse.json();
  const studentDocumentsResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/documents?studentId=local-student`
  );
  const studentDocuments =
    await studentDocumentsResponse.json();

  assert.equal(publicDocuments.documents.length, 1);
  assert.equal(studentDocuments.documents.length, 2);

  const materialResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/students/local-student/materials/analyze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Material-Name': encodeURIComponent(
          'science-notes.txt'
        ),
        'X-Material-Type': 'text/plain',
      },
      body: Buffer.from(
        'Evaporation changes liquid water into water vapour.'
      ),
    }
  );
  const material = await materialResponse.json();

  assert.equal(materialResponse.status, 201);
  assert.equal(material.result.kind, 'text');
  assert.equal(material.result.pageCount, 1);
  assert.match(
    material.result.previewText,
    /Evaporation/
  );
  assert.equal(
    materialResponse.headers.get(
      'x-content-type-options'
    ),
    'nosniff'
  );

  const privateDocumentsResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/documents?studentId=local-student`
  );
  const privateDocuments =
    await privateDocumentsResponse.json();

  assert.equal(privateDocuments.documents.length, 3);

  const tutorResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/tutor`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'What is 2 + 2?',
        grade: 'Grade 7-8',
      }),
    }
  );
  const tutor = await tutorResponse.json();
  const conversationId = tutor.metadata.conversationId;

  assert.equal(tutorResponse.status, 200);
  assert.equal(tutor.reply, 'Two plus two equals four.');
  assert.equal(tutor.learningTwin.topic, 'Arithmetic');
  assert.match(conversationId, /^[0-9a-f-]{36}$/i);

  const streamResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/tutor/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'What is 12 minus 5?',
        conversationId,
      }),
    }
  );
  const streamEvents = (await streamResponse.text())
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));

  assert.equal(streamResponse.status, 200);
  assert.equal(streamEvents[0].type, 'start');
  assert.equal(streamEvents[0].grounded, true);
  assert.equal(
    streamEvents
      .filter((event) => event.type === 'token')
      .map((event) => event.content)
      .join(''),
    'Seven apples remain.'
  );
  assert.equal(
    streamEvents.at(-1).conversationId,
    conversationId
  );
  assert.equal(streamEvents.at(-1).type, 'complete');
  assert.equal(
    streamEvents.at(-1).citations[0].documentTitle,
    'Primary Mathematics'
  );
  assert.equal(streamEvents.at(-1).citations[0].page, 21);
  assert.equal(
    streamEvents.at(-1).metadata.grounding,
    'curriculum'
  );
  assert.equal(
    streamEvents[0].subject,
    'Mathematics'
  );
  assert.equal(
    streamEvents.at(-1).learnerProfile.totalTurns,
    2
  );
  assert.equal(
    streamEvents.at(-1).learnerProfile.educationProfile
      .grade,
    'Class 3'
  );

  const progressResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/students/local-student/progress`
  );
  const progress = await progressResponse.json();

  assert.equal(progressResponse.status, 200);
  assert.equal(progress.profile.totalTurns, 2);
  assert.equal(
    progress.profile.educationProfile.school.eiin,
    '123456'
  );
  assert.equal(
    progress.profile.subjects[0].subjectKey,
    'mathematics'
  );
  assert.equal(
    progress.profile.subjects[0].turns,
    2
  );

  const messagesResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/conversations/${conversationId}/messages`
  );
  const stored = await messagesResponse.json();

  assert.equal(messagesResponse.status, 200);
  assert.equal(stored.messages.length, 4);
  assert.deepEqual(
    stored.messages.map((message) => message.role),
    ['student', 'tutor', 'student', 'tutor']
  );

  const searchResponse = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/documents/search`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'subtraction quantity',
      }),
    }
  );
  const search = await searchResponse.json();

  assert.equal(searchResponse.status, 200);
  assert.equal(search.results[0].page, 21);
  assert.equal('content' in search.results[0], false);
});

test('student credentials cannot tutor as another student', async (context) => {
  const token =
    'student-one-development-token-123456';

  const { createApp } = require('../src/app');
  const {
    parseApiCredentials,
  } = require('../src/security/api');
  const {
    createConversationStore,
  } = require('../src/storage/conversations');
  const {
    createCurriculumStore,
  } = require('../src/storage/curriculum');
  const {
    createSchoolStore,
  } = require('../src/storage/schools');

  const conversationStore =
    createConversationStore(':memory:');
  const curriculumStore =
    createCurriculumStore(':memory:');
  const schoolStore =
    createSchoolStore(':memory:');

  const apiCredentials = parseApiCredentials(
    JSON.stringify([
      {
        token,
        role: 'student',
        subjectId: 'student-1',
      },
    ])
  );

  const modelProvider = {
    runtime: {
      provider: 'test',
      model: 'test-model',
    },
    identity: {
      id: 'slickk-test-runtime',
    },
  };

  const gateway = createServer(
    createApp({
      modelProvider,
      conversationStore,
      curriculumStore,
      schoolStore,
      apiCredentials,
    })
  );

  const gatewayPort = await listen(gateway);

  const unauthenticatedSessionResponse =
    await fetch(
      `http://127.0.0.1:${gatewayPort}/api/session`
    );
  const unauthenticatedSession =
    await unauthenticatedSessionResponse.json();

  assert.equal(
    unauthenticatedSessionResponse.status,
    401
  );
  assert.equal(
    unauthenticatedSession.code,
    'AUTHENTICATION_REQUIRED'
  );

  const authenticatedSessionResponse =
    await fetch(
      `http://127.0.0.1:${gatewayPort}/api/session`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  const authenticatedSession =
    await authenticatedSessionResponse.json();

  assert.equal(
    authenticatedSessionResponse.status,
    200
  );
  assert.equal(
    authenticatedSession.role,
    'student'
  );
  assert.equal(
    authenticatedSession.subjectId,
    'student-1'
  );

  context.after(async () => {
    await close(gateway);
    conversationStore.close();
    curriculumStore.close();
    schoolStore.close();
  });

  for (const route of [
    '/api/tutor',
    '/api/tutor/stream',
  ]) {
    const response = await fetch(
      `http://127.0.0.1:${gatewayPort}${route}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message:
            'Attempt to access another student.',
          studentId: 'student-2',
        }),
      }
    );

    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(
      payload.code,
      'STUDENT_ACCESS_DENIED'
    );
  }
});
