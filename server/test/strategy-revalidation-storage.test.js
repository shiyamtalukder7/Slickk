const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createConversationStore,
} = require('../src/storage/conversations');

const DAY =
  24 * 60 * 60 * 1000;

function outcome({
  evidenceKey,
  conversationId,
  representation = 'worked-step',
  result = 'effective',
}) {
  return {
    evidenceKey,
    studentId: 'student-one',
    conversationId,
    subjectKey:
      'subject:mathematics',
    subject: 'Mathematics',
    topic: 'Number 5',
    representation,
    outcome: result,
    source:
      result === 'effective'
        ? 'verified-correct-answer'
        : 'explicit-confusion',
    confidence: 1,
    verifiedEvidence:
      result === 'effective',
    descriptiveOnly: true,
    metadata: {
      mayChangeMastery: false,
      mayCreateMisconception: false,
    },
  };
}

test(
  'storage preserves lifetime counts while exposing a bounded recent window',
  (context) => {
    const store =
      createConversationStore(':memory:');
    context.after(() => store.close());

    const conversation =
      store.getOrCreateConversation({
        conversationId:
          'conversation-one',
        studentId: 'student-one',
        firstMessage:
          'Explain the number 5.',
      });

    store.recordTeachingOutcome(
      outcome({
        evidenceKey: 'effective-1',
        conversationId:
          conversation.id,
      })
    );
    store.recordTeachingOutcome(
      outcome({
        evidenceKey: 'effective-2',
        conversationId:
          conversation.id,
      })
    );

    const [fresh] =
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 5',
        now: Date.now(),
      });
    const [stale] =
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 5',
        now: Date.now() + 31 * DAY,
      });

    assert.equal(
      fresh.effectiveCount,
      2
    );
    assert.equal(
      fresh.recentEffectiveCount,
      2
    );
    assert.equal(
      fresh.revalidationStatus,
      'fresh-positive'
    );
    assert.equal(
      fresh.revalidationEligible,
      true
    );

    assert.equal(
      stale.effectiveCount,
      2
    );
    assert.equal(
      stale.recentEffectiveCount,
      0
    );
    assert.equal(
      stale.revalidationStatus,
      'stale'
    );
    assert.equal(
      stale.revalidationEligible,
      false
    );
  }
);

test(
  'storage marks balanced recent outcomes as conflicted',
  (context) => {
    const store =
      createConversationStore(':memory:');
    context.after(() => store.close());

    const conversation =
      store.getOrCreateConversation({
        conversationId:
          'conversation-conflict',
        studentId: 'student-one',
        firstMessage:
          'Explain the number 5.',
      });

    store.recordTeachingOutcome(
      outcome({
        evidenceKey:
          'analogy-effective',
        conversationId:
          conversation.id,
        representation: 'analogy',
        result: 'effective',
      })
    );
    store.recordTeachingOutcome(
      outcome({
        evidenceKey:
          'analogy-ineffective',
        conversationId:
          conversation.id,
        representation: 'analogy',
        result: 'ineffective',
      })
    );

    const memory =
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 5',
      });
    const analogy =
      memory.find(
        (item) =>
          item.representation ===
          'analogy'
      );

    assert.ok(analogy);
    assert.equal(
      analogy.recentDecisiveCount,
      2
    );
    assert.equal(
      analogy.conflictingEvidence,
      true
    );
    assert.equal(
      analogy.revalidationConfidence,
      0
    );
    assert.equal(
      analogy.revalidationStatus,
      'conflicted'
    );
    assert.equal(
      analogy.revalidationEligible,
      false
    );
  }
);

test(
  'revalidation memory remains student subject and topic scoped',
  (context) => {
    const store =
      createConversationStore(':memory:');
    context.after(() => store.close());

    const conversation =
      store.getOrCreateConversation({
        conversationId:
          'conversation-scope',
        studentId: 'student-one',
        firstMessage:
          'Explain the number 5.',
      });

    store.recordTeachingOutcome(
      outcome({
        evidenceKey:
          'scope-effective-1',
        conversationId:
          conversation.id,
      })
    );
    store.recordTeachingOutcome(
      outcome({
        evidenceKey:
          'scope-effective-2',
        conversationId:
          conversation.id,
      })
    );

    assert.equal(
      store.getTeachingOutcomeMemory({
        studentId: 'student-two',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 5',
      }).length,
      0
    );
    assert.equal(
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:science',
        topic: 'Number 5',
      }).length,
      0
    );
    assert.equal(
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 6',
      }).length,
      0
    );
  }
);
