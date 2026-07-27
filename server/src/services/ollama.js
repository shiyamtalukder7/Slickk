const { config } = require('../config');

class OllamaError extends Error {
  constructor(message, code, status = 503, details = undefined) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function nanosecondsToMilliseconds(value) {
  const nanoseconds = Number(value);

  if (!Number.isFinite(nanoseconds) || nanoseconds < 0) {
    return null;
  }

  return Math.round(nanoseconds / 1_000_000);
}

function calculateTokensPerSecond(tokenCount, duration) {
  const tokens = Number(tokenCount);
  const nanoseconds = Number(duration);

  if (
    !Number.isFinite(tokens) ||
    !Number.isFinite(nanoseconds) ||
    tokens <= 0 ||
    nanoseconds <= 0
  ) {
    return null;
  }

  return Number((tokens / (nanoseconds / 1_000_000_000)).toFixed(2));
}

function readMetrics(data) {
  return {
    totalMs: nanosecondsToMilliseconds(data?.total_duration),
    loadMs: nanosecondsToMilliseconds(data?.load_duration),
    promptTokens: Number(data?.prompt_eval_count) || 0,
    generatedTokens: Number(data?.eval_count) || 0,
    tokensPerSecond: calculateTokensPerSecond(
      data?.eval_count,
      data?.eval_duration
    ),
    doneReason:
      typeof data?.done_reason === 'string'
        ? data.done_reason
        : null,
  };
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const parentSignal = options.signal;
  const fetchOptions = { ...options };
  delete fetchOptions.signal;
  delete fetchOptions.timeoutMs;
  let timedOut = false;

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, {
      once: true,
    });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? config.requestTimeoutMs);

  try {
    const response = await fetch(`${config.ollamaUrl}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let data = {};

    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new OllamaError(
          'Ollama returned an unreadable response.',
          'INVALID_RESPONSE',
          502
        );
      }
    }

    if (!response.ok) {
      const ollamaMessage =
        typeof data?.error === 'string' ? data.error : '';
      const modelMissing =
        response.status === 404 ||
        /model.+(not found|does not exist)/i.test(ollamaMessage);

      throw new OllamaError(
        modelMissing
          ? `The Ollama model "${config.ollamaModel}" is not installed.`
          : ollamaMessage || 'Ollama could not complete the request.',
        modelMissing ? 'MODEL_NOT_FOUND' : 'OLLAMA_RESPONSE_ERROR',
        modelMissing ? 503 : 502,
        { ollamaStatus: response.status }
      );
    }

    return data;
  } catch (error) {
    if (error instanceof OllamaError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new OllamaError(
        timedOut
          ? 'The local tutor took too long to answer.'
          : 'The tutor request was cancelled.',
        timedOut ? 'OLLAMA_TIMEOUT' : 'REQUEST_CANCELLED',
        timedOut ? 504 : 499
      );
    }

    throw new OllamaError(
      'Slickk could not connect to Ollama.',
      'OLLAMA_UNREACHABLE',
      503,
      { cause: error?.message || String(error) }
    );
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener(
      'abort',
      abortFromParent
    );
  }
}

function normalizeModelNames(data) {
  if (!Array.isArray(data?.models)) {
    return [];
  }

  return data.models
    .map((model) => model?.name || model?.model)
    .filter((name) => typeof name === 'string');
}

function isConfiguredModelInstalled(modelNames) {
  return modelNames.some(
    (modelName) =>
      modelName === config.ollamaModel ||
      modelName.startsWith(`${config.ollamaModel}:`)
  );
}

async function checkOllamaHealth() {
  const data = await fetchJson('/api/tags', {
    timeoutMs: 5000,
  });
  const installedModels = normalizeModelNames(data);

  return {
    installedModels,
    modelInstalled: isConfiguredModelInstalled(installedModels),
  };
}

async function generateTutorResult({
  messages,
  format,
  signal,
}) {
  const data = await fetchJson('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      think: config.ollamaThink,
      format,
      keep_alive: config.ollamaKeepAlive,
      messages,
      options: {
        temperature: 0.25,
        top_p: 0.9,
        repeat_penalty: 1.08,
        num_ctx: config.numContext,
        num_predict: config.numPredict,
      },
    }),
  });

  const content = data?.message?.content?.trim();

  if (!content) {
    throw new OllamaError(
      'The local model returned an empty answer.',
      'EMPTY_RESPONSE',
      502
    );
  }

  return {
    content,
    metrics: readMetrics(data),
  };
}

module.exports = {
  OllamaError,
  calculateTokensPerSecond,
  checkOllamaHealth,
  generateTutorResult,
  isConfiguredModelInstalled,
  nanosecondsToMilliseconds,
  normalizeModelNames,
  readMetrics,
};
