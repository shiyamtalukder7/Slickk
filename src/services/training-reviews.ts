import { fetch as expoFetch } from 'expo/fetch';

import { getSlickkApiUrl } from '@/config/api';
import { getSlickkAuthorizationHeaders } from '@/services/api-auth';

export type TrainingReviewCheck =
  | 'factualGrounding'
  | 'ageAppropriateness'
  | 'teachingQuality'
  | 'safety';

export type TrainingCandidate = {
  id: string;
  status: string;
  split?: string;
  task?: { kind?: string; goal?: string };
  learnerContext?: {
    curriculum?: string;
    grade?: string;
    subject?: string;
    language?: string;
  };
  source?: {
    title?: string;
    page?: number;
    rights?: string;
    content?: string;
  };
  generatedResponse: string;
};

export type TrainingReviewQueue = {
  items: TrainingCandidate[];
  counts: Record<string, number>;
  requestId: string;
};

type ReviewDecision = {
  decision: 'approved' | 'rejected';
  checks: Record<TrainingReviewCheck, boolean>;
  notes: string;
};

export class TrainingReviewApiError extends Error {
  code: string;

  constructor(message: string, code = 'TRAINING_REVIEW_API_ERROR') {
    super(message);
    this.name = 'TrainingReviewApiError';
    this.code = code;
  }
}

async function request(path: `/${string}`, init: RequestInit = {}) {
  const authorization = await getSlickkAuthorizationHeaders();
  const response = await expoFetch(getSlickkApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...authorization,
      ...init.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = payload as { error?: unknown; code?: unknown } | null;
    throw new TrainingReviewApiError(
      typeof problem?.error === 'string'
        ? problem.error
        : `The educator service returned ${response.status}.`,
      typeof problem?.code === 'string' ? problem.code : `HTTP_${response.status}`
    );
  }

  return payload;
}

export async function loadTrainingReviewQueue() {
  return (await request(
    '/api/training/reviews?status=awaiting-reviewed-response&limit=50'
  )) as TrainingReviewQueue;
}

export async function submitTrainingReview(
  candidateId: string,
  decision: ReviewDecision
) {
  const payload = (await request(
    `/api/training/reviews/${encodeURIComponent(candidateId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision),
    }
  )) as { reviewed: TrainingCandidate; requestId: string };

  return payload.reviewed;
}
