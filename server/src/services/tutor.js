const {
  TUTOR_RESULT_JSON_SCHEMA,
  safelyParseTutorResult,
} = require('../contracts/tutor');
const {
  buildStreamingTutorSystemPrompt,
  buildTutorSystemPrompt,
} = require('../prompts/tutor');
const {
  generateTutorResult,
  streamTutorResult,
} = require('./ollama');

function normalizeHistory(recentMessages) {
  return recentMessages.map((message) => ({
    role: message.role === 'student' ? 'user' : 'assistant',
    content: (message.text || message.content).slice(0, 4000),
  }));
}

function buildMessages(requestData, history, streaming) {
  return [
    {
      role: 'system',
      content: streaming
        ? buildStreamingTutorSystemPrompt(requestData)
        : buildTutorSystemPrompt(requestData),
    },
    ...normalizeHistory(history),
    {
      role: 'user',
      content: requestData.message,
    },
  ];
}

async function askTutor(
  requestData,
  signal,
  history = requestData.recentMessages
) {
  const result = await generateTutorResult({
    messages: buildMessages(requestData, history, false),
    format: TUTOR_RESULT_JSON_SCHEMA,
    signal,
  });

  return {
    tutorResult: safelyParseTutorResult(result.content),
    metrics: result.metrics,
  };
}

async function streamTutor(
  requestData,
  signal,
  onToken,
  history = requestData.recentMessages
) {
  return streamTutorResult({
    messages: buildMessages(requestData, history, true),
    signal,
    onToken,
  });
}

function buildStreamingLearningTwin(requestData) {
  const modeToSkill = {
    adaptive: 'Guided reasoning',
    teach: 'Concept learning',
    hint: 'Hint-based problem solving',
    quiz: 'Knowledge checking',
    explain: 'Concept clarification',
  };

  return {
    topic: 'Current learning conversation',
    skill: modeToSkill[requestData.mode] || 'Guided reasoning',
    misconception: '',
    nextAction: 'Respond to the tutor’s checking question.',
    confidence: 0.5,
    masteryDelta: 0,
  };
}

module.exports = {
  askTutor,
  buildMessages,
  buildStreamingLearningTwin,
  normalizeHistory,
  streamTutor,
};
