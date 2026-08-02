const { config } = require('../config');
const ollama = require('../services/ollama');

const SLICKK_LLM_IDENTITY = Object.freeze({
  id: 'slickk-llm',
  name: 'Slickk LLM',
  purpose: 'personalized-education',
  version: '1.0',
});

function createModelProvider(options = {}) {
  const kind = (
    options.kind ||
    config.modelProvider
  ).toLowerCase();

  if (kind !== 'ollama') {
    throw new Error(
      `Unsupported Slickk model provider "${kind}".`
    );
  }

  const adapter = options.adapter || {
    health: ollama.checkOllamaHealth,
    generate: ollama.generateTutorResult,
    stream: ollama.streamTutorResult,
  };
  const model = options.model || config.modelName;

  return Object.freeze({
    identity: SLICKK_LLM_IDENTITY,
    runtime: Object.freeze({
      provider: 'local-ollama',
      model,
      private: true,
    }),
    checkHealth: () => adapter.health(),
    generate: (request) => adapter.generate(request),
    stream: (request) => adapter.stream(request),
  });
}

function isModelProviderError(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      error.isModelProviderError === true
  );
}

const defaultModelProvider = createModelProvider();

module.exports = {
  SLICKK_LLM_IDENTITY,
  createModelProvider,
  defaultModelProvider,
  isModelProviderError,
};
