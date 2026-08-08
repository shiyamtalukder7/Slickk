const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } =
  require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } =
  require('node:sqlite');

const {
  createConversationStore,
} = require('../src/storage/conversations');

function observation(overrides = {}) {
  return {
    evidenceKey: 'evidence-1',
    studentId: 'student-one',
    conversationId: 'conversation-one',
    subjectKey: 'subject:mathematics',
    subject: 'Mathematics',
    topic: 'Number 5',
    representation: 'worked-step',
    outcome: 'effective',
    source: 'verified-correct-answer',
    confidence: 1,
    verifiedEvidence: true,
    descriptiveOnly: true,
    metadata: {
      mayChangeMastery: false,
    },
    ...overrides,
  };
}

test(
  'teaching outcome memory is student topic and representation scoped',
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

    const before =
      store.getLearnerProfile(
        'student-one'
      );

    store.recordTeachingOutcome(
      observation({
        conversationId:
          conversation.id,
      })
    );
    store.recordTeachingOutcome(
      observation({
        conversationId:
          conversation.id,
      })
    );

    const memory =
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 5',
      });
    const otherStudent =
      store.getTeachingOutcomeMemory({
        studentId: 'student-two',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 5',
      });
    const otherTopic =
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 6',
      });
    const after =
      store.getLearnerProfile(
        'student-one'
      );

    assert.equal(memory.length, 1);
    assert.equal(
      memory[0].representation,
      'worked-step'
    );
    assert.equal(
      memory[0].effectiveCount,
      1
    );
    assert.equal(
      memory[0].descriptiveOnly,
      true
    );
    assert.deepEqual(otherStudent, []);
    assert.deepEqual(otherTopic, []);
    assert.equal(
      after.totalTurns,
      before.totalTurns
    );
    assert.deepEqual(
      after.subjects,
      before.subjects
    );
  }
);

test(
  'teaching outcome counts effective ineffective and unknown separately',
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
      observation({
        evidenceKey: 'effective-1',
        conversationId:
          conversation.id,
      })
    );
    store.recordTeachingOutcome(
      observation({
        evidenceKey: 'effective-2',
        conversationId:
          conversation.id,
      })
    );
    store.recordTeachingOutcome(
      observation({
        evidenceKey: 'ineffective-1',
        conversationId:
          conversation.id,
        outcome: 'ineffective',
        source: 'explicit-confusion',
        verifiedEvidence: false,
      })
    );
    store.recordTeachingOutcome(
      observation({
        evidenceKey: 'unknown-1',
        conversationId:
          conversation.id,
        outcome: 'unknown',
        source:
          'verified-incorrect-answer',
      })
    );

    const [memory] =
      store.getTeachingOutcomeMemory({
        studentId: 'student-one',
        subjectKey:
          'subject:mathematics',
        topic: 'Number 5',
      });

    assert.equal(
      memory.effectiveCount,
      2
    );
    assert.equal(
      memory.ineffectiveCount,
      1
    );
    assert.equal(
      memory.unknownCount,
      1
    );
    assert.equal(
      memory.decisiveCount,
      3
    );
    assert.equal(
      memory.effectivenessRate,
      0.667
    );
  }
);

test(
  'existing learner databases safely create the outcome table',
  (context) => {
    const folder = mkdtempSync(
      path.join(
        tmpdir(),
        'slickk-outcome-migration-'
      )
    );
    const databasePath =
      path.join(folder, 'learner.sqlite');
    let migrated = null;

    context.after(() => {
      if (migrated) {
        migrated.close();
      }

      rmSync(folder, {
        recursive: true,
        force: true,
      });
    });

    const first =
      createConversationStore(
        databasePath
      );
    const conversation =
      first.getOrCreateConversation({
        conversationId:
          'conversation-one',
        studentId: 'student-one',
        firstMessage:
          'Explain the number 5.',
      });
    first.close();

    const database =
      new DatabaseSync(databasePath);
    database.exec(
      'DROP TABLE teaching_outcome_events'
    );
    database.close();

    migrated =
      createConversationStore(
        databasePath
      );

    migrated.recordTeachingOutcome(
      observation({
        conversationId:
          conversation.id,
      })
    );

    assert.equal(
      migrated
        .getTeachingOutcomeMemory({
          studentId: 'student-one',
          subjectKey:
            'subject:mathematics',
          topic: 'Number 5',
        })
        .length,
      1
    );
  }
);
