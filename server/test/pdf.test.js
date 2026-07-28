const assert = require('node:assert/strict');
const test = require('node:test');

const {
  extractPdfPages,
  hasMeaningfulText,
  hashPdf,
  stripGeneratedPageMarkers,
  validatePdfBuffer,
} = require('../src/documents/pdf');

function fakePdfBuffer() {
  return Buffer.from(
    '%PDF-1.7\nsafe-test-document'
  );
}

test('PDF validation checks the real file signature', () => {
  assert.throws(
    () => validatePdfBuffer(Buffer.from('not a pdf')),
    /valid PDF signature/
  );
});

test('generated page markers are not treated as textbook text', () => {
  assert.equal(
    stripGeneratedPageMarkers(
      '\n-- 7 of 122 --\n'
    ),
    ''
  );
  assert.equal(
    hasMeaningfulText('-- 7 of 122 --'),
    false
  );
  assert.equal(
    hasMeaningfulText('Count seven apples.'),
    true
  );
});

test('PDF extraction preserves page numbers', async () => {
  let destroyed = false;
  const result = await extractPdfPages(
    fakePdfBuffer(),
    {
      parserFactory: () => ({
        async getInfo() {
          return { total: 2 };
        },
        async getText({ partial }) {
          return {
            text:
              partial[0] === 1
                ? 'Photosynthesis uses light.'
                : 'Chlorophyll absorbs light energy.',
          };
        },
        async destroy() {
          destroyed = true;
        },
      }),
    }
  );

  assert.equal(result.pageCount, 2);
  assert.deepEqual(
    result.pages.map((page) => page.pageNumber),
    [1, 2]
  );
  assert.match(result.pages[1].text, /Chlorophyll/);
  assert.equal(result.sha256, hashPdf(fakePdfBuffer()));
  assert.equal(destroyed, true);
});
