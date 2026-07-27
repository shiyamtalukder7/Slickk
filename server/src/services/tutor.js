const {
  TUTOR_RESULT_JSON_SCHEMA,
  safelyParseTutorResult,
} = require('../contracts/tutor');
const { buildTutorSystemPrompt } = require('../prompts/tutor');
const { generateTutorResult } = require('./ollama');

function normalizeHistory(recentMessages) {
  return recentMessages.map((message) => ({
    role: message.role === 'student' ? 'user' : 'assistant',
    content: message.text.slice(0, 4000),
  }));
}

async function askTutor(requestData, signal) {
  const messages = [
    {
      role: 'system',
      content: buildTutorSystemPrompt(requestData),
    },
    ...normalizeHistory(requestData.recentMessages),
    {
      role: 'user',
      content: requestData.message,
    },
  ];

  const result = await generateTutorResult({
    messages,
    format: TUTOR_RESULT_JSON_SCHEMA,
    signal,
  });

  return {
    tutorResult: safelyParseTutorResult(result.content),
    metrics: result.metrics,
  };
}

module.exports = {
  askTutor,
  normalizeHistory,
};
