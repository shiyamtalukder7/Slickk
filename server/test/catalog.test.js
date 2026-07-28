const assert = require('node:assert/strict');
const test = require('node:test');

const {
  bootstrapItemsForCatalog,
  discoverNctbCatalogs,
  fetchNctbCatalog,
  inferSingleTablePlacement,
  inferSubject,
  parseNctbCatalogHtml,
  toDirectDownloadUrl,
} = require('../src/catalog/nctb');
const {
  BANGLADESH_CURRICULA,
  NCTB_CATALOGS,
} = require('../src/catalog/registry');

const sampleCatalog = {
  id: 'nctb-test-class-6',
  grade: 'Class 6',
  academicYear: '2026',
  url: 'https://nctb.gov.bd/pages/test',
};

const sampleHtml = `
  <table>
    <tr>
      <th>ক্রমিক</th>
      <th>বাংলা ভার্সন</th>
      <th>ডাউনলোড</th>
      <th>English Version</th>
      <th>Download</th>
    </tr>
    <tr>
      <td>1</td>
      <td>গণিত</td>
      <td>
        <a href="https://drive.google.com/file/d/bangla-id/view">Link 1</a>
        <a href="https://drive.egovcloud.gov.bd/index.php/s/bangla-token">Link 2</a>
      </td>
      <td>Mathematics</td>
      <td>
        <a href="https://drive.google.com/file/d/english-id/view">Link 1</a>
        <a href="https://drive.egovcloud.gov.bd/index.php/s/english-token">Link 2</a>
      </td>
    </tr>
  </table>
`;

test('NCTB parser discovers Bangla and English-version mirrors', () => {
  const books = parseNctbCatalogHtml(
    sampleHtml,
    sampleCatalog
  );

  assert.equal(books.length, 2);
  assert.deepEqual(
    books.map((book) => book.version),
    ['Bangla Version', 'English Version']
  );
  assert.deepEqual(
    books.map((book) => book.language),
    ['Bangla', 'English']
  );
  assert.equal(books[0].grade, 'Class 6');
  assert.equal(books[1].subject, 'Mathematics');
  assert.match(
    books[1].downloadUrl,
    /english-token\/download$/
  );
  assert.equal(
    books.every(
      (book) => book.rights === 'official-public'
    ),
    true
  );
});

test('catalog downloader accepts only verified hosts', () => {
  assert.equal(
    toDirectDownloadUrl(
      'https://example.com/not-a-book.pdf'
    ),
    null
  );
  assert.equal(
    toDirectDownloadUrl(
      'https://drive.google.com/file/d/book-id/view'
    ),
    'https://drive.usercontent.google.com/download?id=book-id&export=download&confirm=t'
  );
  assert.equal(
    toDirectDownloadUrl(
      'http://drive.google.com/file/d/book-id/view'
    ),
    'https://drive.usercontent.google.com/download?id=book-id&export=download&confirm=t'
  );
  const egovDownload =
    'https://drive.egovcloud.gov.bd/index.php/s/book-token/download';

  assert.equal(
    toDirectDownloadUrl(egovDownload),
    egovDownload
  );
});

test('catalog keeps the same official file in both curriculum placements', () => {
  const html = `
    <table>
      <tr>
        <td>1</td>
        <td>English for Today</td>
        <td><a href="https://drive.egovcloud.gov.bd/index.php/s/shared">Download</a></td>
        <td>English for Today</td>
        <td><a href="https://drive.egovcloud.gov.bd/index.php/s/shared">Download</a></td>
      </tr>
    </table>
  `;
  const books = parseNctbCatalogHtml(
    html,
    sampleCatalog
  );

  assert.equal(books.length, 2);
  assert.deepEqual(
    books.map((book) => book.version),
    ['Bangla Version', 'English Version']
  );
});

test('single-table higher-secondary rows identify explicit English Version books', () => {
  assert.deepEqual(
    inferSingleTablePlacement(
      'তথ্য ও যোগাযোগ প্রযুক্তি (ইংলিশ ভার্সন)'
    ),
    {
      language: 'English',
      version: 'English Version',
    }
  );
  assert.deepEqual(
    inferSingleTablePlacement('English for Today'),
    {
      language: 'English',
      version: 'Bangla Version',
    }
  );
});

test('verified bootstrap covers every current NCTB catalog placement', () => {
  const books = NCTB_CATALOGS.flatMap(
    (catalog) =>
      bootstrapItemsForCatalog(catalog)
  );

  assert.equal(books.length, 269);
  assert.equal(
    books.filter(
      (book) =>
        book.version === 'Bangla Version'
    ).length,
    136
  );
  assert.equal(
    books.filter(
      (book) =>
        book.version === 'English Version'
    ).length,
    133
  );
});

test('discovery can run entirely from the verified official snapshot', async () => {
  const result = await discoverNctbCatalogs({
    offline: true,
  });

  assert.equal(result.books.length, 269);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(result.sources, {
    live: 0,
    bootstrap: 10,
  });
});

test('live discovery falls back with useful transport diagnostics', async () => {
  const result = await discoverNctbCatalogs({
    catalogs: [NCTB_CATALOGS[0]],
    fetchImpl: async () => {
      const error = new Error('fetch failed');
      error.cause = {
        code: 'UND_ERR_CONNECT_TIMEOUT',
        message: 'connection timed out',
      };
      throw error;
    },
    maxAttempts: 1,
  });

  assert.equal(result.books.length, 6);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(
    result.warnings[0].liveError.causeCode,
    'UND_ERR_CONNECT_TIMEOUT'
  );
  assert.deepEqual(result.sources, {
    live: 0,
    bootstrap: 1,
  });
});

test('live catalog request uses browser-compatible headers', async () => {
  let receivedOptions;
  const books = await fetchNctbCatalog(
    sampleCatalog,
    {
      maxAttempts: 1,
      fetchImpl: async (_url, options) => {
        receivedOptions = options;
        return {
          ok: true,
          text: async () => sampleHtml,
        };
      },
    }
  );

  assert.equal(books.length, 2);
  assert.match(
    receivedOptions.headers['User-Agent'],
    /Mozilla/
  );
  assert.match(
    receivedOptions.headers.Accept,
    /text\/html/
  );
});

test('Bangladesh registry covers national and English-medium tracks', () => {
  const coveredGrades = new Set(
    NCTB_CATALOGS.flatMap((catalog) =>
      catalog.grade.match(/\d+/g) || []
    )
  );

  for (let grade = 1; grade <= 12; grade += 1) {
    assert.equal(
      coveredGrades.has(String(grade)),
      true
    );
  }

  assert.deepEqual(
    BANGLADESH_CURRICULA.map(
      (curriculum) => curriculum.id
    ),
    [
      'nctb-bangla-version',
      'nctb-english-version',
      'cambridge-international-bangladesh',
      'pearson-edexcel-bangladesh',
      'oxford-aqa-bangladesh',
    ]
  );
});

test('subject inference handles Bangla and English titles', () => {
  assert.equal(
    inferSubject('প্রাথমিক গণিত'),
    'Mathematics'
  );
  assert.equal(
    inferSubject('Information and Communication Technology'),
    'Information and Communication Technology'
  );
});
