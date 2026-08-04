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

async function readHttpError(
  response: Response
) {
  try {
    const data: unknown = await response.json();

    if (isRecord(data)) {
      const detail = data.detail;

      let detailMessage = '';

      if (typeof detail === 'string') {
        detailMessage = detail.trim();
      } else if (Array.isArray(detail)) {
        detailMessage = detail
          .map((item) => {
            if (typeof item === 'string') {
              return item.trim();
            }

            if (
              isRecord(item) &&
              typeof item.msg === 'string'
            ) {
              return item.msg.trim();
            }

            return '';
          })
          .filter(Boolean)
          .join('; ');
      }

      const firstText = (
        ...values: unknown[]
      ) => {
        for (const value of values) {
          if (
            typeof value === 'string' &&
            value.trim()
          ) {
            return value.trim();
          }
        }

        return '';
      };

      const message =
        firstText(
          data.error,
          data.message,
          detailMessage
        ) ||
        `The tutor request failed with status ${response.status}.`;

      const code =
        firstText(data.code) ||
        `HTTP_${response.status}`;

      return new TutorStreamError(
        message,
        code
      );
    }
  } catch {
    // Use the status-based fallback below.
  }

  return new TutorStreamError(
    `The tutor request failed with status ${response.status}.`,
    `HTTP_${response.status}`
  );
}

