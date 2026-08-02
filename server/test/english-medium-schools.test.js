const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DHAKA_BOARD_ENGLISH_MEDIUM_SCHOOLS,
  DHAKA_BOARD_ENGLISH_MEDIUM_SOURCE_URL,
  seedEnglishMediumSchools,
} = require('../src/catalog/english-medium-schools');
const {
  createSchoolStore,
} = require('../src/storage/schools');

test('official English-medium registry contains every listed school', () => {
  assert.equal(
    DHAKA_BOARD_ENGLISH_MEDIUM_SCHOOLS.length,
    118
  );
  assert.equal(
    new Set(
      DHAKA_BOARD_ENGLISH_MEDIUM_SCHOOLS.map(
        (school) => school.eiin
      )
    ).size,
    118
  );
  assert.ok(
    DHAKA_BOARD_ENGLISH_MEDIUM_SOURCE_URL.startsWith(
      'https://dhakaeducationboard.gov.bd/'
    )
  );
});

test('correct Maple Leaf name is searchable despite source typo', (context) => {
  const store = createSchoolStore(':memory:');
  context.after(() => store.close());

  seedEnglishMediumSchools(store);

  const result = store.search(
    'Maple Leaf International School'
  );

  assert.equal(result[0].eiin, '190075');
  assert.equal(
    result[0].name,
    'Maple Leaf International School'
  );
  assert.equal(
    store.status().englishMediumSchoolCount,
    118
  );
});
