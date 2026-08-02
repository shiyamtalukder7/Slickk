const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseBanbeisWorkbookRows,
} = require('../src/catalog/banbeis-workbook');

test('BANBEIS workbook rows become searchable EIIN institutions', () => {
  const parsed = parseBanbeisWorkbookRows(
    [
      ['School data based on Esurvey 2024'],
      [
        'DIVISION_NAME',
        'DISTRICT_NAME',
        'THANA_NAME',
        'INSTITUTE_TYPE_NAME',
        'EDUCATION_LEVEL_NAME',
        'EIIN_NO',
        'INSTITUTE_NAME',
        'POST_OFFICE_NAME',
      ],
      [
        'Dhaka',
        'Dhaka',
        'Mirpur',
        'SCHOOL',
        'Secondary',
        123456,
        'Example High School',
        'Mirpur',
      ],
    ],
    {
      category: 'schools',
      sourceYear: '2024',
    }
  );

  assert.equal(parsed.schools.length, 1);
  assert.deepEqual(parsed.schools[0], {
    id: 'banbeis-123456',
    eiin: '123456',
    name: 'Example High School',
    district: 'Dhaka',
    upazila: 'Mirpur',
    address: 'Mirpur',
    source: 'BANBEIS 2024 schools',
    sourceYear: '2024',
    sourceUrl: 'https://banbeis.gov.bd/',
    institutionType: 'SCHOOL',
    educationLevel: 'Secondary',
  });
});

test('BANBEIS workbook parsing skips incomplete rows', () => {
  const parsed = parseBanbeisWorkbookRows([
    ['EIIN_NO', 'INSTITUTE_NAME'],
    ['', 'No EIIN School'],
    ['123456', ''],
    ['654321', 'Complete School'],
  ]);

  assert.equal(parsed.schools.length, 1);
  assert.equal(parsed.warnings.length, 2);
});
