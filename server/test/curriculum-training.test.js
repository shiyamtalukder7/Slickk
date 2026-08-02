const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createCurriculumStore,
} = require('../src/storage/curriculum');

function document(rights, suffix) {
  return {
    sha256: `training-book-${suffix}`,
    metadata: {
      title: `Training Book ${suffix}`,
      curriculum: 'Example curriculum',
      academicYear: '2026',
      grade: 'Class 7',
      subject: 'Science',
      language: 'English',
      version: 'First edition',
      sourceUrl: 'https://example.edu/book.pdf',
      rights,
      ...(rights === 'licensed-user-copy'
        ? {
            access: {
              studentId: 'student-1',
            },
          }
        : {}),
    },
    pages: [
      {
        pageNumber: 1,
        text:
          'A controlled experiment changes one independent variable while observing a dependent variable.',
      },
    ],
  };
}

test('curriculum training export includes only explicitly reusable rights', () => {
  const store = createCurriculumStore(':memory:');

  try {
    store.importDocument(
      document('open-license', 'open')
    );
    store.importDocument(
      document('official-public', 'official')
    );
    store.importDocument(
      document('licensed-user-copy', 'licensed')
    );

    const sources = store.listTrainingSources();
    const inventory = store.getTrainingInventory();

    assert.equal(sources.length, 1);
    assert.equal(sources[0].rights, 'open-license');
    assert.match(sources[0].content, /controlled experiment/i);
    assert.equal(
      inventory.find(
        (item) => item.rights === 'official-public'
      ).trainingEligible,
      false
    );
    assert.equal(
      inventory.find(
        (item) => item.rights === 'licensed-user-copy'
      ).trainingEligible,
      false
    );
  } finally {
    store.close();
  }
});
