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
  difficulty?: 'easy' | 'medium' | 'hard';
  performance?: number;
};

export type TutorTeachingDecision = {
  method: string;
  reason: string;
  difficulty: string;
  grounded: boolean;
  roadmap?: {
    title: string;
    currentIndex: number;
    phases: { key: string; label: string; status: 'complete' | 'current' | 'upcoming' }[];
    successCriterion: string;
    sessionMinutes: number;
    pace: string;
  };
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
    teachingDecision: TutorTeachingDecision;
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

const TUTOR_REPLY_KEYS = [
  'reply',
  'message',
  'content',
  'answer',
  'text',
] as const;

function stripTutorReplyFence(
  value: string
) {
  const trimmed = value.trim();

  const fenced = trimmed.match(
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i
  );

  return fenced?.[1]?.trim() ?? trimmed;
}

export function normalizeTutorReply(
  value: unknown
): string {
  let current: unknown = value;

  for (
    let depth = 0;
    depth < 5;
    depth += 1
  ) {
    if (typeof current === 'string') {
      const text =
        stripTutorReplyFence(current);

      if (!text) {
        return '';
      }

      const looksStructured =
        (
          text.startsWith('{') &&
          text.endsWith('}')
        ) ||
        (
          text.startsWith('[') &&
          text.endsWith(']')
        ) ||
        (
          text.startsWith('"') &&
          text.endsWith('"')
        );

      if (!looksStructured) {
        return text;
      }

      try {
        const parsed: unknown =
          JSON.parse(text);

        if (typeof parsed === 'string') {
          current = parsed;
          continue;
        }

        if (isRecord(parsed)) {
          const hasReplyField =
            TUTOR_REPLY_KEYS.some(
              (key) => key in parsed
            );

          if (hasReplyField) {
            current = parsed;
            continue;
          }
        }

        // Preserve legitimate JSON examples that
        // are not model-response wrappers.
        return text;
      } catch {
        return text;
      }
    }

    if (isRecord(current)) {
      const currentRecord = current;

      const nextKey =
        TUTOR_REPLY_KEYS.find(
          (key) => key in currentRecord
        );

      if (!nextKey) {
        return '';
      }

      current = currentRecord[nextKey];
      continue;
    }

    return '';
  }

  return typeof current === 'string'
    ? stripTutorReplyFence(current)
    : '';
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
  /*
   * Mind Right runtime enforcement lives in the authoritative
   * Slickk tutor gateway. Use this route exclusively so exact-answer
   * evaluation, conversation persistence, and Learning Twin evidence
   * cannot be bypassed by the legacy compatibility brain.
   */
  const authorizationHeaders =
    await getSlickkAuthorizationHeaders();

  const makeRequestBody = (
    includeConversationId: boolean,
    includeRecentMessages: boolean
  ) => {
    const currentMessage =
      request.message.trim();

    const sourceHistory =
      includeRecentMessages
        ? request.recentMessages
        : [];

    const recentMessages = sourceHistory
      .map((message) => ({
        role: message.role,
        text: message.text.trim(),
      }))
      .filter(
        (message) =>
          message.text &&
          message.text !==
            'Preparing a verified answer...' &&
          message.text !== 'Response stopped.' &&
          !message.text.startsWith(
            'Slickk could not finish'
          )
      );

    return {
      message: currentMessage,
      studentName: request.studentName,
      studentId: request.studentId,
      grade: request.grade,
      language: request.language,
      subject: request.subject,
      channel: request.channel,
      mode: request.mode,
      recentMessages,
      ...(
        includeConversationId &&
        request.conversationId
          ? {
              conversationId:
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
      getSlickkApiUrl('/api/tutor'),
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
    await sendTutorRequest(true, true);

  if (
    response.status === 400 &&
    request.conversationId
  ) {
    response =
      await sendTutorRequest(false, true);
  }

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

  const reply = normalizeTutorReply(
    firstText(
      data.reply,
      messageRecord.content,
      data.content,
      data.answer,
      data.text,
      data.message
    )
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

  const policyDecision = isRecord(responseMetadata.tutorDecision)
    ? responseMetadata.tutorDecision
    : {};
  const policyAction = isRecord(policyDecision.action) ? policyDecision.action : {};
  const roadmapRecord = isRecord(policyDecision.lessonRoadmap) ? policyDecision.lessonRoadmap : {};
  const roadmapPhases = Array.isArray(roadmapRecord.phases)
    ? roadmapRecord.phases.filter(isRecord).map((phase) => ({
        key: firstText(phase.key), label: firstText(phase.label),
        status: (['complete', 'current', 'upcoming'].includes(firstText(phase.status))
          ? firstText(phase.status) : 'upcoming') as 'complete' | 'current' | 'upcoming',
      })).filter((phase) => phase.key && phase.label)
    : [];

  const teachingDecision: TutorTeachingDecision = {
    method:
      firstText(
        policyAction.kind,
        tutorMetadata.teaching_method,
        request.mode
      ) || 'adaptive',
    reason:
      firstText(policyAction.instruction, tutorMetadata.teaching_reason) ||
      'Slickk selected this step from the learner profile and current question.',
    difficulty:
      firstText(
        tutorMetadata.difficulty,
        request.difficulty
      ) || 'medium',
    grounded,
    roadmap: roadmapPhases.length ? {
      title: firstText(roadmapRecord.title) || 'Personal lesson',
      currentIndex: typeof roadmapRecord.currentIndex === 'number' ? roadmapRecord.currentIndex : 0,
      phases: roadmapPhases,
      successCriterion: firstText(roadmapRecord.successCriterion) || 'Show independent understanding.',
      sessionMinutes: typeof roadmapRecord.sessionMinutes === 'number' ? roadmapRecord.sessionMinutes : 20,
      pace: firstText(roadmapRecord.pace) || 'standard',
    } : undefined,
  };

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
      teachingDecision,
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
