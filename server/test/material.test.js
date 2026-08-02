const assert = require('node:assert/strict');
const test = require('node:test');

const {
  analyzeMaterialBuffer,
} = require('../src/documents/material');

test('plain-text materials are privately indexed with evidence', async () => {
  let imported;
  const result = await analyzeMaterialBuffer({
    buffer: Buffer.from(
      'Photosynthesis uses light energy.'
    ),
    mimeType: 'text/plain',
    fileName: 'science.txt',
    studentId: 'student-1',
    profile: {
      grade: 'Class 6',
      teachingLanguage: 'English',
    },
    store: {
      importDocument(input) {
        imported = input;
        return {
          document: { id: 'document-1' },
          duplicate: false,
        };
      },
    },
  });

  assert.equal(result.kind, 'text');
  assert.equal(
    imported.metadata.access.studentId,
    'student-1'
  );
  assert.equal(
    imported.pages[0].regions[0].pageNumber,
    1
  );
});

test('unsupported office files return a clear media error', async () => {
  await assert.rejects(
    analyzeMaterialBuffer({
      buffer: Buffer.from('office-file'),
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'notes.docx',
      studentId: 'student-1',
      store: {},
    }),
    (error) =>
      error.code === 'UNSUPPORTED_MATERIAL_TYPE' &&
      error.status === 415
  );
});
