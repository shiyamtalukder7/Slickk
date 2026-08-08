const assert = require('node:assert/strict');
const test = require('node:test');

const {
  curriculumSearchFilters,
  parseStudentEducationProfile,
  profileOptions,
  teachingLanguageName,
} = require('../src/profiles/student');

function validProfile(overrides = {}) {
  return {
    studentName: 'Ari',
    teachingLanguage: 'bilingual',
    curriculumTrack: 'nctb-english-version',
    grade: 'Class 3',
    school: {
      id: 'banbeis-123456',
      name: 'Example School',
      eiin: '123456',
      district: 'Dhaka',
      upazila: 'Dhanmondi',
      custom: false,
    },
    subjects: ['Mathematics', 'English'],
    setupComplete: true,
    ...overrides,
  };
}

test('student profile accepts a school, exact class, track, language, and subjects', () => {
  const parsed =
    parseStudentEducationProfile(validProfile());

  assert.equal(parsed.success, true);
  assert.equal(
    parsed.data.curriculumTrack,
    'nctb-english-version'
  );
  assert.equal(parsed.data.grade, 'Class 3');
  assert.deepEqual(
    parsed.data.subjects,
    ['Mathematics', 'English']
  );
  assert.equal(
    teachingLanguageName('bilingual'),
    'English + বাংলা'
  );
});

test('student profile rejects unsupported curriculum values', () => {
  const parsed = parseStudentEducationProfile(
    validProfile({
      curriculumTrack: 'invented-curriculum',
    })
  );

  assert.equal(parsed.success, false);
  assert.equal(
    parsed.issues[0].field,
    'curriculumTrack'
  );
});

test('curriculum filters isolate the selected NCTB placement', () => {
  assert.deepEqual(
    curriculumSearchFilters(
      validProfile(),
      'Mathematics'
    ),
    {
      curriculum: 'NCTB',
      version: 'English Version',
      grade: 'Class 3',
      subject: 'Mathematics',
    }
  );
});

test('profile options cover national and international tracks for Classes 1 to 12', () => {
  const options = profileOptions();

  assert.equal(options.grades.length, 12);
  assert.equal(
    options.curriculumTracks.some(
      (track) =>
        track.id === 'nctb-bangla-version'
    ),
    true
  );
  assert.equal(
    options.curriculumTracks.some(
      (track) =>
        track.id === 'cambridge-international'
    ),
    true
  );
  assert.equal(
    options.curriculumTracks.some(
      (track) =>
        track.id ===
        'pearson-edexcel-international'
    ),
    true
  );
});


test('Pearson profile emits the canonical curriculum identity used by licensed textbooks', () => {
  assert.deepEqual(
    curriculumSearchFilters(
      validProfile({
        curriculumTrack:
          'pearson-edexcel-international',
        grade: 'Class 8',
        subjects: ['Chemistry'],
      }),
      'Chemistry'
    ),
    {
      curriculum: 'Pearson Edexcel',
      version: '',
      grade: 'Class 8',
      subject: 'Chemistry',
    }
  );
});
