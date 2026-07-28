const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseBanbeisSchoolPage,
  parseBanbeisSchoolPages,
} = require('../src/catalog/banbeis');

const page = {
  pageNumber: 1,
  text: [
    'Upazila/Thana Wise list of Institutes',
    'District: BARGUNA',
    'Upazila/Thana: AMTALI',
    '1',
    '2',
    'Slno',
    '134886',
    '100022',
    'Eiin',
    'SOUTH BENGAL IDEAL SCHOOL AND COLLEGE',
    'MAFIZ UDDIN GIRLS PILOT HIGH SCHOOL',
    'Name of the Institution',
    '01734041282',
    '01718101316',
    'Mobile',
    'AMTALI',
    'UPZILA ROAD',
    'Vil/Road',
  ].join('\n'),
};

test('BANBEIS page parser aligns EIIN, school name, and location columns', () => {
  const parsed = parseBanbeisSchoolPage(page);

  assert.equal(parsed.warning, null);
  assert.equal(parsed.schools.length, 2);
  assert.deepEqual(parsed.schools[1], {
    id: 'banbeis-100022',
    eiin: '100022',
    name: 'MAFIZ UDDIN GIRLS PILOT HIGH SCHOOL',
    district: 'BARGUNA',
    upazila: 'AMTALI',
    address: 'UPZILA ROAD',
    source: 'BANBEIS institute directory',
    sourceYear: '2015',
    sourceUrl:
      'https://banbeis.gov.bd/sites/default/files/files/banbeis.portal.gov.bd/page/9f4844bb_6b8a_471c_96e2_b27b3e3af175/LIST%20OF%20INSTITUTUTE1%281%29.pdf',
  });
});

test('BANBEIS parser deduplicates repeated EIIN rows', () => {
  const parsed = parseBanbeisSchoolPages([
    page,
    { ...page, pageNumber: 2 },
  ]);

  assert.equal(parsed.schools.length, 2);
  assert.equal(parsed.warnings.length, 0);
});
