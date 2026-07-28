const assert = require('node:assert/strict');
const test = require('node:test');

const {
  importPdfBuffer,
  validateImportMetadata,
} = require('../src/documents/importer');

function metadata() {
  return {
    title: 'Elementary Mathematics',
    curriculum: 'NCTB',
    academicYear: '2026',
    grade: 'Class 1',
    subject: 'Mathematics',
    language: 'English',
    version: 'English Version',
    sourceUrl: 'https://nctb.gov.bd/example',
    rights: 'official-public',
  };
}

test('PDF importer validates required catalog metadata', () => {
  assert.throws(
    () =>
      validateImportMetadata({
        ...metadata(),
        rights: '',
      }),
    /rights/
  );
});

test('PDF importer OCRs only pages without meaningful text', async () => {
  let importedInput;
  let recognizedInput;
  let storeClosed = false;
  const result = await importPdfBuffer({
    buffer: Buffer.from('%PDF-1.7\nfake'),
    metadata: metadata(),
    ocrLanguage: 'ben+eng',
    extractPages: async () => ({
      sha256: 'pdf-hash',
      pageCount: 2,
      pages: [
        {
          pageNumber: 1,
          text: 'Count the apples.',
        },
        {
          pageNumber: 2,
          text: '',
        },
      ],
    }),
    recognizePages: async (_buffer, options) => {
      recognizedInput = options;
      return {
        pages: [
          {
            pageNumber: 2,
            text: 'Recognized subtraction lesson.',
          },
        ],
      };
    },
    createStore: () => ({
      importDocument(input) {
        importedInput = input;
        return {
          duplicate: false,
          replaced: false,
          document: {
            id: 'document-id',
          },
        };
      },
      close() {
        storeClosed = true;
      },
    }),
  });

  assert.deepEqual(
    recognizedInput.pageNumbers,
    [2]
  );
  assert.deepEqual(recognizedInput.languages, [
    'ben',
    'eng',
  ]);
  assert.match(
    importedInput.pages[1].text,
    /Recognized/
  );
  assert.equal(result.ocrPageCount, 1);
  assert.equal(result.sha256, 'pdf-hash');
  assert.equal(storeClosed, true);
});

test('PDF importer leaves an injected shared store open', async () => {
  let storeClosed = false;
  const store = {
    importDocument() {
      return {
        duplicate: true,
        replaced: false,
        document: {
          id: 'existing-document',
        },
      };
    },
    close() {
      storeClosed = true;
    },
  };

  const result = await importPdfBuffer({
    buffer: Buffer.from('%PDF-1.7\nfake'),
    metadata: metadata(),
    noOcr: true,
    store,
    extractPages: async () => ({
      sha256: 'existing-hash',
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          text: 'Existing readable lesson.',
        },
      ],
    }),
  });

  assert.equal(result.duplicate, true);
  assert.equal(storeClosed, false);
});

test('PDF importer skips extraction and OCR for an existing hash', async () => {
  let extractionCalled = false;
  const buffer = Buffer.from(
    '%PDF-1.7\nalready indexed'
  );
  const result = await importPdfBuffer({
    buffer,
    metadata: metadata(),
    store: {
      findDocumentByHash() {
        return {
          id: 'existing-document',
          pageCount: 122,
        };
      },
      importDocument() {
        throw new Error(
          'duplicate should not be re-imported'
        );
      },
    },
    extractPages: async () => {
      extractionCalled = true;
      throw new Error(
        'duplicate should not be extracted'
      );
    },
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.pageCount, 122);
  assert.equal(result.ocrPageCount, 0);
  assert.equal(extractionCalled, false);
});
