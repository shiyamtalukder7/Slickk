const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ENGLISH_MEDIUM_PATHWAYS,
  classNumber,
  qualificationForProfile,
} = require('../src/catalog/english-medium');

test('English-medium registry covers Cambridge, Pearson, and OxfordAQA', () => {
  assert.deepEqual(
    ENGLISH_MEDIUM_PATHWAYS.map(
      (pathway) => pathway.trackId
    ),
    [
      'cambridge-international',
      'pearson-edexcel-international',
      'oxford-aqa-international',
    ]
  );
  assert.equal(
    ENGLISH_MEDIUM_PATHWAYS.every(
      (pathway) =>
        pathway.freeResourcePolicy.includes(
          'official'
        ) &&
        pathway.freeResourcePolicy.includes(
          'licensed'
        )
    ),
    true
  );
});

test('qualification stages adapt to the student track and class', () => {
  assert.equal(classNumber('Class 10'), 10);
  assert.equal(
    qualificationForProfile(
      'cambridge-international',
      'Class 7'
    ).stage,
    'Cambridge Lower Secondary'
  );
  assert.equal(
    qualificationForProfile(
      'pearson-edexcel-international',
      'Class 10'
    ).stage,
    'Pearson Edexcel International GCSE'
  );
  assert.equal(
    qualificationForProfile(
      'oxford-aqa-international',
      'Class 12'
    ).stage,
    'OxfordAQA International AS/A Level'
  );
});

test('national curriculum profiles do not receive an international qualification stage', () => {
  assert.equal(
    qualificationForProfile(
      'nctb-english-version',
      'Class 8'
    ),
    null
  );
});
