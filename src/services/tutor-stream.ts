import { fetch as expoFetch } from 'expo/fetch';

import { getSlickkApiUrl } from '@/config/api';

export type TutorMode =
  | 'adaptive'
  | 'teach'
  | 'hint'
  | 'quiz'
  | 'explain';

export type TutorHistoryMessage = {
  role: 'student' | 'tutor';
  text: string;
};

export type LearningTwin = {
  topic: string;
  skill: string;
  misconception: string;
  nextAction: string;
  confidence: number;
  masteryDelta: number;
};

export type TutorStreamRequest = {
  message: string;
  studentName: string;
  studentId: string;
  conversationId?: string;
  grade: string;
  language: string;
  curriculum: string;
  subject: string;
  topic?: string;
  school?: string;
  channel: 'typed' | 'live';
  mode: TutorMode;
  recentMessages: TutorHistoryMessage[];
};

type StartEvent = {
  type: 'start';
  requestId: string;
  conversationId: string;
  model: string;
};

type TokenEvent = {
  type: 'token';
  content: string;
};

export type CompleteEvent = {
  type: 'complete';
  reply: string;
  conversationId: string;
  messageId: string;
  learningTwin: LearningTwin;
  metadata: {
    provider: string;
    model: string;
    requestId: string;
    generatedAt: string;
    performance?: {
      totalMs: number | null;
      loadMs: number | null;
      promptTokens: number;
      generatedTokens: number;
      tokensPerSecond: number | null;
      doneReason: string | null;
    };
  };
};

type ErrorEvent = {
  type: 'error';
  error: string;
  code: string;
  requestId?: string;
};

type TutorStreamEvent =
  | StartEvent
  | TokenEvent
  | CompleteEvent
  | ErrorEvent;

type StreamCallbacks = {
  onStart?: (event: StartEvent) => void;
  onToken: (token: string) => void;
  onComplete?: (event: CompleteEvent) => void;
};

export class TutorStreamError extends Error {
  code: string;

  constructor(
    message: string,
    code = 'TUTOR_STREAM_ERROR'
  ) {
    super(message);
    this.name = 'TutorStreamError';
    this.code = code;
  }
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseStreamEvent(line: string): TutorStreamEvent {
  let value: unknown;

  try {
    value = JSON.parse(line);
  } catch {
    throw new TutorStreamError(
      'Slickk received an unreadable stream event.',
      'INVALID_STREAM_EVENT'
    );
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new TutorStreamError(
      'Slickk received an incomplete stream event.',
      'INVALID_STREAM_EVENT'
    );
  }

  if (
    value.type === 'token' &&
    typeof value.content === 'string'
  ) {
    return {
      type: 'token',
      content: value.content,
    };
  }

  if (
    value.type === 'start' &&
    typeof value.requestId === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.model === 'string'
  ) {
    return value as StartEvent;
  }

  if (
    value.type === 'complete' &&
    typeof value.reply === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.messageId === 'string' &&
    isRecord(value.learningTwin) &&
    isRecord(value.metadata)
  ) {
    return value as CompleteEvent;
  }

  if (
    value.type === 'error' &&
    typeof value.error === 'string'
  ) {
    return {
      type: 'error',
      error: value.error,
      code:
        typeof value.code === 'string'
          ? value.code
          : 'TUTOR_STREAM_ERROR',
      requestId:
        typeof value.requestId === 'string'
          ? value.requestId
          : undefined,
    };
  }

  throw new TutorStreamError(
    'Slickk received an unsupported stream event.',
    'INVALID_STREAM_EVENT'
  );
}

async function readHttpError(response: Response) {
  try {
    const data: unknown = await response.json();

    if (isRecord(data)) {
      const message =
        typeof data.error === 'string'
          ? data.error
          : 'The tutor request failed.';
      const code =
        typeof data.code === 'string'
          ? data.code
          : `HTTP_${response.status}`;

      return new TutorStreamError(message, code);
    }
  } catch {
    // Use the status-based fallback below.
  }

  return new TutorStreamError(
    `The tutor request failed with status ${response.status}.`,
    `HTTP_${response.status}`
  );
}

export async function streamTutorResponse(
  request: TutorStreamRequest,
  signal: AbortSignal,
  callbacks: StreamCallbacks
): Promise<CompleteEvent> {
  const conversationId =
    request.conversationId ??
    `local-conversation-${Date.now()}`;

  const requestId = `tutor-request-${Date.now()}`;

  callbacks.onStart?.({
    type: 'start',
    requestId,
    conversationId,
    model: 'slickk-edu-local',
  });

  const messages = [
    ...request.recentMessages.map((message) => ({
      role:
        message.role === 'student'
          ? ('user' as const)
          : ('assistant' as const),
      content: message.text,
    })),
    {
      role: 'user' as const,
      content: request.message,
    },
  ];

  const response = await expoFetch(
    getSlickkApiUrl('/v1/tutor/chat'),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model: 'slickk-edu-local',
        student: {
          name: request.studentName,
          grade: request.grade,
          curriculum: request.curriculum,
          school: request.school,
        },
        language: request.language,
        subject: request.subject,
        topic:
          request.topic ??
          request.message.slice(0, 120),
        teaching_method: request.mode,
        max_tokens: 64,
        messages,
      }),
    }
  );

  if (!response.ok) {
    throw await readHttpError(response);
  }

  const data: unknown = await response.json();

  if (
    !isRecord(data) ||
    !isRecord(data.message) ||
    typeof data.message.content !== 'string'
  ) {
    throw new TutorStreamError(
      'The Slickk tutor returned an invalid response.',
      'INVALID_TUTOR_RESPONSE'
    );
  }

  const reply = data.message.content.trim();

  if (!reply) {
    throw new TutorStreamError(
      'The Slickk tutor returned an empty answer.',
      'EMPTY_TUTOR_RESPONSE'
    );
  }

  callbacks.onToken(reply);

  const tutorMetadata = isRecord(data.tutor)
    ? data.tutor
    : {};

  const model =
    typeof data.model === 'string'
      ? data.model
      : 'slickk-edu-local';

  const provider =
    typeof data.backend === 'string'
      ? data.backend
      : 'slickk-native';

  const messageId =
    typeof data.id === 'string'
      ? data.id
      : `tutor-message-${Date.now()}`;

  const topic =
    typeof tutorMetadata.topic === 'string'
      ? tutorMetadata.topic
      : request.message.slice(0, 120);

  const completedEvent: CompleteEvent = {
    type: 'complete',
    reply,
    conversationId,
    messageId,
    learningTwin: {
      topic,
      skill: request.mode,
      misconception: '',
      nextAction:
        'Continue the lesson and check the student?s understanding.',
      confidence: 0.5,
      masteryDelta: 0,
    },
    metadata: {
      provider,
      model,
      requestId,
      generatedAt: new Date().toISOString(),
    },
  };

  callbacks.onComplete?.(completedEvent);

  return completedEvent;
}

