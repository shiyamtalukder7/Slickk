import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';

import { getSlickkApiUrl } from '@/config/api';
import { getSlickkAuthorizationHeaders, resolveSlickkStudentId } from '@/services/api-auth';

export type WeeklyQuestion = {
  id: string;
  number: number;
  subject: string;
  topic: string;
  kind: string;
  prompt: string;
  points: number;
  priorityReasons: string[];
};

export type WeeklyAssessment = {
  studentId: string;
  id: string;
  submissionId: string;
  title: string;
  generatedAt: string;
  studentName: string;
  grade: string;
  durationMinutes: number;
  totalPoints: number;
  questions: WeeklyQuestion[];
};

export type AssessmentReviewResult = {
  subjectKey: string;
  observation: 'correct' | 'incorrect';
  hintsUsed: number;
};

export type AssessmentSubmissionDraft = {
  assessment: WeeklyAssessment;
  ocrText: string;
  documentIds: string[];
  updatedAt: string;
};

const DRAFT_FILE = 'slickk-assessment-submission.json';
const HISTORY_FILE = 'slickk-assessment-history.json';

export type AssessmentHistoryItem = {
  assessmentId: string; title: string; verifiedAt: string;
  correct: number; incorrect: number; total: number;
};

function draftFile() {
  return new File(Paths.document, DRAFT_FILE);
}

export function saveAssessmentDraft(
  assessment: WeeklyAssessment,
  evidence?: { ocrText?: string; documentIds?: string[] }
) {
  const file = draftFile();
  if (!file.exists) file.create();
  const draft: AssessmentSubmissionDraft = {
    assessment,
    ocrText: evidence?.ocrText || '',
    documentIds: evidence?.documentIds || [],
    updatedAt: new Date().toISOString(),
  };
  file.write(JSON.stringify(draft));
  return draft;
}

export async function loadAssessmentDraft() {
  const file = draftFile();
  if (!file.exists) return null;
  try {
    return JSON.parse(await file.text()) as AssessmentSubmissionDraft;
  } catch {
    return null;
  }
}

export async function loadAssessmentHistory(): Promise<AssessmentHistoryItem[]> {
  const file = new File(Paths.document, HISTORY_FILE);
  if (!file.exists) return [];
  try {
    const value = JSON.parse(await file.text());
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export async function saveAssessmentHistory(
  assessment: WeeklyAssessment,
  results: AssessmentReviewResult[]
) {
  const history = await loadAssessmentHistory();
  const correct = results.filter((item) => item.observation === 'correct').length;
  const item: AssessmentHistoryItem = {
    assessmentId: assessment.id, title: assessment.title,
    verifiedAt: new Date().toISOString(), correct,
    incorrect: results.length - correct, total: results.length,
  };
  const file = new File(Paths.document, HISTORY_FILE);
  if (!file.exists) file.create();
  file.write(JSON.stringify([item, ...history.filter((entry) => entry.assessmentId !== item.assessmentId)].slice(0, 20)));
  return item;
}

export async function attachAssessmentOcr(
  ocrText: string,
  documentIds: string[]
) {
  const current = await loadAssessmentDraft();
  if (!current) throw new Error('Generate the weekly test before uploading answers.');
  return saveAssessmentDraft(current.assessment, { ocrText, documentIds });
}

export async function generateWeeklyAssessment(questionCount: number, subjects: string[]) {
  const studentId = await resolveSlickkStudentId();
  const response = await expoFetch(
    getSlickkApiUrl(`/api/students/${encodeURIComponent(studentId)}/weekly-assessment?questions=${questionCount}&subjects=${encodeURIComponent(subjects.join(','))}`),
    { headers: { Accept: 'application/json', ...(await getSlickkAuthorizationHeaders()) } }
  );
  const payload = (await response.json()) as { assessment?: WeeklyAssessment; error?: string };
  if (!response.ok || !payload.assessment) {
    throw new Error(payload.error || 'Slickk could not generate the weekly test.');
  }
  saveAssessmentDraft(payload.assessment);
  return payload.assessment;
}

export async function submitVerifiedAssessment(
  studentId: string,
  results: AssessmentReviewResult[]
) {
  const response = await expoFetch(
    getSlickkApiUrl(`/api/students/${encodeURIComponent(studentId)}/assessment-evidence`),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(await getSlickkAuthorizationHeaders()),
      },
      body: JSON.stringify({ results }),
    }
  );
  const payload = (await response.json()) as { error?: string; verifiedCount?: number };
  if (!response.ok) throw new Error(payload.error || 'Verified results could not be saved.');
  return payload;
}
