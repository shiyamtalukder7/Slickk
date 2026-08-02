const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createStudyPack,
} = require('../src/study/tools');

function region(overrides = {}) {
  return {
    documentId: 'document-1',
    pageNumber: 4,
    regionId: 'region-1',
    text: 'Photosynthesis converts light energy into chemical energy.',
    boundingBox: {
      x: 0.1,
      y: 0.2,
      width: 0.7,
      height: 0.1,
    },
    safetyFindings: [],
    ...overrides,
  };
}

test('study tools remain editable and source-grounded', () => {
  const pack = createStudyPack({
    title: 'Plant energy',
    regions: [region()],
  });

  assert.equal(pack.editable, true);
  assert.equal(pack.notes.length, 1);
  assert.equal(
    pack.flashcards[0].sources[0].regionId,
    'region-1'
  );
  assert.equal(pack.quiz[0].sources[0].page, 4);
});

test('document prompt injection is excluded from study tools', () => {
  assert.throws(
    () =>
      createStudyPack({
        regions: [
          region({
            safetyFindings: [
              {
                type: 'prompt-injection',
              },
            ],
          }),
        ],
      }),
    (error) =>
      error.code === 'STUDY_EVIDENCE_REQUIRED'
  );
});
