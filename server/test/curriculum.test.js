const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildFtsQuery,
  chunkPageText,
  createCurriculumStore,
  gradeBandPlacement,
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

test('exact classes can retrieve a shared upper-school placement', () => {
  assert.equal(
    gradeBandPlacement('Class 9'),
    'Class 9-10'
  );
  assert.equal(
    gradeBandPlacement('Class 12'),
    'Class 11-12'
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

test('curriculum search keeps grade and version placements isolated', () => {
  const store = createCurriculumStore(':memory:');

  try {
    store.importDocument(textbook());
    store.importDocument(
      textbook({
        sha256: 'bangla-version-hash',
        metadata: {
          ...textbook().metadata,
          title: 'Science Bangla Version',
          version: 'Bangla Version',
        },
      })
    );

    const results = store.search(
      'photosynthesis light',
      5,
      {
        curriculum: 'NCTB',
        version: 'English Version',
        grade: 'Class 7',
        subject: 'Science',
      }
    );

    assert.equal(results.length, 1);
    assert.equal(
      results[0].documentTitle,
      'Science for Class Seven'
    );
    assert.equal(
      store.search('photosynthesis', 5, {
        version: 'Bangla Version',
      })[0].documentTitle,
      'Science Bangla Version'
    );
  } finally {
    store.close();
  }
});

test('licensed books are visible only to the assigned school or student', () => {
  const store = createCurriculumStore(':memory:');
  const licensedBook = {
    sha256: 'licensed-cambridge-book',
    metadata: {
      title: 'Licensed Cambridge Mathematics',
      curriculum: 'Cambridge International',
      academicYear: '2026',
      grade: 'Class 7',
      subject: 'Mathematics',
      language: 'English',
      version: 'Cambridge Lower Secondary',
      sourceUrl: '',
      rights: 'licensed-user-copy',
      access: {
        schoolId: 'school-one',
      },
    },
    pages: [
      {
        pageNumber: 8,
        text: 'Algebraic expressions use variables to represent numbers.',
      },
    ],
  };

  try {
    const imported =
      store.importDocument(licensedBook);

    assert.equal(
      store.search('algebraic expressions', 5).length,
      0
    );
    assert.equal(store.listDocuments().length, 0);
    assert.equal(
      store.search('algebraic expressions', 5, {
        schoolId: 'school-two',
      }).length,
      0
    );
    assert.equal(
      store.search('algebraic expressions', 5, {
        schoolId: 'school-one',
      })[0].documentTitle,
      'Licensed Cambridge Mathematics'
    );
    assert.equal(
      store.listDocuments(100, {
        schoolId: 'school-one',
      }).length,
      1
    );

    const duplicate = store.importDocument({
      ...licensedBook,
      metadata: {
        ...licensedBook.metadata,
        access: {
          studentId: 'student-two',
        },
      },
    });

    assert.equal(duplicate.duplicate, true);
    assert.equal(
      store.search('algebraic expressions', 5, {
        studentId: 'student-two',
      }).length,
      1
    );
    assert.deepEqual(
      store
        .getDocumentEntitlements(
          imported.document.id
        )
        .map(
          (entitlement) =>
            `${entitlement.principalType}:${entitlement.principalId}`
        ),
      ['school:school-one', 'student:student-two']
    );
  } finally {
    store.close();
  }
});

test('licensed books require an explicit school or student entitlement', () => {
  const store = createCurriculumStore(':memory:');

  try {
    assert.throws(
      () =>
        store.importDocument({
          ...textbook(),
          sha256: 'unassigned-license',
          metadata: {
            ...textbook().metadata,
            rights: 'licensed-user-copy',
          },
        }),
      (error) =>
        error.code ===
        'DOCUMENT_ENTITLEMENT_REQUIRED'
    );
  } finally {
    store.close();
  }
});

test('Class 9 profile can retrieve a Class 9-10 syllabus PDF', () => {
  const store = createCurriculumStore(':memory:');

  try {
    store.importDocument({
      sha256: 'shared-grade-syllabus',
      metadata: {
        title: 'International Mathematics Specification',
        curriculum: 'Cambridge International',
        academicYear: '2026',
        grade: 'Class 9-10',
        subject: 'Mathematics',
        language: 'English',
        version: 'Cambridge IGCSE',
        sourceUrl:
          'https://www.cambridgeinternational.org/',
        rights: 'official-public',
      },
      pages: [
        {
          pageNumber: 4,
          text: 'Students develop algebraic reasoning and mathematical problem solving.',
        },
      ],
    });

    assert.equal(
      store.search('algebraic reasoning', 5, {
        curriculum: 'Cambridge International',
        grade: 'Class 9',
        subject: 'Mathematics',
      }).length,
      1
    );
  } finally {
    store.close();
  }
});

test('OCR evidence regions persist with student-scoped corrections', () => {
  const store = createCurriculumStore(':memory:');

  try {
    const imported = store.importDocument({
      ...textbook(),
      sha256: 'regional-evidence-book',
      pages: [
        {
          pageNumber: 7,
          text: 'The force is ten newtons.',
          regions: [
            {
              regionId: 'page-7-region-1',
              kind: 'equation',
              text: 'F = 10 N',
              originalText: 'F = l0 N',
              boundingBox: {
                x: 0.2,
                y: 0.3,
                width: 0.4,
                height: 0.1,
              },
              confidence: 0.78,
              source: 'ocr',
              safetyFindings: [],
            },
          ],
        },
      ],
    });
    const documentId = imported.document.id;

    assert.equal(
      store.listEvidenceRegions(documentId, 7)[0]
        .originalText,
      'F = l0 N'
    );

    store.correctEvidenceRegion({
      documentId,
      regionId: 'page-7-region-1',
      studentId: 'student-a',
      text: 'F = 10 N',
    });

    assert.equal(
      store.listEvidenceRegions(
        documentId,
        7,
        'student-a'
      )[0].text,
      'F = 10 N'
    );
    assert.equal(
      store.listEvidenceRegions(
        documentId,
        7,
        'student-b'
      )[0].text,
      'F = 10 N'
    );
    assert.equal(
      store.listEvidenceRegions(
        documentId,
        7,
        'student-b'
      )[0].correction,
      null
    );
  } finally {
    store.close();
  }
});
