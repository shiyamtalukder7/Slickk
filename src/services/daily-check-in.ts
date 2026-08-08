import { fetch as expoFetch } from 'expo/fetch';
import { getSlickkApiUrl } from '@/config/api';
import { getSlickkAuthorizationHeaders, resolveSlickkStudentId } from '@/services/api-auth';

export type CheckInMood = 'great' | 'okay' | 'tired' | 'worried' | 'upset';
export type SchoolDay = 'good' | 'mixed' | 'difficult' | 'not-today';
export type DailyCheckIn = {
  mood: CheckInMood; schoolDay: SchoolDay; needsTrustedAdult: boolean;
  learningPace: 'gentle' | 'standard'; suggestedMinutes: number;
  response: string; createdAt: string;
};

export async function submitDailyCheckIn(
  input: { mood: CheckInMood; schoolDay: SchoolDay; needsTrustedAdult?: boolean },
  signal?: AbortSignal
) {
  const studentId = await resolveSlickkStudentId();
  const response = await expoFetch(
    getSlickkApiUrl(`/api/students/${encodeURIComponent(studentId)}/check-ins`),
    {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(await getSlickkAuthorizationHeaders()) },
      body: JSON.stringify(input),
    }
  );
  const payload = (await response.json()) as { checkIn?: DailyCheckIn; error?: string };
  if (!response.ok || !payload.checkIn) throw new Error(payload.error || 'Slickk could not save the check-in.');
  return payload.checkIn;
}
