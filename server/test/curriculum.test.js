const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildFtsQuery,
  chunkPageText,
  createCurriculumStore,
} = require('../src/storage/curriculum');

function textbook(overrides = {}) {
  return {
    sha256: 'test-book-hash',
    metadata: {
      title: 'Science for Class Seven',
      curriculum: 'NCTB',
      academicYear: '2026',
      grade: 'Class 7',
      subject: 'Science',
      language: 'English',
      version: 'English Version',
      sourceUrl: 'https://nctb.gov.bd/example.pdf',
      rights: 'official-public',
    },
    pages: [
      {
        pageNumber: 12,
        text: 'Photosynthesis uses light energy. Chlorophyll helps plants absorb light.',
      },
      {
        pageNumber: 13,
        text: 'Respiration releases energy from food.',
      },
    ],
    ...overrides,
  };
}

test('page chunks stay bounded and retain overlap', () => {
  const text = 'x'.repeat(250);
  const chunks = chunkPageText(text, 120, 20);

  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
  assert.equal(chunks[0].slice(-20), chunks[1].slice(0, 20));
});

test('textbook search query supports English and Bangla terms', () => {
  assert.equal(
    buildFtsQuery('Please explain photosynthesis to me'),
    '"photosynthesis"'
  );
  assert.match(
    buildFtsQuery('আমাকে সালোকসংশ্লেষণ বোঝাও'),
    /সালোকসংশ্লেষণ/
  );
});

test('curriculum store returns the exact source page', () => {
  const store = createCurriculumStore(':memory:');

  try {
    const imported = store.importDocument(textbook());
    const results = store.search(
      'How does chlorophyll absorb light?',
      3
    );

    assert.equal(imported.duplicate, false);
    assert.equal(imported.document.pageCount, 13);
    assert.equal(results[0].documentTitle, 'Science for Class Seven');
    assert.equal(results[0].page, 12);
    assert.match(results[0].excerpt, /Chlorophyll/);
    assert.equal(
      store.findDocumentByHash(
        'test-book-hash'
      ).id,
      imported.document.id
    );
  } finally {
    store.close();
  }
});

test('curriculum store detects duplicates and requires rights', () => {
  const store = createCurriculumStore(':memory:');

  try {
    store.importDocument(textbook());

    assert.equal(
      store.importDocument(textbook()).duplicate,
      true
    );
    assert.throws(
      () =>
        store.importDocument(
          textbook({
            sha256: 'unlicensed-book-hash',
            metadata: {
              ...textbook().metadata,
              rights: '',
            },
          })
        ),
      /rights must be confirmed/i
    );
  } finally {
    store.close();
  }
});

test('curriculum store safely replaces a corrected OCR import', () => {
  const store = createCurriculumStore(':memory:');

  try {
    store.importDocument(textbook());
    const replacement = store.importDocument({
      ...textbook(),
      replace: true,
      pages: [
        {
          pageNumber: 12,
          text: 'A triangle has three sides.',
        },
      ],
    });

    assert.equal(replacement.replaced, true);
    assert.equal(
      store.search('photosynthesis', 3).length,
      0
    );
    assert.equal(
      store.search('triangle sides', 3)[0].page,
      12
    );
    assert.equal(store.listDocuments().length, 1);
  } finally {
    store.close();
  }
});
