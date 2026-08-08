import { fetch as expoFetch } from 'expo/fetch';

import { getSlickkApiUrl } from '@/config/api';
import { getSlickkAuthorizationHeaders, resolveSlickkStudentId } from '@/services/api-auth';

export type LearningPlanItem = {
  id: string;
  priority: number;
  subject: string;
  topic: string;
  action: 'guided-practice' | 'spaced-review' | 'short-check';
  durationMinutes: number;
  reasons: string[];
  evidenceCount: number;
  tutorPrompt: string;
};

export type PersonalLearningPlan = {
  policy: string;
  generatedAt: string;
  studentName: string;
  grade: string;
  totalMinutes: number;
  items: LearningPlanItem[];
};

export async function loadPersonalLearningPlan(signal?: AbortSignal) {
  const studentId = await resolveSlickkStudentId();
  const response = await expoFetch(
    getSlickkApiUrl(`/api/students/${encodeURIComponent(studentId)}/learning-plan?limit=5`),
    {
      headers: { Accept: 'application/json', ...(await getSlickkAuthorizationHeaders()) },
      signal,
    }
  );
  const payload = (await response.json()) as {
    plan?: PersonalLearningPlan;
    error?: string;
  };
  if (!response.ok || !payload.plan) {
    throw new Error(payload.error || 'Slickk could not build today’s learning plan.');
  }
  return payload.plan;
}
