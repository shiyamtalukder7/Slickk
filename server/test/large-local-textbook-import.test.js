'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MAX_PDF_BYTES,
  validatePdfBuffer,
} = require('../src/documents/pdf');

const {
  ABSOLUTE_LOCAL_TEXTBOOK_MAX_MB,
  DEFAULT_LOCAL_TEXTBOOK_MAX_MB,
  resolveLocalTextbookMaximumBytes,
} = require('../src/documents/import-limits');

const {
  importPdfBuffer,
} = require('../src/documents/importer');

function pdfBuffer(length) {
  const buffer = Buffer.alloc(length);
  buffer.write('%PDF-', 0, 'ascii');
  return buffer;
}

function metadata() {
  return {
    title: 'Large licensed textbook',
    curriculum: 'Pearson Edexcel',
    academicYear: '2026-2027',
    grade: 'Grade 8',
    subject: 'Chemistry',
    language: 'English',
    version: 'International GCSE (9-1)',
    sourceUrl: 'https://example.invalid/licensed-copy',
    rights: 'licensed-user-copy',
    access: {
      schoolId: '',
      studentId: 'local-student',
    },
  };
}

test(
  'ordinary PDF validation keeps the original 40 MB default',
  () => {
    assert.equal(
      DEFAULT_MAX_PDF_BYTES,
      40 * 1024 * 1024
    );
  }
);

test(
  'explicit local textbook CLI limit defaults to 256 MB and is hard-bounded',
  () => {
    assert.equal(
      DEFAULT_LOCAL_TEXTBOOK_MAX_MB,
      256
    );
    assert.equal(
      ABSOLUTE_LOCAL_TEXTBOOK_MAX_MB,
      512
    );
    assert.equal(
      resolveLocalTextbookMaximumBytes(),
      256 * 1024 * 1024
    );
    assert.equal(
      resolveLocalTextbookMaximumBytes('300'),
      300 * 1024 * 1024
    );

    assert.throws(
      () =>
        resolveLocalTextbookMaximumBytes('513'),
      (error) =>
        error?.code ===
        'PDF_LOCAL_LIMIT_INVALID'
    );
  }
);

test(
  'custom maximumBytes reaches both validation and page extraction',
  async () => {
    const buffer = pdfBuffer(2048);

    assert.throws(
      () =>
        validatePdfBuffer(buffer, 1024),
      (error) =>
        error?.code === 'PDF_TOO_LARGE'
    );

    let receivedMaximumBytes = null;

    const store = {
      findDocumentByHash() {
        return null;
      },
      importDocument(input) {
        return {
          document: {
            id: 'doc-large-local',
            pageCount: input.pageCount,
            rights: input.metadata.rights,
          },
          duplicate: false,
          replaced: false,
          entitlements: [
            {
              studentId: 'local-student',
            },
          ],
        };
      },
    };

    const result = await importPdfBuffer({
      buffer,
      metadata: metadata(),
      maximumBytes: 4096,
      store,
      extractPages: async (
        _buffer,
        options
      ) => {
        receivedMaximumBytes =
          options?.maximumBytes;

        return {
          pageCount: 1,
          pages: [
            {
              pageNumber: 1,
              text:
                'This page already has meaningful native PDF text.',
            },
          ],
          sha256:
            'test-sha256-large-local',
        };
      },
      recognizePages: async () => {
        throw new Error(
          'OCR must not run for a native-text test page.'
        );
      },
    });

    assert.equal(
      receivedMaximumBytes,
      4096
    );
    assert.equal(
      result.document.id,
      'doc-large-local'
    );
    assert.equal(
      result.ocrPageCount,
      0
    );
  }
);
