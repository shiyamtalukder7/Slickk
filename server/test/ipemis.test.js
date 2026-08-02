const assert = require('node:assert/strict');
const test = require('node:test');

const {
  searchIpemisPrimarySchools,
} = require('../src/catalog/ipemis');

test('IPEMIS primary-school results map without mislabelling school codes as EIIN', async () => {
  const schools = await searchIpemisPrimarySchools(
    'Ideal',
    5,
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          aaData: [
            {
              schoolId: 20396,
              schoolCode: '130396',
              schoolName: 'IDEAL GOVT. PRIMARY SCHOOL',
              schoolNameLocal:
                'আইডিয়াল সরকারি প্রাথমিক বিদ্যালয়',
              districtName: 'DHAKA',
              districtNameLocal: 'ঢাকা',
              upazilaName: 'MOTIJHEEL',
              upazilaNameLocal: 'মতিঝিল',
              geoUnionName: 'Ward 33',
              schoolTypeName:
                'Govt. Primary Schools',
            },
          ],
        }),
      }),
    }
  );

  assert.equal(schools.length, 1);
  assert.equal(schools[0].id, 'ipemis-20396');
  assert.equal(schools[0].eiin, '');
  assert.equal(schools[0].schoolCode, '130396');
  assert.equal(schools[0].educationLevel, 'Primary');
  assert.equal(
    schools[0].source,
    'DPE IPEMIS primary-school directory'
  );
});

test('IPEMIS directory failure leaves an empty safe fallback', async () => {
  const schools = await searchIpemisPrimarySchools(
    'Example',
    5,
    {
      fetchImpl: async () => {
        throw new Error('offline');
      },
    }
  );

  assert.deepEqual(schools, []);
});
