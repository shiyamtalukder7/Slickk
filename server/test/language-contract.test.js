const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditTutorLanguage,
  languageContractLines,
  normalizeTeachingLanguage,
} = require('../src/language/contract');

const {
  buildStreamingTutorSystemPrompt,
} = require('../src/prompts/tutor');

const {
  askTutor,
  streamTutor,
} = require('../src/services/tutor');

function requestData(overrides = {}) {
  return {
    message: '5',
    studentName: 'Ari',
    studentId: 'student-language-test',
    grade: 'Class 7',
    language: 'English',
    subject: 'Mathematics',
    channel: 'live',
    mode: 'adaptive',
    recentMessages: [],
    schoolName: 'Example School',
    schoolEiin: '',
    curriculumTrack: 'English Medium',
    curriculumTrackId: 'cambridge',
    enrolledSubjects: [
      'Mathematics',
      'English',
    ],
    qualificationStage: '',
    qualificationProvider: '',
    pedagogyPlan: {
      subject: 'Mathematics',
      subjectKey: 'mathematics',
      lessonState: 'diagnose',
      nextMove:
        'Ask what the number refers to.',
    },
    learnerMemory: [],
    curriculumEvidence: [],
    ...overrides,
  };
}

function structuredResult(reply) {
  return JSON.stringify({
    reply,
    topic: 'Numbers',
    skill: 'Clarifying context',
    misconception: '',
    nextAction:
      'Clarify what the number refers to.',
    confidence: 0.5,
    masteryDelta: 0,
  });
}

test(
  'normalizes supported teaching-language labels',
  () => {
    assert.equal(
      normalizeTeachingLanguage('English'),
      'english'
    );

    assert.equal(
      normalizeTeachingLanguage('\u09ac\u09be\u0982\u09b2\u09be'),
      'bangla'
    );

    assert.equal(
      normalizeTeachingLanguage(
        'English + \u09ac\u09be\u0982\u09b2\u09be'
      ),
      'bilingual'
    );

    assert.equal(
      normalizeTeachingLanguage('Banglish'),
      'banglish'
    );
  }
);

test(
  'English audit rejects Bangla script',
  () => {
    const audit =
      auditTutorLanguage(
        '\u098f\u099f\u09bf \u098f\u0995\u099f\u09bf \u09ac\u09be\u0982\u09b2\u09be \u0989\u09a4\u09cd\u09a4\u09b0\u0964',
        'English'
      );

    assert.equal(audit.ok, false);
    assert.equal(
      audit.code,
      'BANGLA_FOUND_IN_ENGLISH_RESPONSE'
    );
  }
);

test(
  'English audit accepts an English reply',
  () => {
    assert.equal(
      auditTutorLanguage(
        'What does the number 5 refer to?',
        'English'
      ).ok,
      true
    );
  }
);

test(
  'Bangla audit requires Bangla output',
  () => {
    assert.equal(
      auditTutorLanguage(
        'What does 5 refer to?',
        'Bangla'
      ).ok,
      false
    );

    assert.equal(
      auditTutorLanguage(
        '\u09eb \u09b8\u0982\u0996\u09cd\u09af\u09be\u099f\u09bf \u0995\u09cb\u09a8 \u09aa\u09cd\u09b0\u09b6\u09cd\u09a8\u09c7\u09b0 \u0989\u09a4\u09cd\u09a4\u09b0?',
        'Bangla'
      ).ok,
      true
    );
  }
);

test(
  'prompt contains an English-only contract',
  () => {
    const prompt =
      buildStreamingTutorSystemPrompt(
        requestData()
      );

    assert.match(
      prompt,
      /LANGUAGE OUTPUT CONTRACT/
    );

    assert.match(
      prompt,
      /English only/i
    );

    assert.match(
      prompt,
      /Do not use Bengali or Bangla-script/i
    );
  }
);

test(
  'generated tutor retries after wrong language',
  async () => {
    let calls = 0;

    const provider = {
      async generate() {
        calls += 1;

        const reply =
          calls === 1
            ? '\u098f\u099f\u09bf \u09ad\u09c1\u09b2 \u09ad\u09be\u09b7\u09be\u09b0 \u0989\u09a4\u09cd\u09a4\u09b0\u0964'
            : 'What does the number 5 refer to?';

        return {
          content:
            structuredResult(reply),
          metrics: {
            attempt: calls,
          },
        };
      },
    };

    const result =
      await askTutor(
        requestData(),
        undefined,
        [],
        provider
      );

    assert.equal(calls, 2);

    assert.equal(
      result.tutorResult.reply,
      'What does the number 5 refer to?'
    );

    assert.equal(
      result.languageAudit.ok,
      true
    );
  }
);

test(
  'streaming tutor releases only validated output',
  async () => {
    let calls = 0;
    const visibleTokens = [];

    const provider = {
      async stream({ onToken }) {
        calls += 1;

        const reply =
          calls === 1
            ? '\u098f\u099f\u09bf \u09ad\u09c1\u09b2 \u09ad\u09be\u09b7\u09be\u09b0 \u0989\u09a4\u09cd\u09a4\u09b0\u0964'
            : 'What does the number 5 refer to?';

        onToken(reply);

        return {
          reply,
          metrics: {
            attempt: calls,
          },
        };
      },
    };

    const result =
      await streamTutor(
        requestData(),
        undefined,
        (token) => {
          visibleTokens.push(token);
        },
        [],
        provider
      );

    assert.equal(calls, 2);

    assert.deepEqual(
      visibleTokens,
      [
        'What does the number 5 refer to?',
      ]
    );

    assert.equal(
      result.reply,
      'What does the number 5 refer to?'
    );
  }
);

test(
  'language contract lines remain deterministic',
  () => {
    const lines =
      languageContractLines('English');

    assert.ok(
      lines.some(
        (line) =>
          line.includes(
            'Authoritative teaching language'
          )
      )
    );
  }
);
