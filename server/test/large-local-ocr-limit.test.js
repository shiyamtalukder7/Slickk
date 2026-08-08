'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MAX_PDF_BYTES,
} = require('../src/documents/pdf');

const {
  ocrPdfPages,
} = require('../src/documents/ocr');

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
    title: 'Large licensed scanned textbook',
    curriculum: 'Pearson Edexcel',
    academicYear: '2026-2027',
    grade: 'Grade 8',
    subject: 'Chemistry',
    language: 'English',
    version: 'International GCSE (9-1) 4CH1',
    sourceUrl: 'https://example.invalid/licensed-copy',
    rights: 'licensed-user-copy',
    access: {
      schoolId: '',
      studentId: 'local-student',
    },
  };
}

test(
  'ordinary OCR validation keeps the original 40 MB default',
  () => {
    assert.equal(
      DEFAULT_MAX_PDF_BYTES,
      40 * 1024 * 1024
    );
  }
);

test(
  'OCR accepts the explicit local textbook maximumBytes override',
  async () => {
    const buffer = pdfBuffer(2048);

    await assert.rejects(
      () =>
        ocrPdfPages(buffer, {
          pageNumbers: [],
          maximumBytes: 1024,
          parserFactory() {
            throw new Error(
              'Parser must not run after failed size validation.'
            );
          },
        }),
      (error) =>
        error?.code === 'PDF_TOO_LARGE'
    );

    let parserCreated = false;
    let parserDestroyed = false;

    const result = await ocrPdfPages(buffer, {
      pageNumbers: [],
      maximumBytes: 4096,
      parserFactory() {
        parserCreated = true;

        return {
          async getInfo() {
            return {
              total: 1,
            };
          },
          async destroy() {
            parserDestroyed = true;
          },
        };
      },
    });

    assert.equal(parserCreated, true);
    assert.equal(parserDestroyed, true);
    assert.equal(result.pageCount, 1);
    assert.deepEqual(result.pages, []);
  }
);

test(
  'importer forwards the same maximumBytes authorization into OCR',
  async () => {
    const buffer = pdfBuffer(2048);
    let receivedMaximumBytes = null;

    const store = {
      findDocumentByHash() {
        return null;
      },
      importDocument(input) {
        return {
          document: {
            id: 'doc-large-scanned-local',
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
        assert.equal(
          options?.maximumBytes,
          4096
        );

        return {
          pageCount: 1,
          pages: [
            {
              pageNumber: 1,
              text: '',
            },
          ],
          sha256:
            'test-sha256-large-scanned-local',
        };
      },
      recognizePages: async (
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
                'Recognized textbook chemistry content.',
              regions: [],
            },
          ],
          sha256:
            'test-sha256-large-scanned-local',
        };
      },
    });

    assert.equal(
      receivedMaximumBytes,
      4096
    );
    assert.equal(result.ocrPageCount, 1);
    assert.equal(
      result.document.id,
      'doc-large-scanned-local'
    );
  }
);
