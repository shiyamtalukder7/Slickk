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
  const response = await expoFetch(
    getSlickkApiUrl('/api/tutor/stream'),
    {
      method: 'POST',
      headers: {
        Accept: 'application/x-ndjson',
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    throw await readHttpError(response);
  }

  if (!response.body) {
    throw new TutorStreamError(
      'Streaming is unavailable on this device.',
      'STREAM_UNAVAILABLE'
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completedEvent: CompleteEvent | null = null;

  const processLine = (line: string) => {
    if (!line.trim()) {
      return;
    }

    const event = parseStreamEvent(line);

    if (event.type === 'start') {
      callbacks.onStart?.(event);
      return;
    }

    if (event.type === 'token') {
      callbacks.onToken(event.content);
      return;
    }

    if (event.type === 'error') {
      throw new TutorStreamError(event.error, event.code);
    }

    completedEvent = event;
    callbacks.onComplete?.(event);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        processLine(line);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processLine(buffer);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const finalEvent =
    completedEvent as CompleteEvent | null;

  if (!finalEvent) {
    throw new TutorStreamError(
      'The tutor stream ended before the answer was complete.',
      'INCOMPLETE_STREAM'
    );
  }

  return finalEvent;
}
