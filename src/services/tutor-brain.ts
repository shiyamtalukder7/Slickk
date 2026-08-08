import { fetch as expoFetch } from 'expo/fetch';

import {
  getSlickkBrainApiUrl,
} from '@/config/api';

import type {
  CompleteEvent,
  TutorStreamRequest,
  TutorTeachingDecision,
} from '@/services/tutor-stream';

type JsonRecord = Record<string, unknown>;

type BrainSessionRecord = {
  session_id: string;
  student_id: string;
  subject: string;
  topic: string;
  stage: string;
  status: string;
};

export class TutorBrainRequestError extends Error {
  code: string;
  statusCode: number | null;

  constructor(
    message: string,
    code = 'TUTOR_BRAIN_ERROR',
    statusCode: number | null = null
  ) {
    super(message);
    this.name = 'TutorBrainRequestError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isRecord(
  value: unknown
): value is JsonRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function firstText(
  ...values: unknown[]
) {
  for (const value of values) {
    if (
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return '';
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

async function readJsonRecord(
  response: Response
) {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new TutorBrainRequestError(
      'The Tutor Brain returned unreadable data.',
      'INVALID_BRAIN_RESPONSE',
      response.status
    );
  }

  if (!isRecord(payload)) {
    throw new TutorBrainRequestError(
      'The Tutor Brain returned an invalid response.',
      'INVALID_BRAIN_RESPONSE',
      response.status
    );
  }

  return payload;
}

async function requestJson(
  path: `/${string}`,
  body: JsonRecord,
  signal: AbortSignal
) {
  const response = await expoFetch(
    getSlickkBrainApiUrl(path),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    }
  );

  const payload = await readJsonRecord(
    response
  );

  if (!response.ok) {
    throw new TutorBrainRequestError(
      firstText(
        payload.message,
        payload.error,
        `Tutor Brain request failed with status ${response.status}.`
      ),
      firstText(
        payload.error,
        `HTTP_${response.status}`
      ),
      response.status
    );
  }

  return payload;
}

async function registerStudent(
  request: TutorStreamRequest,
  signal: AbortSignal
) {
  await requestJson(
    '/students/register',
    {
      student_id: request.studentId,
      name: request.studentName,
      grade: request.grade,
      curriculum: request.curriculum,
      preferred_language: request.language,
      learning_preferences: [
        request.channel === 'live'
          ? 'voice conversation'
          : 'typed conversation',
        `${request.mode} tutoring`,
      ],
    },
    signal
  );
}

async function startLesson(
  request: TutorStreamRequest,
  signal: AbortSignal
) {
  return requestJson(
    '/lessons/start',
    {
      student_id: request.studentId,
      question: request.message.trim(),
    },
    signal
  );
}

async function submitAnswer(
  request: TutorStreamRequest,
  signal: AbortSignal
) {
  return requestJson(
    '/lessons/answer',
    {
      student_id: request.studentId,
      answer: request.message.trim(),
    },
    signal
  );
}

function isMissingActiveSession(
  error: unknown
) {
  return (
    error instanceof TutorBrainRequestError &&
    error.statusCode === 400 &&
    /active lesson|active session|session is not active/i.test(
      error.message
    )
  );
}

function parseSession(
  value: unknown
): BrainSessionRecord {
  if (!isRecord(value)) {
    throw new TutorBrainRequestError(
      'The Tutor Brain response did not include a session.',
      'INVALID_BRAIN_SESSION'
    );
  }

  const sessionId = firstText(
    value.session_id
  );

  if (!sessionId) {
    throw new TutorBrainRequestError(
      'The Tutor Brain session has no identifier.',
      'INVALID_BRAIN_SESSION'
    );
  }

  return {
    session_id: sessionId,
    student_id: firstText(value.student_id),
    subject: firstText(value.subject),
    topic: firstText(value.topic),
    stage:
      firstText(value.stage) ||
      'socratic_scaffolding',
    status:
      firstText(value.status) ||
      'active',
  };
}

function buildReply(
  payload: JsonRecord
) {
  const message = firstText(
    payload.message
  );

  const question = firstText(
    payload.question_for_student
  );

  if (
    message &&
    question &&
    !message
      .toLocaleLowerCase()
      .includes(
        question.toLocaleLowerCase()
      )
  ) {
    return `${message}\n\n${question}`;
  }

  return message || question;
}

function buildRoadmap(
  topic: string,
  stage: string
): TutorTeachingDecision['roadmap'] {
  const stageOrder = [
    'socratic_scaffolding',
    'stress_testing',
    'reverse_teaching',
    'complete',
  ];

  const labels: Record<string, string> = {
    socratic_scaffolding:
      'Build understanding',
    stress_testing:
      'Apply independently',
    reverse_teaching:
      'Teach it back',
    complete:
      'Mastery confirmed',
  };

  const locatedIndex =
    stageOrder.indexOf(stage);

  const currentIndex =
    locatedIndex >= 0
      ? locatedIndex
      : 0;

  const phases = stageOrder.map(
    (key, index) => ({
      key,
      label: labels[key],
      status: (
        index < currentIndex
          ? 'complete'
          : index === currentIndex
            ? 'current'
            : 'upcoming'
      ) as
        | 'complete'
        | 'current'
        | 'upcoming',
    })
  );

  return {
    title: `${topic || 'Personal'} mastery lesson`,
    currentIndex,
    phases,
    successCriterion:
      'Explain the concept, pass a new example, and teach it back independently.',
    sessionMinutes: 20,
    pace: 'adaptive',
  };
}

function buildCompleteEvent(
  request: TutorStreamRequest,
  payload: JsonRecord
): CompleteEvent {
  if (payload.deliverable !== true) {
    throw new TutorBrainRequestError(
      'The Tutor Brain blocked an unsafe response.',
      'BRAIN_RESPONSE_BLOCKED'
    );
  }

  const session = parseSession(
    payload.session
  );

  const reply = buildReply(payload);

  if (!reply) {
    throw new TutorBrainRequestError(
      'The Tutor Brain returned an empty answer.',
      'INVALID_BRAIN_RESPONSE'
    );
  }

  const progress =
    isRecord(payload.progress)
      ? payload.progress
      : {};

  /*
   * A progress record means the mastery engine evaluated the answer.
   * Initial Socratic prompts may not yet contain such a record.
   */
  const grounded =
    isRecord(payload.progress);

  const score = finiteNumber(
    progress.score,
    0.5
  );

  const mastered =
    progress.mastered === true;

  const nextStage =
    firstText(
      progress.next_stage,
      session.stage
    ) || session.stage;

  const nextAction =
    firstText(
      progress.recommended_next_action,
      payload.question_for_student,
      mastered
        ? 'Continue to the next verified mastery stage.'
        : 'Continue the guided lesson.'
    );

  const now = new Date();
  const uniqueSuffix =
    `${now.getTime()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const teachingDecision:
    TutorTeachingDecision = {
      method: session.stage,
      reason:
        grounded
          ? 'The persistent Tutor Brain verified this step through its mastery evaluation pipeline.'
          : 'The persistent Tutor Brain selected a safe Socratic step for the active lesson.',
      difficulty:
        request.difficulty ??
        'adaptive',
      grounded,
      roadmap: buildRoadmap(
        session.topic ||
          request.topic ||
          request.subject,
        session.stage
      ),
    };

  return {
    type: 'complete',
    reply,
    conversationId:
      session.session_id,
    messageId:
      `brain-message-${uniqueSuffix}`,
    learningTwin: {
      topic:
        session.topic ||
        request.topic ||
        request.subject ||
        'General learning',
      skill:
        nextStage ||
        request.mode,
      misconception: '',
      nextAction,
      confidence: Math.max(
        0,
        Math.min(1, score)
      ),
      /*
       * The public Brain API intentionally returns a score rather
       * than claiming it is a change from the prior score.
       */
      masteryDelta: 0,
    },
    metadata: {
      provider: 'slickk-brain',
      model:
        'universal-tutor-brain-v1',
      requestId:
        `brain-request-${uniqueSuffix}`,
      generatedAt:
        now.toISOString(),
      grounded,
      teachingDecision,
    },
  };
}

export async function requestTutorBrainResponse(
  request: TutorStreamRequest,
  signal: AbortSignal
): Promise<CompleteEvent> {
  if (!request.message.trim()) {
    throw new TutorBrainRequestError(
      'The student message cannot be empty.',
      'EMPTY_STUDENT_MESSAGE'
    );
  }

  await registerStudent(
    request,
    signal
  );

  let payload: JsonRecord;

  if (request.conversationId) {
    try {
      payload = await submitAnswer(
        request,
        signal
      );
    } catch (error) {
      /*
       * The app may retain an old conversation ID after the Brain
       * service data is cleared. Start a fresh lesson only when the
       * server explicitly reports that no active session exists.
       */
      if (!isMissingActiveSession(error)) {
        throw error;
      }

      payload = await startLesson(
        request,
        signal
      );
    }
  } else {
    payload = await startLesson(
      request,
      signal
    );
  }

  return buildCompleteEvent(
    request,
    payload
  );
}
