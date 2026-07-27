const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createTutorPlan,
  detectSubject,
  detectTurnKind,
  gradeBandFor,
} = require('../src/pedagogy/orchestrator');

test('subject router selects methods across the curriculum', () => {
  const cases = [
    ['Solve the fraction one half plus one fourth', 'mathematics'],
    ['Why do plant cells need chlorophyll?', 'science'],
    ['Help me improve the grammar in this sentence', 'language'],
    ['What caused the French Revolution?', 'humanities'],
    ['Why does this Python loop never stop?', 'computing'],
    ['How can rhythm change my music composition?', 'creative'],
    ['How do I calculate debit and credit entries?', 'business'],
    ['Explain the duty of care in tort law', 'law'],
    ['Why does this electrical circuit overheat?', 'engineering'],
    ['How does pharmacology study drug action?', 'health'],
  ];

  for (const [message, expectedKey] of cases) {
    assert.equal(
      detectSubject(message).key,
      expectedKey,
      message
    );
  }
});

test('explicit subjects remain distinct with a safe general fallback', () => {
  const subject = detectSubject(
    'Help me understand this field',
    [],
    'Marine Archaeology'
  );

  assert.equal(subject.label, 'Marine Archaeology');
  assert.equal(
    subject.key,
    'subject:marine-archaeology'
  );
  assert.equal(subject.family, 'general');
});

test('turn router distinguishes confusion from an answer', () => {
  assert.equal(
    detectTurnKind('I do not understand this step'),
    'confusion'
  );
  assert.equal(
    detectTurnKind('24', [
      {
        role: 'tutor',
        text: 'What is six times four?',
      },
    ]),
    'answer'
  );
});

test('grade adapter covers Grade 1 through university', () => {
  const cases = [
    ['Grade 1', 'early_primary'],
    ['Class 6', 'upper_primary'],
    ['Grade 9', 'secondary'],
    ['Grade 12', 'higher_secondary'],
    ['University undergraduate', 'university'],
    ['PhD', 'university'],
  ];

  for (const [grade, expectedBand] of cases) {
    assert.equal(
      gradeBandFor(grade).key,
      expectedBand,
      grade
    );
  }
});

test('orchestrator uses relevant learner support memory', () => {
  const plan = createTutorPlan({
    requestData: {
      message: 'I am confused by fractions',
      subject: 'Auto',
      grade: 'Grade 7',
    },
    history: [],
    learnerProfile: {
      totalTurns: 4,
      subjects: [
        {
          subjectKey: 'mathematics',
          supportLevel: 1,
          lastTopic: 'Fractions',
        },
      ],
      activeMisconceptions: [],
    },
  });

  assert.equal(plan.subjectKey, 'mathematics');
  assert.equal(plan.lessonState, 'scaffold');
  assert.equal(plan.supportLevel, 2);
  assert.equal(plan.gradeBand, 'secondary');
  assert.equal(plan.relevantMemory.subject.lastTopic, 'Fractions');
});
