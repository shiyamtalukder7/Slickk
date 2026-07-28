const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createSchoolStore,
} = require('../src/storage/schools');

test('school directory imports and searches verified institutions', (context) => {
  const store = createSchoolStore(':memory:');
  context.after(() => store.close());

  store.importSchools([
    {
      id: 'banbeis-100022',
      eiin: '100022',
      name: 'MAFIZ UDDIN GIRLS PILOT HIGH SCHOOL',
      district: 'BARGUNA',
      upazila: 'AMTALI',
      address: 'UPZILA ROAD',
      source: 'BANBEIS institute directory',
      sourceYear: '2015',
      sourceUrl: 'https://banbeis.gov.bd/example.pdf',
    },
  ]);

  assert.equal(store.status().schoolCount, 1);
  assert.equal(
    store.search('Mafiz')[0].eiin,
    '100022'
  );
  assert.equal(
    store.search('100022')[0].district,
    'BARGUNA'
  );
});

test('school directory requires at least two search characters', (context) => {
  const store = createSchoolStore(':memory:');
  context.after(() => store.close());

  assert.deepEqual(store.search('a'), []);
});
