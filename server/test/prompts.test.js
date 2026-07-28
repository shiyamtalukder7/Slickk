const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildStreamingTutorSystemPrompt,
} = require('../src/prompts/tutor');

function liveRequest(overrides = {}) {
  return {
    studentName: 'Student',
    grade: 'Grade 7-8',
    language: 'English',
    subject: 'Auto',
    channel: 'live',
    mode: 'adaptive',
    pedagogyPlan: {
      subject: 'Mathematics',
      lessonState: 'scaffold',
      subjectMethod: 'Use meaning before calculation.',
      evidenceCheck: 'Ask for the next reasoning step.',
    },
    learnerMemory: {
      subject: {
        lastTopic: 'Fractions',
        supportLevel: 2,
      },
    },
    curriculumEvidence: [
      {
        citationId: 'source-1',
        documentTitle: 'Primary Mathematics',
        curriculum: 'NCTB',
        academicYear: '2026',
        grade: 'Class 3',
        subject: 'Mathematics',
        language: 'English',
        version: 'English Version',
        page: 21,
        content: 'Subtraction means taking away.',
      },
    ],
    ...overrides,
  };
}

test('live tutor prompt uses an adaptive private-teacher loop', () => {
  const prompt = buildStreamingTutorSystemPrompt(
    liveRequest()
  );

  assert.match(
    prompt,
    /react to that exact answer/i
  );
  assert.match(
    prompt,
    /ask exactly one natural checking question/i
  );
  assert.match(
    prompt,
    /student has space to answer/i
  );
  assert.match(
    prompt,
    /make the next question easier/i
  );
});

test('live tutor prompt requires voice-safe prose', () => {
  const prompt = buildStreamingTutorSystemPrompt(
    liveRequest()
  );

  assert.match(prompt, /plain spoken prose only/i);
  assert.match(prompt, /never use Markdown/i);
  assert.match(
    prompt,
    /three times four.*asterisk/i
  );
});

test('tutor prompt receives subject plan and relevant memory', () => {
  const prompt = buildStreamingTutorSystemPrompt(
    liveRequest()
  );

  assert.match(prompt, /PEDAGOGY_PLAN_DATA=/);
  assert.match(prompt, /RELEVANT_LEARNER_MEMORY_DATA=/);
  assert.match(prompt, /Mathematics/);
  assert.match(prompt, /Fractions/);
  assert.match(prompt, /require evidence/i);
});

test('tutor prompt grounds answers without inventing citations', () => {
  const prompt = buildStreamingTutorSystemPrompt(
    liveRequest()
  );

  assert.match(prompt, /CURRICULUM_EVIDENCE_DATA=/);
  assert.match(prompt, /Primary Mathematics/);
  assert.match(prompt, /"page":21/);
  assert.match(prompt, /Never invent a book title/i);
  assert.match(prompt, /Do not speak citation IDs/i);
});
