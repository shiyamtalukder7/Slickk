import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { getSlickkApiUrl } from '@/config/api';
import {
  getSlickkAuthorizationHeaders,
  resolveSlickkStudentId,
} from '@/services/api-auth';

const LEARNING_TWIN_FILE_NAME =
  'slickk-learning-twin.json';

export type LearningAction =
  | 'correct'
  | 'hint'
  | 'wrong';

export type LearningTwinState = {
  topic: string;
  skill: string;
  misconception: string;
  nextAction: string;
  mastery: number;
  confidence: number;
  attempts: number;
  correctAnswers: number;
  wrongAnswers: number;
  hintsUsed: number;
  lastAction: LearningAction | null;
  updatedAt: string;
};

type LearningTwinEnvelope = {
  version: 1;
  studentId: string;
  state: LearningTwinState;
};

type TutorLearningTwinUpdate = {
  topic: string;
  skill: string;
  misconception: string;
  nextAction: string;
  confidence: number;
  masteryDelta: number;
};

const clamp = (
  value: number,
  minimum = 0,
  maximum = 100
) => {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
};

const defaultState = (): LearningTwinState => ({
  topic: 'General learning',
  skill: 'Understanding',
  misconception: '',
  nextAction:
    'Complete a learning check to update your Learning Twin.',
  mastery: 0,
  confidence: 0,
  attempts: 0,
  correctAnswers: 0,
  wrongAnswers: 0,
  hintsUsed: 0,
  lastAction: null,
  updatedAt: new Date().toISOString(),
});

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function finiteNumber(
  value: unknown,
  fallback: number
) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  )
    ? value
    : fallback;
}

function integerValue(
  value: unknown,
  fallback: number
) {
  return Math.max(
    0,
    Math.round(finiteNumber(value, fallback))
  );
}

function textValue(
  value: unknown,
  fallback: string
) {
  return (
    typeof value === 'string' &&
    value.trim()
  )
    ? value.trim()
    : fallback;
}

function learningTwinFile() {
  return new File(
    Paths.document,
    LEARNING_TWIN_FILE_NAME
  );
}

function parseState(
  value: unknown
): LearningTwinState | null {
  if (!isRecord(value)) {
    return null;
  }

  const fallback = defaultState();

  const lastAction =
    value.lastAction === 'correct' ||
    value.lastAction === 'hint' ||
    value.lastAction === 'wrong'
      ? value.lastAction
      : null;

  return {
    topic: textValue(
      value.topic,
      fallback.topic
    ),
    skill: textValue(
      value.skill,
      fallback.skill
    ),
    misconception:
      typeof value.misconception === 'string'
        ? value.misconception
        : '',
    nextAction: textValue(
      value.nextAction,
      fallback.nextAction
    ),
    mastery: clamp(
      Math.round(
        finiteNumber(
          value.mastery,
          fallback.mastery
        )
      )
    ),
    confidence: clamp(
      Math.round(
        finiteNumber(
          value.confidence,
          fallback.confidence
        )
      )
    ),
    attempts: integerValue(
      value.attempts,
      0
    ),
    correctAnswers: integerValue(
      value.correctAnswers,
      0
    ),
    wrongAnswers: integerValue(
      value.wrongAnswers,
      0
    ),
    hintsUsed: integerValue(
      value.hintsUsed,
      0
    ),
    lastAction,
    updatedAt: textValue(
      value.updatedAt,
      fallback.updatedAt
    ),
  };
}

async function readState(
  studentId: string
): Promise<LearningTwinState> {
  const file = learningTwinFile();

  if (!file.exists) {
    return defaultState();
  }

  try {
    const value: unknown = JSON.parse(
      await file.text()
    );

    if (
      !isRecord(value) ||
      value.version !== 1 ||
      value.studentId !== studentId
    ) {
      return defaultState();
    }

    return (
      parseState(value.state) ||
      defaultState()
    );
  } catch {
    return defaultState();
  }
}

function writeState(
  studentId: string,
  state: LearningTwinState
) {
  const file = learningTwinFile();

  if (!file.exists) {
    file.create();
  }

  const envelope: LearningTwinEnvelope = {
    version: 1,
    studentId,
    state,
  };

  file.write(JSON.stringify(envelope));
}

function normalizeConfidence(
  value: number,
  fallback: number
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const percentage =
    value >= 0 && value <= 1
      ? value * 100
      : value;

  return clamp(Math.round(percentage));
}

function sameTopic(
  first: string,
  second: string
) {
  return (
    first.trim().toLowerCase() ===
    second.trim().toLowerCase()
  );
}

