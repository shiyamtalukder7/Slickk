import { fetch as expoFetch } from 'expo/fetch';

import { getSlickkApiUrl } from '@/config/api';
import { getSlickkAuthorizationHeaders } from '@/services/api-auth';

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
    grounded: boolean;
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

function requiredString(
  record: Record<string, unknown>,
  key: string
) {
  const value = record[key];

  if (typeof value !== 'string' || !value.trim()) {
    throw new TutorStreamError(
      `The Slickk tutor response is missing ${key}.`,
      'INVALID_TUTOR_RESPONSE'
    );
  }

  return value.trim();
}

function finiteNumber(
  value: unknown,
  fallback: number
) {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' &&
    Number.isFinite(value)
    ? value
    : null;
}

function nullableString(value: unknown) {
  return typeof value === 'string'
    ? value
    : null;
}

function parseLearningTwin(
  value: unknown
): LearningTwin {
  if (!isRecord(value)) {
    throw new TutorStreamError(
      'The Slickk tutor returned an invalid Learning Twin.',
      'INVALID_TUTOR_RESPONSE'
    );
  }

  return {
    topic: requiredString(value, 'topic'),
    skill: requiredString(value, 'skill'),
    misconception:
      typeof value.misconception === 'string'
        ? value.misconception
        : '',
    nextAction: requiredString(value, 'nextAction'),
    confidence: finiteNumber(
      value.confidence,
      0.5
    ),
    masteryDelta: finiteNumber(
      value.masteryDelta,
      0
    ),
  };
}

function parsePerformance(
  value: unknown
): CompleteEvent['metadata']['performance'] {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    totalMs: nullableNumber(value.totalMs),
    loadMs: nullableNumber(value.loadMs),
    promptTokens: finiteNumber(
      value.promptTokens,
      0
    ),
    generatedTokens: finiteNumber(
      value.generatedTokens,
      0
    ),
    tokensPerSecond: nullableNumber(
      value.tokensPerSecond
    ),
    doneReason: nullableString(
      value.doneReason
    ),
  };
}

export async function streamTutorResponse(
  request: TutorStreamRequest,
  signal: AbortSignal,
  callbacks: StreamCallbacks
): Promise<CompleteEvent> {
  const authorizationHeaders =
    await getSlickkAuthorizationHeaders();

  const response = await expoFetch(
    getSlickkApiUrl('/api/tutor'),
    {
      method: 'POST',
      headers: {
        ...authorizationHeaders,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        message: request.message,
        studentName: request.studentName,
        studentId: request.studentId,
        ...(request.conversationId
          ? {
              conversationId:
                request.conversationId,
            }
          : {}),
        grade: request.grade,
        language: request.language,
        subject: request.subject,
        channel: request.channel,
        mode: request.mode,
        recentMessages: request.recentMessages,
      }),
    }
  );

  if (!response.ok) {
    throw await readHttpError(response);
  }

  const data: unknown = await response.json();

  if (
    !isRecord(data) ||
    !isRecord(data.metadata)
  ) {
    throw new TutorStreamError(
      'The Slickk tutor returned an invalid response.',
      'INVALID_TUTOR_RESPONSE'
    );
  }

  const metadata = data.metadata;
  const reply = requiredString(data, 'reply');
  const learningTwin = parseLearningTwin(
    data.learningTwin
  );

  const conversationId = requiredString(
    metadata,
    'conversationId'
  );
  const messageId = requiredString(
    metadata,
    'messageId'
  );
  const requestId = requiredString(
    metadata,
    'requestId'
  );
  const provider = requiredString(
    metadata,
    'provider'
  );
  const model = requiredString(
    metadata,
    'model'
  );
  const generatedAt = requiredString(
    metadata,
    'generatedAt'
  );

  const completedEvent: CompleteEvent = {
    type: 'complete',
    reply,
    conversationId,
    messageId,
    learningTwin,
    metadata: {
      provider,
      model,
      requestId,
      generatedAt,
      grounded:
        metadata.grounding === 'curriculum',
      performance: parsePerformance(
        metadata.performance
      ),
    },
  };

  callbacks.onStart?.({
    type: 'start',
    requestId,
    conversationId,
    model,
  });

  callbacks.onToken(reply);
  callbacks.onComplete?.(completedEvent);

  return completedEvent;
}
