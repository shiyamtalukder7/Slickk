const { z } = require('zod');

const {
  ENGLISH_MEDIUM_PATHWAYS,
} = require('../catalog/english-medium');

const CURRICULUM_TRACKS = Object.freeze([
  {
    id: 'nctb-bangla-version',
    name: 'NCTB Bangla Version',
    shortName: 'Bangla Medium',
    curriculum: 'NCTB',
    version: 'Bangla Version',
    resourceAccess: 'official-public',
  },
  {
    id: 'nctb-english-version',
    name: 'NCTB English Version',
    shortName: 'English Version',
    curriculum: 'NCTB',
    version: 'English Version',
    resourceAccess: 'official-public',
  },
  {
    id: 'cambridge-international',
    name: 'Cambridge International',
    shortName: 'Cambridge',
    curriculum: 'Cambridge International',
    version: '',
    resourceAccess: 'licensed-school-or-user',
  },
  {
    id: 'pearson-edexcel-international',
    name: 'Pearson Edexcel International',
    shortName: 'Pearson Edexcel',
    curriculum: 'Pearson Edexcel',
    version: '',
    resourceAccess: 'licensed-school-or-user',
  },
  {
    id: 'oxford-aqa-international',
    name: 'OxfordAQA International',
    shortName: 'OxfordAQA',
    curriculum: 'OxfordAQA International',
    version: '',
    resourceAccess: 'licensed-school-or-user',
  },
  {
    id: 'other',
    name: 'Other school curriculum',
    shortName: 'Other',
    curriculum: '',
    version: '',
    resourceAccess: 'licensed-school-or-user',
  },
]);

const SCHOOL_GRADES = Object.freeze(
  Array.from({ length: 12 }, (_, index) => ({
    id: `class-${index + 1}`,
    name: `Class ${index + 1}`,
  }))
);

const TEACHING_LANGUAGES = Object.freeze([
  {
    id: 'english',
    name: 'English',
  },
  {
    id: 'bangla',
    name: 'বাংলা',
  },
  {
    id: 'bilingual',
    name: 'English + বাংলা',
  },
  {
    id: 'banglish',
    name: 'Banglish',
  },
]);

const SUBJECTS = Object.freeze([
  'Mathematics',
  'English',
  'Bangla',
  'Science',
  'Bangladesh and Global Studies',
  'Religion and Moral Education',
  'Information and Communication Technology',
  'Physics',
  'Chemistry',
  'Biology',
  'Higher Mathematics',
  'Accounting',
  'Finance and Banking',
  'Business Entrepreneurship',
  'Economics',
  'Geography and Environment',
  'History',
]);

const schoolSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(2).max(240),
  eiin: z
    .string()
    .trim()
    .max(20)
    .regex(/^\d*$/, 'EIIN must contain only numbers.')
    .default(''),
  district: z.string().trim().max(120).default(''),
  upazila: z.string().trim().max(120).default(''),
  custom: z.boolean().default(false),
});

const studentEducationProfileSchema = z.object({
  studentName: z.string().trim().min(2).max(80),
  teachingLanguage: z.enum(
    TEACHING_LANGUAGES.map((item) => item.id)
  ),
  curriculumTrack: z.enum(
    CURRICULUM_TRACKS.map((item) => item.id)
  ),
  grade: z.enum(
    SCHOOL_GRADES.map((item) => item.name)
  ),
  school: schoolSchema,
  subjects: z
    .array(z.enum(SUBJECTS))
    .min(1)
    .max(SUBJECTS.length)
    .transform((values) => [...new Set(values)]),
  setupComplete: z.literal(true),
});

function formatIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.join('.') || 'profile',
    message: issue.message,
  }));
}

function parseStudentEducationProfile(payload) {
  const result =
    studentEducationProfileSchema.safeParse(payload ?? {});

  if (!result.success) {
    return {
      success: false,
      issues: formatIssues(result.error.issues),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

function findCurriculumTrack(trackId) {
  return (
    CURRICULUM_TRACKS.find(
      (track) => track.id === trackId
    ) || null
  );
}

function teachingLanguageName(languageId) {
  return (
    TEACHING_LANGUAGES.find(
      (language) => language.id === languageId
    )?.name || 'English'
  );
}

function curriculumSearchFilters(profile, subject = '') {
  if (!profile?.setupComplete) {
    return {};
  }

  const track = findCurriculumTrack(
    profile.curriculumTrack
  );

  if (!track) {
    return {};
  }

  return {
    curriculum: track.curriculum,
    version: track.version,
    grade: profile.grade,
    subject:
      profile.subjects?.includes(subject)
        ? subject
        : '',
  };
}

function profileOptions() {
  return {
    curriculumTracks: CURRICULUM_TRACKS,
    grades: SCHOOL_GRADES,
    teachingLanguages: TEACHING_LANGUAGES,
    subjects: SUBJECTS,
    englishMediumPathways:
      ENGLISH_MEDIUM_PATHWAYS,
  };
}

module.exports = {
  CURRICULUM_TRACKS,
  SCHOOL_GRADES,
  SUBJECTS,
  TEACHING_LANGUAGES,
  curriculumSearchFilters,
  findCurriculumTrack,
  parseStudentEducationProfile,
  profileOptions,
  studentEducationProfileSchema,
  teachingLanguageName,
};
