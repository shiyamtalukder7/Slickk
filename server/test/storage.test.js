const assert = require('node:assert/strict');
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
