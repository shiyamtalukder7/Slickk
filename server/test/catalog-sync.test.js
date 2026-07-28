const assert = require('node:assert/strict');
const {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CatalogSyncError,
  downloadCatalogPdf,
  emptySyncState,
  filterCatalogBooks,
  pendingCatalogBooks,
  syncCatalogBooks,
  syncLimit,
  validateCatalogBook,
} = require('../src/catalog/sync');

function catalogBook(overrides = {}) {
  return {
    id: 'nctb-test-book',
    provider: 'NCTB',
    country: 'Bangladesh',
    curriculum: 'NCTB',
    academicYear: '2026',
    grade: 'Class 1',
    subject: 'Mathematics',
    title: 'Elementary Mathematics',
    language: 'English',
    version: 'English Version',
    rights: 'official-public',
    sourceUrl:
      'https://nctb.gov.bd/pages/static-pages/test',
    downloadUrl:
      'https://drive.egovcloud.gov.bd/index.php/s/test/download',
    ...overrides,
  };
}

function responseFromBuffer(buffer, overrides = {}) {
  return {
    ok: true,
    status: 200,
    url:
      'https://drive.egovcloud.gov.bd/index.php/s/test/download',
    headers: {
      get(name) {
        return name.toLowerCase() ===
          'content-length'
          ? String(buffer.length)
          : null;
      },
    },
    async arrayBuffer() {
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
    },
    ...overrides,
  };
}

test('catalog sync enforces provider, rights, and host boundaries', () => {
  assert.equal(
    validateCatalogBook(catalogBook()).rights,
    'official-public'
  );
  assert.throws(
    () =>
      validateCatalogBook(
        catalogBook({
          rights: 'licensed-user-copy',
        })
      ),
    /official-public/
  );
  assert.throws(
    () =>
      validateCatalogBook(
        catalogBook({
          downloadUrl:
            'https://example.com/book.pdf',
        })
      ),
    /not verified/
  );
});

test('catalog sync filters exact curriculum placements and resumes completed work', () => {
  const books = [
    catalogBook(),
    catalogBook({
      id: 'nctb-bangla',
      version: 'Bangla Version',
      language: 'Bangla',
    }),
    catalogBook({
      id: 'nctb-science',
      subject: 'Science',
    }),
  ];
  const englishMath = filterCatalogBooks(
    books,
    {
      grade: 'class 1',
      version: 'english version',
      subject: 'mathematics',
    }
  );
  const state = emptySyncState();
  state.items[englishMath[0].id] = {
    status: 'imported',
  };

  assert.equal(englishMath.length, 1);
  assert.equal(
    pendingCatalogBooks(englishMath, state)
      .length,
    0
  );
  assert.equal(
    pendingCatalogBooks(englishMath, state, {
      force: true,
    }).length,
    1
  );
  assert.equal(syncLimit(50), 10);
  assert.throws(
    () => syncLimit(0),
    CatalogSyncError
  );
});

test('catalog downloader rejects non-PDF responses after download', async () => {
  await assert.rejects(
    () =>
      downloadCatalogPdf(catalogBook(), {
        fetchImpl: async () =>
          responseFromBuffer(
            Buffer.from('<html>not pdf</html>')
          ),
      }),
    /valid PDF signature/
  );
});

test('catalog sync downloads, imports, checkpoints, and resumes sequentially', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'slickk-sync-')
  );
  const manifestPath = path.join(
    temporaryDirectory,
    'catalog.json'
  );
  const statePath = path.join(
    temporaryDirectory,
    'sync.json'
  );
  const booksDirectory = path.join(
    temporaryDirectory,
    'books'
  );
  const pdf = Buffer.from(
    '%PDF-1.7\nverified catalog test'
  );
  let importCount = 0;
  let storeClosed = false;

  try {
    await writeFile(
      manifestPath,
      JSON.stringify({
        books: [catalogBook()],
      })
    );
    const first = await syncCatalogBooks({
      manifestPath,
      statePath,
      booksDirectory,
      filters: {
        grade: 'Class 1',
        version: 'English Version',
      },
      limit: 1,
      fetchImpl: async () =>
        responseFromBuffer(pdf),
      createStore: () => ({
        close() {
          storeClosed = true;
        },
      }),
      importBuffer: async (options) => {
        importCount += 1;
        assert.equal(
          options.metadata.rights,
          'official-public'
        );
        assert.equal(
          options.ocrLanguage,
          'ben+eng'
        );

        return {
          duplicate: false,
          sha256: 'downloaded-hash',
          document: {
            id: 'indexed-document',
          },
          pageCount: 12,
          ocrPageCount: 4,
        };
      },
    });
    const state = JSON.parse(
      await readFile(statePath, 'utf8')
    );

    assert.equal(first.importedCount, 1);
    assert.equal(first.failedCount, 0);
    assert.equal(
      state.items['nctb-test-book'].status,
      'imported'
    );
    assert.equal(importCount, 1);
    assert.equal(storeClosed, true);

    const second = await syncCatalogBooks({
      manifestPath,
      statePath,
      booksDirectory,
      limit: 1,
      createStore: () => ({
        close() {},
      }),
      importBuffer: async () => {
        throw new Error(
          'completed item should be skipped'
        );
      },
    });

    assert.equal(second.selectedCount, 0);
    assert.equal(importCount, 1);
  } finally {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
});
