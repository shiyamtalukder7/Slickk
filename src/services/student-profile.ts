import { fetch as expoFetch } from 'expo/fetch';

import { getSlickkApiUrl } from '@/config/api';

export const LOCAL_STUDENT_ID = 'local-student';

export type CurriculumTrack = {
  id: string;
  name: string;
  shortName: string;
  curriculum: string;
  version: string;
  resourceAccess:
    | 'official-public'
    | 'licensed-school-or-user';
};

export type GradeOption = {
  id: string;
  name: string;
};

export type TeachingLanguage = {
  id: string;
  name: string;
};

export type School = {
  id?: string;
  eiin: string;
  name: string;
  district: string;
  upazila: string;
  address?: string;
  custom: boolean;
};

export type StudentEducationProfile = {
  studentName: string;
  teachingLanguage: string;
  curriculumTrack: string;
  grade: string;
  school: School;
  subjects: string[];
  setupComplete: true;
};

export type ProfileOptions = {
  curriculumTracks: CurriculumTrack[];
  grades: GradeOption[];
  teachingLanguages: TeachingLanguage[];
  subjects: string[];
  schoolDirectory: {
    schoolCount: number;
    districtCount: number;
    updatedAt: string | null;
    manualSchoolEntrySupported: boolean;
  };
};

const FALLBACK_OPTIONS: ProfileOptions = {
  curriculumTracks: [
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
      curriculum: 'Pearson Edexcel International',
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
  ],
  grades: Array.from({ length: 12 }, (_, index) => ({
    id: `class-${index + 1}`,
    name: `Class ${index + 1}`,
  })),
  teachingLanguages: [
    { id: 'english', name: 'English' },
    { id: 'bangla', name: 'বাংলা' },
    { id: 'bilingual', name: 'English + বাংলা' },
    { id: 'banglish', name: 'Banglish' },
  ],
  subjects: [
    'Mathematics',
    'English',
    'Bangla',
    'Science',
    'Bangladesh and Global Studies',
    'Information and Communication Technology',
    'Physics',
    'Chemistry',
    'Biology',
    'Higher Mathematics',
    'Accounting',
    'Business Entrepreneurship',
    'Economics',
  ],
  schoolDirectory: {
    schoolCount: 0,
    districtCount: 0,
    updatedAt: null,
    manualSchoolEntrySupported: true,
  },
};

export class StudentProfileError extends Error {
  code: string;

  constructor(
    message: string,
    code = 'STUDENT_PROFILE_ERROR'
  ) {
    super(message);
    this.name = 'StudentProfileError';
    this.code = code;
  }
}

async function parseResponse<T>(
  response: Response
): Promise<T> {
  const data = (await response.json()) as {
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    throw new StudentProfileError(
      data.error || 'Slickk could not save this profile.',
      data.code || `HTTP_${response.status}`
    );
  }

  return data as T;
}

export async function loadProfileOptions() {
  try {
    const response = await expoFetch(
      getSlickkApiUrl('/api/profile-options')
    );

    return await parseResponse<ProfileOptions>(response);
  } catch {
    return FALLBACK_OPTIONS;
  }
}

export async function searchSchools(
  query: string,
  signal?: AbortSignal
) {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const response = await expoFetch(
    getSlickkApiUrl(
      `/api/schools/search?q=${encodeURIComponent(
        trimmed
      )}&limit=12`
    ),
    { signal }
  );
  const data = await parseResponse<{
    schools: Omit<School, 'custom'>[];
  }>(response);

  return data.schools.map((school) => ({
    ...school,
    custom: false,
  }));
}

export async function saveStudentProfile(
  profile: StudentEducationProfile
) {
  const response = await expoFetch(
    getSlickkApiUrl(
      `/api/students/${LOCAL_STUDENT_ID}/profile`
    ),
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile),
    }
  );

  return parseResponse<{
    ok: true;
    studentId: string;
    profile: StudentEducationProfile;
  }>(response);
}
