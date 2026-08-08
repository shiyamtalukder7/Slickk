const test = require('node:test');
const assert = require('node:assert/strict');

const {
  askTutor,
  streamTutor,
} = require('../src/services/tutor');
const {
  focusTopicFor,
} = require('../src/pedagogy/orchestrator');

function plan() {
  return {
    subjectKey: 'subject:mathematics',
    subjectFamily: 'mathematics',
    subject: 'Mathematics',
    focusTopic: 'Place Value',
    turnKind: 'question',
    lessonState: 'explanation',
    activeQuestion: '',
    needsClarification: false,
    verifiedMaterialContext: false,
    supportLevel: 0,
    signals: {
      confusion: false,
      understandingClaim: false,
      answerAttempt: false,
      needsClarification: false,
      practiceRequest: false,
    },
    relevantMemory: {
      subject: {
        masteryScore: 0.25,
        masteryEvidence: 0,
        lastTopic: '',
      },
      activeMisconceptions: [],
    },
    decision: {
      teachingAction: {
        kind: 'build-mental-connection',
        purpose:
          'Build a place-value connection.',
        requiredStructure: [
          'state the core meaning',
          'give one concrete example',
          'connect the example to the formal idea',
          'ask one evidence-producing question',
        ],
        forbidden: [
          'inventing sources',
        ],
      },
      learningTwinPolicy: {
        persistLearning: true,
        mayChangeMastery: false,
        mayCreateMisconception: false,
        topic: 'Place Value',
        skill: 'Building a mental connection',
        nextAction:
          'Answer the checking question.',
        confidence: 0.35,
        masteryDelta: 0,
      },
    },
  };
}

function requestData() {
  return {
    message:
      'Explain place value according to page 12 of my textbook.',
    studentName: 'Student',
    studentId: 'local-student',
    grade: 'Class 7',
    language: 'English',
    subject: 'Mathematics',
    channel: 'live',
    mode: 'adaptive',
    recentMessages: [],
    pedagogyPlan: plan(),
    curriculumEvidence: [],
  };
}

function badReply() {
  return (
    'According to page 12 of your textbook, ' +
    'place value is important.'
  );
}

function tutorJson(reply) {
  return JSON.stringify({
    reply,
    topic: 'Place Value',
    skill: 'Building a mental connection',
    misconception: '',
    nextAction:
      'Answer the checking question.',
    confidence: 0.7,
    masteryDelta: 0,
  });
}

test(
  'source locators do not become number concepts',
  () => {
    const subject = {
      label: 'Mathematics',
    };

    assert.equal(
      focusTopicFor(
        'Explain place value according to page 12 of my textbook.',
        '',
        subject
      ),
      'Place Value'
    );

    assert.equal(
      focusTopicFor(
        'Explain page 12 of my textbook.',
        '',
        subject
      ),
      'Mathematics'
    );

    assert.equal(
      focusTopicFor(
        'Explain the number 5.',
        '',
        subject
      ),
      'Number 5'
    );
  }
);

test(
  'non-streaming release gives Mindfulness fallback precedence',
  async () => {
    let calls = 0;
    const provider = {
      async generate() {
        calls += 1;

        return {
          content: tutorJson(badReply()),
          metrics: {
            provider: 'test',
          },
        };
      },
    };

    const result = await askTutor(
      requestData(),
      undefined,
      [],
      provider
    );

    assert.equal(calls, 2);
    assert.match(
      result.tutorResult.reply,
      /do not have a verified copy of page 12/i
    );
    assert.match(
      result.tutorResult.reply,
      /upload or photograph page 12/i
    );
    assert.doesNotMatch(
      result.tutorResult.reply,
      /repeat the full question|Number 12/i
    );
    assert.equal(
      result.tutorResult.evidenceVerified,
      false
    );
  }
);

test(
  'streaming release gives Mindfulness fallback precedence',
  async () => {
    let calls = 0;
    const released = [];
    const provider = {
      async stream({ onToken }) {
        calls += 1;
        const reply = badReply();

        if (typeof onToken === 'function') {
          await onToken(reply);
        }

        return {
          reply,
          content: reply,
          metrics: {
            provider: 'test',
          },
        };
      },
    };

    const result = await streamTutor(
      requestData(),
      undefined,
      async (token) => {
        released.push(token);
      },
      [],
      provider
    );

    assert.equal(calls, 2);
    assert.equal(released.length, 1);
    assert.equal(
      released[0],
      result.reply
    );
    assert.match(
      result.reply,
      /do not have a verified copy of page 12/i
    );
    assert.match(
      result.reply,
      /upload or photograph page 12/i
    );
    assert.doesNotMatch(
      result.reply,
      /repeat the full question|Number 12/i
    );
    assert.equal(
      result.learningTwin.evidenceVerified,
      false
    );
  }
);
