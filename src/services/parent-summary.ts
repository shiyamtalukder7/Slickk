import { fetch as expoFetch } from 'expo/fetch';

import { getSlickkApiUrl } from '@/config/api';
import { getSlickkAuthorizationHeaders, loadSlickkSession } from '@/services/api-auth';

export type ParentSummary = {
  policy: string;
  generatedAt: string;
  studentName: string;
  grade: string;
  lessonsCompleted: number;
  subjectsStudied: number;
  verifiedAnswers: number;
  accuracyPercentage: number | null;
  strengths: { subject: string; masteryPercentage: number; evidenceCount: number }[];
  priorities: { subject: string; topic: string; misconception: string; nextAction: string; masteryPercentage: number }[];
  homeSupport: string;
  evidenceNotice: string;
  wellbeingSupport: { needsTrustedAdult: boolean; learningPace: string; createdAt: string } | null;
};

export async function loadParentSummary(signal?: AbortSignal) {
  const session = await loadSlickkSession();
  if (!['local', 'student', 'guardian'].includes(session.role)) {
    throw new Error('Use a linked parent or student account to view this report.');
  }
  const studentId = session.role === 'local' ? 'local-student' : session.subjectId;
  const response = await expoFetch(
    getSlickkApiUrl(`/api/students/${encodeURIComponent(studentId)}/parent-summary`),
    { headers: { Accept: 'application/json', ...(await getSlickkAuthorizationHeaders()) }, signal }
  );
  const payload = (await response.json()) as { summary?: ParentSummary; error?: string };
  if (!response.ok || !payload.summary) {
    throw new Error(payload.error || 'Slickk could not load the family report.');
  }
  return payload.summary;
}
