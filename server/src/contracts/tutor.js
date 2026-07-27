const { z } = require('zod');

const { config } = require('../config');

const tutorModes = [
  'adaptive',
  'teach',
  'hint',
  'quiz',
  'explain',
];

const historyMessageSchema = z.object({
  role: z.enum(['student', 'tutor']),
  text: z.string().trim().min(1).max(4000),
});

const tutorRequestSchema = z.object({
  message: z.string().trim().min(1).max(12000),
  studentName: z.string().trim().min(1).max(80).default('Student'),
  studentId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default('local-student'),
  conversationId: z.string().uuid().optional(),
  grade: z.string().trim().min(1).max(80).default('General'),
  language: z.string().trim().min(1).max(50).default('English'),
  channel: z.enum(['typed', 'live']).default('typed'),
  mode: z.enum(tutorModes).default('adaptive'),
  recentMessages: z
    .array(historyMessageSchema)
    .max(30)
    .default([]),
});

const TUTOR_RESULT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'string',
      description: 'The concise teaching response shown to the student.',
    },
    topic: {
      type: 'string',
      description: 'The main learning topic.',
    },
    skill: {
      type: 'string',
      description: 'The specific skill currently being practised.',
    },
    misconception: {
      type: 'string',
      description:
        'A likely misconception, or an empty string when none is evident.',
    },
    nextAction: {
      type: 'string',
      description: 'One useful next learning action or checking question.',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    masteryDelta: {
      type: 'integer',
      minimum: -2,
      maximum: 3,
    },
  },
  required: [
    'reply',
    'topic',
    'skill',
    'misconception',
    'nextAction',
    'confidence',
    'masteryDelta',
  ],
};

function formatIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.join('.') || 'request',
    message: issue.message,
  }));
}

function parseTutorRequest(payload) {
  const result = tutorRequestSchema.safeParse(payload ?? {});

  if (!result.success) {
    return {
      success: false,
      issues: formatIssues(result.error.issues),
    };
  }

  return {
    success: true,
    data: {
      ...result.data,
      recentMessages: result.data.recentMessages.slice(
        -config.maxHistoryMessages
      ),
    },
  };
}

function cleanJsonText(rawText) {
  const withoutFences = String(rawText ?? '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = withoutFences.indexOf('{');
  const lastBrace = withoutFences.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1);
  }

  return withoutFences;
}

function limitedText(value, fallback, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  return value.trim().slice(0, maxLength);
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

function safelyParseTutorResult(rawText) {
  const fallbackReply =
    limitedText(rawText, 'Please ask your question another way.', 8000);

  try {
    const parsed = JSON.parse(cleanJsonText(rawText));

    return {
      reply: limitedText(parsed.reply, fallbackReply, 8000),
      topic: limitedText(
        parsed.topic,
        'General learning',
        120
      ),
      skill: limitedText(parsed.skill, 'Understanding', 120),
      misconception:
        typeof parsed.misconception === 'string'
          ? parsed.misconception.trim().slice(0, 500)
          : '',
      nextAction: limitedText(
        parsed.nextAction,
        'Continue learning',
        500
      ),
      confidence: clampNumber(
        parsed.confidence,
        0,
        1,
        0.5
      ),
      masteryDelta: Math.round(
        clampNumber(parsed.masteryDelta, -2, 3, 0)
      ),
    };
  } catch {
    return {
      reply: fallbackReply,
      topic: 'General learning',
      skill: 'Understanding',
      misconception: '',
      nextAction: 'Continue learning',
      confidence: 0.5,
      masteryDelta: 0,
    };
  }
}

module.exports = {
  TUTOR_RESULT_JSON_SCHEMA,
  cleanJsonText,
  parseTutorRequest,
  safelyParseTutorResult,
  tutorModes,
};
