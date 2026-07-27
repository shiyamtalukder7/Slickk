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