function parseLearningTwin(
  value: unknown
): LearningTwin {
  const record =
    isRecord(value)
      ? value
      : {};

  const textValue = (
    candidate: unknown,
    fallback: string
  ) =>
    typeof candidate === 'string' &&
    candidate.trim()
      ? candidate.trim()
      : fallback;

  const numberValue = (
    candidate: unknown,
    fallback: number
  ) =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate)
      ? candidate
      : fallback;

  return {
    topic: textValue(
      record.topic,
      'General learning'
    ),
    skill: textValue(
      record.skill,
      'adaptive'
    ),
    misconception: textValue(
      record.misconception,
      ''
    ),
    nextAction: textValue(
      record.nextAction,
      "Continue the lesson and check the student's understanding."
    ),
    confidence: numberValue(
      record.confidence,
      0.5
    ),
    masteryDelta: numberValue(
      record.masteryDelta,
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

  const numberOrZero = (
    candidate: unknown
  ) =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate)
      ? candidate
      : 0;

  const numberOrNull = (
    candidate: unknown
  ) =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate)
      ? candidate
      : null;

  const stringOrNull = (
    candidate: unknown
  ) =>
    typeof candidate === 'string' &&
    candidate.trim()
      ? candidate.trim()
      : null;

  return {
    totalMs: numberOrNull(
      value.totalMs
    ),
    loadMs: numberOrNull(
      value.loadMs
    ),
    promptTokens: numberOrZero(
      value.promptTokens
    ),
    generatedTokens: numberOrZero(
      value.generatedTokens
    ),
    tokensPerSecond: numberOrNull(
      value.tokensPerSecond
    ),
    doneReason: stringOrNull(
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

  const makeRequestBody = (
    includeConversationId: boolean,
    includeRecentMessages: boolean
  ) => {
    const currentMessage =
      request.message.trim();

    const completedHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
    }> = [];

    let pendingUser: {
      role: 'user';
      content: string;
    } | null = null;

    const sourceHistory =
      includeRecentMessages
        ? request.recentMessages
        : [];

    sourceHistory.forEach((message) => {
      const content = message.text.trim();

      if (
        !content ||
        content ===
          'Preparing a verified answer...' ||
        content === 'Response stopped.' ||
        content.startsWith(
          'Slickk could not finish'
        )
      ) {
        return;
      }

      if (message.role === 'student') {
        pendingUser = {
          role: 'user',
          content,
        };

        return;
      }

      if (pendingUser) {
        completedHistory.push(
          pendingUser,
          {
            role: 'assistant',
            content,
          }
        );

        pendingUser = null;
      }
    });

    return {
      model: 'slickk-edu-local',

      student: {
        name: request.studentName,
        id: request.studentId,
        grade: request.grade,
        curriculum: request.curriculum,
        ...(
          request.school
            ? {
                school: request.school,
              }
            : {}
        ),
      },

      language: request.language,
      subject: request.subject,

      topic:
        request.topic?.trim() ||
        currentMessage,

      teaching_method: request.mode,
      channel: request.channel,

      stream: false,
      max_tokens: 180,

      messages: [
        ...completedHistory,
        {
          role: 'user',
          content: currentMessage,
        },
      ],

      ...(
        includeConversationId &&
        request.conversationId
          ? {
              conversation_id:
                request.conversationId,
            }
          : {}
      ),
    };
  };

  const sendTutorRequest = (
    includeConversationId: boolean,
    includeRecentMessages: boolean
  ) =>
    expoFetch(
      getSlickkApiUrl('/v1/tutor/chat'),
      {
        method: 'POST',
        headers: {
          ...authorizationHeaders,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify(
          makeRequestBody(
            includeConversationId,
            includeRecentMessages
          )
        ),
      }
    );

  let response =
    await sendTutorRequest(false, true);

  if (
    response.status === 400 &&
    request.recentMessages.length > 0
  ) {
    response =
      await sendTutorRequest(false, false);
  }

  if (!response.ok) {
    throw await readHttpError(response);
  }

  const data: unknown = await response.json();

  if (!isRecord(data)) {
    throw new TutorStreamError(
      'The Slickk tutor returned an invalid response.',
      'INVALID_TUTOR_RESPONSE'
    );
  }

  const responseMetadata =
    isRecord(data.metadata)
      ? data.metadata
      : {};

  const tutorMetadata =
    isRecord(data.tutor)
      ? data.tutor
      : {};

  const messageRecord =
    isRecord(data.message)
      ? data.message
      : {};

  const firstText = (
    ...values: unknown[]
  ) => {
    for (const value of values) {
      if (
        typeof value === 'string' &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return '';
  };

  const reply = firstText(
    data.reply,
    messageRecord.content,
    data.content
  );

  if (!reply) {
    throw new TutorStreamError(
      'The Slickk tutor returned an empty or unreadable answer.',
      'INVALID_TUTOR_RESPONSE'
    );
  }

  const grounded =
    responseMetadata.grounded === true ||
    responseMetadata.grounding ===
      'curriculum' ||
    tutorMetadata.grounded === true;

  const learningTwinSource =
    isRecord(data.learningTwin)
      ? data.learningTwin
      : {
          topic:
            firstText(
              tutorMetadata.topic,
              request.topic,
              request.message
            ) ||
            'General learning',

          skill:
            firstText(
              tutorMetadata.teaching_mode,
              tutorMetadata.teaching_method,
              request.mode
            ) ||
            'adaptive',

          misconception: '',

          nextAction:
            grounded
              ? "Continue the lesson and check the student's understanding."
              : 'Upload verified lesson material before updating progress.',

          confidence:
            grounded
              ? 0.5
              : 0,

          masteryDelta: 0,
        };

  const learningTwin =
    parseLearningTwin(
      learningTwinSource
    );

  const conversationId =
    firstText(
      responseMetadata.conversationId,
      data.conversationId,
      data.conversation_id
    );

  const messageId =
    firstText(
      responseMetadata.messageId,
      data.id
    ) ||
    `tutor-message-${Date.now()}`;

  const requestId =
    firstText(
      responseMetadata.requestId,
      data.id
    ) ||
    `tutor-request-${Date.now()}`;

  const provider =
    firstText(
      responseMetadata.provider,
      data.backend
    ) ||
    'slickk-local';

  const model =
    firstText(
      responseMetadata.model,
      data.model
    ) ||
    'slickk-edu-local';

  let generatedAt =
    firstText(
      responseMetadata.generatedAt
    );

  if (
    !generatedAt &&
    typeof data.created === 'number' &&
    Number.isFinite(data.created)
  ) {
    generatedAt = new Date(
      data.created * 1000
    ).toISOString();
  }

  if (!generatedAt) {
    generatedAt =
      new Date().toISOString();
  }

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
      grounded,
      performance:
        parsePerformance(
          responseMetadata.performance
        ),
    },
  };

  if (conversationId) {
    callbacks.onStart?.({
      type: 'start',
      requestId,
      conversationId,
      model,
    });
  }

  callbacks.onToken(reply);
  callbacks.onComplete?.(completedEvent);

  return completedEvent;
}
