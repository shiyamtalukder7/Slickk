import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';

import { getSlickkApiUrl } from '@/config/api';
import {
  OFFLINE_ENGLISH_MEDIUM_SCHOOLS,
} from '@/data/english-medium-schools';

export const LOCAL_STUDENT_ID = 'local-student';
const LOCAL_PROFILE_FILE_NAME = 'slickk-student-profile.json';

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

async function fetchWithTimeout(
  url: string,
  init?: Parameters<typeof expoFetch>[1],
  timeoutMs = 5000
) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;

  try {
    return await Promise.race([
      expoFetch(url, {
        ...init,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(
            new StudentProfileError(
              'The local Slickk server did not respond.',
              'REQUEST_TIMEOUT'
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

function localProfileFile() {
  return new File(Paths.document, LOCAL_PROFILE_FILE_NAME);
}

async function loadLocalStudentProfile() {
  const file = localProfileFile();

  if (!file.exists) {
    return null;
  }

  try {
    const profile = JSON.parse(
      await file.text()
    ) as Partial<StudentEducationProfile>;

    return profile.setupComplete
      ? (profile as StudentEducationProfile)
      : null;
  } catch {
    return null;
  }
}

function saveLocalStudentProfile(
  profile: StudentEducationProfile
) {
  const file = localProfileFile();

  if (!file.exists) {
    file.create();
  }

  file.write(JSON.stringify(profile));
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
    const response = await fetchWithTimeout(
      getSlickkApiUrl('/api/profile-options')
    );

    return await parseResponse<ProfileOptions>(response);
  } catch {
    return FALLBACK_OPTIONS;
  }
}

export async function loadStudentProfile() {
  const localProfile = await loadLocalStudentProfile();

  if (localProfile) {
    return localProfile;
  }

  const response = await fetchWithTimeout(
    getSlickkApiUrl(
      `/api/students/${LOCAL_STUDENT_ID}/profile`
    )
  );
  const data = await parseResponse<{
    studentId: string;
    profile: Partial<StudentEducationProfile>;
  }>(response);

  return data.profile.setupComplete
    ? (data.profile as StudentEducationProfile)
    : null;
}

export async function searchSchools(
  query: string,
  signal?: AbortSignal
) {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const normalized = trimmed.toLocaleLowerCase();
  const offlineResults =
    OFFLINE_ENGLISH_MEDIUM_SCHOOLS.filter((school) =>
      [
        school.name,
        school.eiin,
        school.district,
      ].some((value) =>
        value.toLocaleLowerCase().includes(normalized)
      )
    )
      .sort((left, right) => {
        const leftStarts = left.name
          .toLocaleLowerCase()
          .startsWith(normalized);
        const rightStarts = right.name
          .toLocaleLowerCase()
          .startsWith(normalized);

        return Number(rightStarts) - Number(leftStarts) ||
          left.name.localeCompare(right.name);
      })
      .slice(0, 12)
      .map((school) => ({
        ...school,
        custom: false,
      }));

  // The English-medium registry travels with the APK. This lets a learner
  // select their school even with no USB, Wi-Fi, or local Slickk server.
  if (offlineResults.length > 0) {
    return offlineResults;
  }

  try {
    const response = await fetchWithTimeout(
      getSlickkApiUrl(
        `/api/schools/search?q=${encodeURIComponent(
          trimmed
        )}&limit=12`
      ),
      { signal },
      1800
    );
    const data = await parseResponse<{
      schools: Omit<School, 'custom'>[];
    }>(response);

    return data.schools.map((school) => ({
      ...school,
      custom: false,
    }));
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    return offlineResults;
  }
}

export async function saveStudentProfile(
  profile: StudentEducationProfile
) {
  saveLocalStudentProfile(profile);

  void fetchWithTimeout(
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
    )
    .then((response) =>
      parseResponse<{
        ok: true;
        studentId: string;
        profile: StudentEducationProfile;
      }>(response)
    )
    .catch(() => {
      // The device copy is authoritative while the local server is offline.
    });

  return {
    ok: true as const,
    studentId: LOCAL_STUDENT_ID,
    profile,
  };
}