export async function loadLearningTwinState() {
  const studentId =
    await resolveSlickkStudentId();
  const response = await expoFetch(
    getSlickkApiUrl(`/api/students/${encodeURIComponent(studentId)}/progress`),
    { headers: { Accept: 'application/json', ...(await getSlickkAuthorizationHeaders()) } }
  );
  const payload = (await response.json()) as {
    profile?: { subjects?: Record<string, unknown>[] };
    error?: string;
  };
  if (!response.ok || !payload.profile) throw new Error(payload.error || 'Slickk could not load verified progress.');
  const subject = payload.profile.subjects?.[0];
  if (!subject) return defaultState();
  const correct = integerValue(subject.correctAnswers, 0);
  const wrong = integerValue(subject.incorrectAnswers, 0);
  const evidence = integerValue(subject.masteryEvidence, 0);
  const serverMastery = finiteNumber(subject.masteryScore, 0);
  return {
    topic: textValue(subject.lastTopic, textValue(subject.subject, 'General learning')),
    skill: textValue(subject.lastSkill, 'Understanding'),
    misconception: typeof subject.lastMisconception === 'string' ? subject.lastMisconception : '',
    nextAction: textValue(subject.nextAction, 'Complete a verified learning check.'),
    mastery: evidence > 0 ? clamp(Math.round(serverMastery * 100)) : 0,
    confidence: evidence > 0 ? clamp(Math.round(Math.min(1, evidence / 5) * 100)) : 0,
    attempts: correct + wrong,
    correctAnswers: correct,
    wrongAnswers: wrong,
    hintsUsed: integerValue(subject.hintsUsed, 0),
    lastAction: (wrong > 0 ? 'wrong' : correct > 0 ? 'correct' : null) as LearningAction | null,
    updatedAt: textValue(subject.lastStudiedAt, new Date().toISOString()),
  };
}

export async function saveTutorLearningTwin(
  update: TutorLearningTwinUpdate
) {
  const studentId =
    await resolveSlickkStudentId();

  const current = await readState(studentId);

  const topic = textValue(
    update.topic,
    current.topic
  );

  const continuingTopic = sameTopic(
    topic,
    current.topic
  );

  const baseMastery =
    continuingTopic
      ? current.mastery
      : 24;

  const masteryDelta = Number.isFinite(
    update.masteryDelta
  )
    ? Math.round(update.masteryDelta)
    : 0;

  const next: LearningTwinState = {
    ...current,
    topic,
    skill: textValue(
      update.skill,
      'Understanding'
    ),
    misconception:
      typeof update.misconception === 'string'
        ? update.misconception
        : '',
    nextAction: textValue(
      update.nextAction,
      current.nextAction
    ),
    mastery: clamp(
      baseMastery + masteryDelta
    ),
    confidence: normalizeConfidence(
      update.confidence,
      continuingTopic
        ? current.confidence
        : 38
    ),
    attempts:
      continuingTopic
        ? current.attempts
        : 0,
    correctAnswers:
      continuingTopic
        ? current.correctAnswers
        : 0,
    wrongAnswers:
      continuingTopic
        ? current.wrongAnswers
        : 0,
    hintsUsed:
      continuingTopic
        ? current.hintsUsed
        : 0,
    lastAction:
      continuingTopic
        ? current.lastAction
        : null,
    updatedAt: new Date().toISOString(),
  };

  writeState(studentId, next);

  return next;
}

export async function recordLearningTwinAction(
  action: LearningAction
) {
  const studentId =
    await resolveSlickkStudentId();

  const current = await readState(studentId);

  const next: LearningTwinState = {
    ...current,
    attempts: current.attempts + 1,
    correctAnswers:
      current.correctAnswers +
      (action === 'correct' ? 1 : 0),
    wrongAnswers:
      current.wrongAnswers +
      (action === 'wrong' ? 1 : 0),
    hintsUsed:
      current.hintsUsed +
      (action === 'hint' ? 1 : 0),
    mastery: clamp(
      current.mastery +
      (
        action === 'correct'
          ? 9
          : action === 'hint'
            ? 3
            : -3
      )
    ),
    confidence: clamp(
      current.confidence +
      (
        action === 'correct'
          ? 7
          : action === 'hint'
            ? 2
            : -6
      )
    ),
    lastAction: action,
    updatedAt: new Date().toISOString(),
  };

  writeState(studentId, next);

  return next;
}

export async function resetLearningTwinState() {
  const studentId =
    await resolveSlickkStudentId();

  const next = defaultState();

  writeState(studentId, next);

  return next;
}
