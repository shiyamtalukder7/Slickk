const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ocrLanguagesFromLabel,
  ocrPdfPages,
} = require('../src/documents/ocr');

function fakePdfBuffer() {
  return Buffer.from('%PDF-1.7\nimage-only-test');
}

test('OCR language selection covers English and Bangla books', () => {
  assert.deepEqual(
    ocrLanguagesFromLabel('English'),
    ['eng']
  );
  assert.deepEqual(
    ocrLanguagesFromLabel('Bangla'),
    ['ben', 'eng']
  );
  assert.deepEqual(
    ocrLanguagesFromLabel('English', 'eng+ben'),
    ['eng', 'ben']
  );
});

test('OCR renders selected pages and preserves PDF page numbers', async () => {
  let parserDestroyed = false;
  let workerTerminated = false;
  const recognized = [];
  const progress = [];
  const result = await ocrPdfPages(
    fakePdfBuffer(),
    {
      pageNumbers: [2, 4],
      languages: ['eng'],
      parserFactory: () => ({
        async getInfo() {
          return { total: 4 };
        },
        async getScreenshot({ partial }) {
          return {
            pages: [
              {
                data: Buffer.from(
                  `image-page-${partial[0]}`
                ),
              },
            ],
          };
        },
        async destroy() {
          parserDestroyed = true;
        },
      }),
      workerFactory: async (languages) => {
        assert.deepEqual(languages, ['eng']);

        return {
          async recognize(image) {
            const imageName = image.toString();
            recognized.push(imageName);

            return {
              data: {
                text: `Recognized ${imageName}`,
              },
            };
          },
          async terminate() {
            workerTerminated = true;
          },
        };
      },
      onProgress(event) {
        progress.push(event);
      },
    }
  );

  assert.deepEqual(recognized, [
    'image-page-2',
    'image-page-4',
  ]);
  assert.deepEqual(
    result.pages.map((page) => page.pageNumber),
    [2, 4]
  );
  assert.match(result.pages[1].text, /page-4/);
  assert.equal(
    progress.at(-1).completedPages,
    2
  );
  assert.equal(parserDestroyed, true);
  assert.equal(workerTerminated, true);
});
