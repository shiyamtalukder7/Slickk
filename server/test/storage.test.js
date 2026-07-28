const assert = require('node:assert/strict');
const {
  mkdtempSync,
  rmSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const {
  ConversationStoreError,
  createConversationStore,
  titleFromMessage,
} = require('../src/storage/conversations');

test('conversation store persists ordered local messages', (context) => {
  const store = createConversationStore(':memory:');
  context.after(() => store.close());

  const conversation = store.getOrCreateConversation({
    studentId: 'student-one',
    firstMessage: 'Teach me fractions',
  });

  store.saveMessage({
    conversationId: conversation.id,
    role: 'student',
    text: 'What is one half?',
  });
  store.saveMessage({
    conversationId: conversation.id,
    role: 'tutor',
    text: 'One half is one of two equal parts.',
  });

  const messages = store.getMessages(
    conversation.id,
    'student-one'
  );

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'student');
  assert.equal(messages[1].role, 'tutor');
  assert.equal(
    store.listConversations('student-one')[0].id,
    conversation.id
  );
});

test('conversation store isolates student conversations', (context) => {
  const store = createConversationStore(':memory:');
  context.after(() => store.close());

  const conversation = store.getOrCreateConversation({
    studentId: 'student-one',
    firstMessage: 'Private lesson',
  });

  assert.throws(
    () =>
      store.requireConversation(
        conversation.id,
        'student-two'
      ),
    (error) =>
      error instanceof ConversationStoreError &&
      error.code === 'CONVERSATION_FORBIDDEN'
  );
});

test('titleFromMessage produces a short readable title', () => {
  assert.equal(
    titleFromMessage('  Teach   me   subtraction  '),
    'Teach me subtraction'
  );
});

test('learner profile persists subject progress and support signals', (context) => {
  const store = createConversationStore(':memory:');
  context.after(() => store.close());
  const conversation = store.getOrCreateConversation({
    studentId: 'student-memory',
    firstMessage: 'I am confused by fractions',
  });

  const profile = store.recordLearningTurn({
    studentId: 'student-memory',
    studentName: 'Ari',
    grade: 'Grade 7',
    language: 'English',
    conversationId: conversation.id,
    pedagogyPlan: {
      subjectKey: 'mathematics',
      subject: 'Mathematics',
      lessonState: 'scaffold',
      turnKind: 'confusion',
      teachingMove: 'Use a smaller step.',
      supportLevel: 1,
      signals: {
        confusion: true,
        understandingClaim: false,
        answerAttempt: false,
      },
    },
    learningTwin: {
      topic: 'Fractions',
      skill: 'Equivalent fractions',
      misconception: '',
      nextAction: 'Compare two fraction bars.',
      confidence: 0.35,
      masteryDelta: 0,
    },
  });

  assert.equal(profile.studentName, 'Ari');
  assert.equal(profile.totalTurns, 1);
  assert.equal(profile.subjects[0].subjectKey, 'mathematics');
  assert.equal(profile.subjects[0].confusionSignals, 1);
  assert.equal(profile.subjects[0].supportLevel, 1);
  assert.equal(profile.subjects[0].lastTopic, 'Fractions');

  const assessed = store.recordAssessmentEvidence({
    studentId: 'student-memory',
    subjectKey: 'mathematics',
    observation: 'correct',
    hintsUsed: 1,
  });

  assert.equal(
    assessed.subjects[0].masteryEvidence,
    1
  );
  assert.equal(
    assessed.subjects[0].correctAnswers,
    1
  );
  assert.equal(assessed.subjects[0].hintsUsed, 1);
  assert.ok(
    assessed.subjects[0].masteryScore > 0.25
  );
  assert.ok(assessed.subjects[0].nextReviewAt);
});

test('education profile persists independently of learning progress', (context) => {
  const store = createConversationStore(':memory:');
  context.after(() => store.close());
  const saved = store.saveEducationProfile({
    studentId: 'student-profile',
    language: 'English + বাংলা',
    profile: {
      studentName: 'Nila',
      teachingLanguage: 'bilingual',
      curriculumTrack: 'nctb-english-version',
      grade: 'Class 5',
      school: {
        id: 'banbeis-123456',
        name: 'Example School',
        eiin: '123456',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        custom: false,
      },
      subjects: ['Mathematics', 'English'],
      setupComplete: true,
    },
  });

  assert.equal(saved.studentName, 'Nila');
  assert.equal(saved.language, 'English + বাংলা');
  assert.equal(saved.totalTurns, 0);
  assert.equal(
    saved.educationProfile.curriculumTrack,
    'nctb-english-version'
  );

  const conversation = store.getOrCreateConversation({
    studentId: 'student-profile',
    firstMessage: 'Teach me fractions',
  });

  store.recordLearningTurn({
    studentId: 'student-profile',
    studentName: 'Nila',
    grade: 'Class 5',
    language: 'English + বাংলা',
    conversationId: conversation.id,
    pedagogyPlan: {
      subjectKey: 'mathematics',
      subject: 'Mathematics',
      lessonState: 'explanation',
      turnKind: 'question',
      teachingMove: 'Explain one idea.',
      supportLevel: 0,
      signals: {
        confusion: false,
        understandingClaim: false,
        answerAttempt: false,
      },
    },
    learningTwin: {
      topic: 'Fractions',
      skill: 'Understanding',
      misconception: '',
      nextAction: 'Try one question.',
      confidence: 0.5,
      masteryDelta: 0,
    },
  });

  const afterTurn =
    store.getLearnerProfile('student-profile');

  assert.equal(afterTurn.totalTurns, 1);
  assert.equal(
    afterTurn.educationProfile.school.eiin,
    '123456'
  );
});

test('existing learner databases migrate without losing progress', (context) => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'slickk-profile-migration-')
  );
  const databasePath = path.join(directory, 'slickk.db');
  const legacy = new DatabaseSync(databasePath);

  legacy.exec(`
    CREATE TABLE learner_profiles (
      student_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      grade TEXT NOT NULL,
      language TEXT NOT NULL,
      total_turns INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    INSERT INTO learner_profiles (
      student_id,
      student_name,
      grade,
      language,
      total_turns,
      created_at,
      updated_at
    ) VALUES (
      'legacy-student',
      'Legacy Learner',
      'Class 6',
      'English',
      7,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
  `);
  legacy.close();

  const store = createConversationStore(databasePath);
  context.after(() => {
    store.close();
    rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const profile =
    store.getLearnerProfile('legacy-student');

  assert.equal(profile.studentName, 'Legacy Learner');
  assert.equal(profile.totalTurns, 7);
  assert.deepEqual(profile.educationProfile, {});
});
